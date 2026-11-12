import { Router } from 'express';
import { prisma } from '../prisma.js';
import { diaColombia, inicioDiaColombia, finDiaColombia } from '../fechaColombia.js';
import { filtroHistorialPedidos, estadoActualPedido, estadoAntesDeReenvio } from '../historialPedidos.js';
import { camposMetodoPago, camposValorPago, desglosarFactura } from '../pagosFactura.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const pad = (n) => String(n).padStart(2, '0');
const diaKey = diaColombia;
const mesKey = (d) => diaKey(d).slice(0, 7);
function rangoReporte(desde, hasta) {
  const valida = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    && !Number.isNaN(inicioDiaColombia(valor).getTime()) && diaColombia(inicioDiaColombia(valor)) === valor;
  if ((desde && !valida(desde)) || (hasta && !valida(hasta)) || (desde && hasta && desde > hasta)) {
    throw Object.assign(new Error('Selecciona un rango de fechas válido.'), { status: 400 });
  }
  return { ...(desde && { gte: inicioDiaColombia(desde) }), ...(hasta && { lt: finDiaColombia(hasta) }) };
}
// Semana ISO (ej: 2026-S32)
const semanaKey = (d) => {
  const [anio, mes, dia] = diaKey(d).split('-').map(Number);
  const date = new Date(Date.UTC(anio, mes - 1, dia));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-S${pad(week)}`;
};

// Acumula total y facturas por clave de periodo
function agruparPeriodo(facturas, claveFn) {
  const mapa = new Map();
  for (const f of facturas) {
    const clave = claveFn(new Date(f.createdAt));
    const acc = mapa.get(clave) || { clave, total: 0, facturas: 0 };
    acc.total += f.total;
    acc.facturas += 1;
    mapa.set(clave, acc);
  }
  return [...mapa.values()].sort((a, b) => (a.clave < b.clave ? 1 : -1));
}

// Agrupa productos vendidos por clave de periodo -> [{ nombre, cantidad, total }]
function productosPorPeriodo(facturas, claveFn) {
  const mapa = new Map(); // clave -> Map(nombre -> {cantidad,total})
  for (const f of facturas) {
    const clave = claveFn(new Date(f.createdAt));
    if (!mapa.has(clave)) mapa.set(clave, new Map());
    const prods = mapa.get(clave);
    for (const it of f.pedido?.items || []) {
      const nombre = it.producto?.nombre || 'Sin nombre';
      const acc = prods.get(nombre) || { nombre, cantidad: 0, total: 0 };
      acc.cantidad += it.cantidad;
      acc.total += it.precioUnit * it.cantidad;
      prods.set(nombre, acc);
    }
  }
  return [...mapa.entries()]
    .map(([clave, prods]) => ({
      clave,
      items: [...prods.values()].sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => (a.clave < b.clave ? 1 : -1));
}

router.get('/resumen-facturas-notas', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const rango = rangoReporte(desde, hasta);
  const seleccionFactura = {
    createdAt: true, subtotal: true, impuesto: true, total: true, propina: true, usuarioNombre: true,
    usuarioId: true, usuario: { select: { nombre: true } },
    apertura: { select: { caja: { select: { id: true, nombre: true } } } },
    tipoDocumento: { select: { clase: true } },
  };
  const [facturas, ventas, creditos, debitos] = await Promise.all([
    prisma.factura.findMany({ where: { createdAt: rango }, select: seleccionFactura }),
    prisma.facturaVenta.findMany({ where: { createdAt: rango }, select: seleccionFactura }),
    prisma.notaCredito.findMany({ where: { fecha: rango }, select: { fecha: true, total: true, factura: { select: seleccionFactura } } }),
    prisma.notaDebito.findMany({ where: { fecha: rango }, select: { fecha: true, total: true, factura: { select: seleccionFactura } } }),
  ]);
  const grupos = new Map();
  const agregar = (factura, fecha, tipo, valores) => {
    const cajero = factura?.usuario?.nombre || factura?.usuarioNombre || 'Sin cajero';
    const cajeroId = factura?.usuarioId || factura?.usuarioNombre || '';
    const caja = factura?.apertura?.caja;
    const fechaDia = diaColombia(fecha);
    const clave = JSON.stringify([cajeroId, caja?.id || '', fechaDia, tipo]);
    const fila = grupos.get(clave) || { cajeroId, cajero, cajaId: caja?.id || '', caja: caja?.nombre || 'Sin caja', fecha: fechaDia, tipo, bruto: 0, descuentos: null, impuestos: 0, neto: 0, propina: 0 };
    for (const campo of ['bruto', 'impuestos', 'neto', 'propina']) {
      fila[campo] = fila[campo] === null || valores[campo] === null
        ? null : Math.round((fila[campo] + valores[campo]) * 100) / 100;
    }
    grupos.set(clave, fila);
  };
  for (const factura of [...facturas, ...ventas]) {
    agregar(factura, factura.createdAt, factura.tipoDocumento?.clase || 'Factura sin tipo', {
      bruto: factura.subtotal, impuestos: factura.impuesto, neto: factura.total, propina: factura.propina,
    });
  }
  for (const [notas, tipo, signo] of [[creditos, 'Nota crédito', -1], [debitos, 'Nota débito', 1]]) {
    for (const nota of notas) {
      if (nota.total != null && (!Number.isFinite(nota.total) || nota.total < 0)) {
        throw Object.assign(new Error(`Hay una ${tipo.toLowerCase()} con un total inválido. Revisa las notas antes de generar el reporte.`), { status: 409 });
      }
      agregar(nota.factura, nota.fecha, tipo, {
        bruto: null, impuestos: null, neto: nota.total == null ? null : signo * nota.total, propina: null,
      });
    }
  }
  res.json([...grupos.values()].sort((a, b) => a.cajero.localeCompare(b.cajero)
    || a.cajeroId.localeCompare(b.cajeroId) || a.fecha.localeCompare(b.fecha)
    || a.caja.localeCompare(b.caja) || a.tipo.localeCompare(b.tipo)));
}));

router.get('/revision-diaria-pdv', wrap(async (req, res) => {
  const rango = rangoReporte(req.query.desde, req.query.hasta);
  const select = {
    id: true, createdAt: true, companiaCodigo: true, centroOperacionCodigo: true, prefijo: true, numeroFactura: true,
    total: true, propina: true, credito: true, metodoPago: true, usuarioNombre: true, usuarioId: true,
    ...Object.fromEntries([...camposMetodoPago, ...camposValorPago].map((campo) => [campo, true])),
    usuario: { select: { nombre: true } },
    apertura: { select: { caja: { select: { id: true, nombre: true } } } },
    pagos: { where: { formaPago: { not: null } }, select: { formaPago: true, monto: true } },
  };
  const [electronicas, ventas, formas] = await Promise.all([
    prisma.factura.findMany({ where: { createdAt: rango }, select }),
    prisma.facturaVenta.findMany({ where: { createdAt: rango }, select }),
    prisma.formaPago.findMany({ select: { id: true, formaPago: true } }),
  ]);
  const filas = [];
  for (const factura of [...electronicas, ...ventas]) {
    const esperado = factura.credito ? factura.propina : factura.total + factura.propina;
    if (!Number.isFinite(esperado) || esperado < 0) {
      throw Object.assign(new Error(`La factura ${factura.id} tiene un total inválido.`), { status: 409 });
    }
    let pagos = !factura.credito ? factura.pagos.map((pago) => ({ metodo: pago.formaPago, monto: pago.monto })) : [];
    if (pagos.some((pago) => !pago.metodo?.trim() || !Number.isFinite(pago.monto) || pago.monto <= 0)) {
      throw Object.assign(new Error(`La factura ${factura.id} tiene un pago registrado inválido.`), { status: 409 });
    }
    if (!pagos.length && esperado > 0) {
      const registrados = camposMetodoPago.flatMap((campo, indice) => {
        const metodo = factura[campo];
        const monto = factura[camposValorPago[indice]];
        return metodo && metodo !== '0' && Number(monto) > 0 ? [{ metodo, monto: Number(monto) }] : [];
      });
      const historicos = factura.credito ? [] : desglosarFactura(factura);
      const coincide = (partes) => partes.length > 0 && partes.every((parte) => parte.metodo && Number.isFinite(parte.monto) && parte.monto > 0)
        && Math.round(partes.reduce((suma, parte) => suma + parte.monto, 0) * 100) === Math.round(esperado * 100);
      pagos = coincide(registrados) ? registrados : coincide(historicos) ? historicos : [{ metodo: 'SIN DESGLOSE', monto: esperado }];
    }
    const acumulados = new Map();
    for (const pago of pagos) acumulados.set(pago.metodo, Math.round(((acumulados.get(pago.metodo) || 0) + pago.monto) * 100) / 100);
    for (const [metodo, monto] of acumulados) {
      const forma = formas.find((item) => item.id === metodo);
      filas.push({
        id: `${factura.id}:${metodo}`, cajeroId: factura.usuarioId || factura.usuarioNombre || '',
        cajero: factura.usuario?.nombre || factura.usuarioNombre || 'Sin cajero',
        fecha: diaColombia(factura.createdAt), compania: factura.companiaCodigo, centro: factura.centroOperacionCodigo,
        cajaId: factura.apertura?.caja?.id || '', caja: factura.apertura?.caja?.nombre || 'Sin caja',
        documento: `${factura.prefijo || ''}${factura.numeroFactura}`, medioId: metodo,
        medio: forma?.formaPago || metodo, moneda: 'COP', ingreso: null, egreso: null, neto: monto,
      });
    }
  }
  res.json(filas.sort((a, b) => a.cajero.localeCompare(b.cajero) || a.cajeroId.localeCompare(b.cajeroId)
    || a.medioId.localeCompare(b.medioId) || a.fecha.localeCompare(b.fecha) || a.documento.localeCompare(b.documento)));
}));

router.get('/movimientos-caja', wrap(async (req, res) => {
  const rango = rangoReporte(req.query.desde, req.query.hasta);
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { fecha: rango },
    select: {
      id: true, fecha: true, tipo: true, monto: true, motivo: true, usuarioId: true,
      usuario: { select: { usuario: true, nombre: true } },
      apertura: { select: { caja: { select: { id: true, nombre: true } } } },
    },
    orderBy: { fecha: 'desc' },
  });
  res.json(movimientos.map((movimiento) => ({
    id: movimiento.id, fecha: movimiento.fecha, tipo: movimiento.tipo, monto: movimiento.monto, motivo: movimiento.motivo,
    cajeroId: movimiento.usuarioId || '', cajero: movimiento.usuario?.nombre || movimiento.usuario?.usuario || 'Sin cajero',
    cajaId: movimiento.apertura?.caja?.id || '', caja: movimiento.apertura?.caja?.nombre || 'Sin caja',
  })));
}));

// Reporte completo de ventas (filtro opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
router.get('/', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const where = {};
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt.gte = inicioDiaColombia(desde);
    if (hasta) where.createdAt.lt = finDiaColombia(hasta);
  }

  const include = {
    pedido: {
      include: {
        mesa: true,
        mesera: true,
        items: { include: { producto: { include: { categoria: true, componentes: { include: { item: true } } } } } },
      },
    },
  };
  const [facturasElectronicas, facturasVenta] = await Promise.all([
    prisma.factura.findMany({
      where,
      include: { ...include, notasCredito: true, notasDebito: true, retenciones: true },
    }),
    prisma.facturaVenta.findMany({ where, include }),
  ]);
  const facturas = [
    ...facturasElectronicas,
    ...facturasVenta.map((f) => ({ ...f, notasCredito: [], notasDebito: [], retenciones: [] })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  // Compras del mismo periodo (filtran por su propia fecha)
  const whereCompras = {};
  if (desde || hasta) {
    whereCompras.fecha = {};
    if (desde) whereCompras.fecha.gte = inicioDiaColombia(desde);
    if (hasta) whereCompras.fecha.lt = finDiaColombia(hasta);
  }
  const compras = await prisma.compra.findMany({ where: whereCompras, include: { proveedor: true, detalle: { include: { item: true } } } });
  const totalCompras = compras.reduce((s, c) => s + (c.total || 0), 0);

  // Compras agrupadas por insumo (cantidad y costo del periodo)
  const comprasPorInsumo = new Map();
  for (const c of compras) {
    for (const d of c.detalle || []) {
      const nombre = d.item?.nombre || 'Sin insumo';
      const acc = comprasPorInsumo.get(nombre) || { nombre, cantidad: 0, costo: 0 };
      acc.cantidad += d.cantidad || 0;
      acc.costo += (d.cantidad || 0) * (d.costoUnitario || 0);
      comprasPorInsumo.set(nombre, acc);
    }
  }

  // Totales globales
  const totales = { total: 0, subtotal: 0, impuesto: 0, notasCredito: 0, notasDebito: 0, retenciones: 0, totalNeto: 0, facturas: facturas.length, unidades: 0 };
  const porCategoria = new Map();
  const porMesera = new Map();
  const porMesa = new Map();
  const porFormaPago = new Map();
  const gastoPorProducto = new Map(); // costo de insumos por producto vendido
  const gastoPorInsumo = new Map();   // consumo y costo por insumo
  const gastos = { totalGasto: 0, totalVenta: 0 };

  // Costo unitario de un producto = suma de (cantidad de receta × costo del insumo)
  const costoUnitario = (producto) =>
    (producto?.componentes || []).reduce((s, c) => s + (c.cantidad || 0) * (c.item?.costo || 0), 0);

  // Suma un monto a una forma de pago (normaliza el nombre)
  const sumarForma = (nombre, monto) => {
    const clave = (nombre || 'Sin especificar').trim().toUpperCase();
    const acc = porFormaPago.get(clave) || { nombre: clave, total: 0, facturas: 0 };
    acc.total += monto;
    acc.facturas += 1;
    porFormaPago.set(clave, acc);
  };

  for (const f of facturas) {
    totales.total += f.total;
    totales.subtotal += f.subtotal;
    totales.impuesto += f.impuesto;
    totales.notasCredito += (f.notasCredito || []).reduce((s, n) => s + (n.total || 0), 0);
    totales.notasDebito += (f.notasDebito || []).reduce((s, n) => s + (n.total || 0), 0);
    totales.retenciones += (f.retenciones || []).reduce((s, r) => s + (r.valor || 0), 0);

    // Forma(s) de pago: los pagos mixtos vienen como "EFECTIVO $13.000 + TARJETA $10.000"
    const mp = (f.metodoPago || '').trim();
    if (mp.includes('$')) {
      for (const parte of mp.split(' + ')) {
        const i = parte.indexOf('$');
        const metodo = (i >= 0 ? parte.slice(0, i) : parte).trim();
        const monto = i >= 0 ? Number(parte.slice(i).replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0;
        sumarForma(metodo, monto);
      }
    } else {
      sumarForma(mp || 'Sin especificar', f.total);
    }

    const meseraNombre = f.pedido?.mesera?.nombre || 'Sin mesera';
    const accM = porMesera.get(meseraNombre) || { nombre: meseraNombre, total: 0, facturas: 0 };
    accM.total += f.total;
    accM.facturas += 1;
    porMesera.set(meseraNombre, accM);

    const mesaNombre = f.pedido?.mesa ? `Mesa ${f.pedido.mesa.numero}` : 'Venta directa';
    const accMesa = porMesa.get(mesaNombre) || { nombre: mesaNombre, total: 0, facturas: 0, numero: f.pedido?.mesa?.numero ?? Infinity };
    accMesa.total += f.total;
    accMesa.facturas += 1;
    porMesa.set(mesaNombre, accMesa);

    for (const it of f.pedido?.items || []) {
      totales.unidades += it.cantidad;
      const catNombre = it.producto?.categoria?.nombre || 'Sin categoría';
      const accC = porCategoria.get(catNombre) || { nombre: catNombre, cantidad: 0, total: 0 };
      accC.cantidad += it.cantidad;
      accC.total += it.precioUnit * it.cantidad;
      porCategoria.set(catNombre, accC);

      // Gastos: costo de insumos según la receta del producto
      const cUnit = costoUnitario(it.producto);
      const cLinea = cUnit * it.cantidad;
      const vLinea = it.precioUnit * it.cantidad;
      gastos.totalGasto += cLinea;
      gastos.totalVenta += vLinea;

      const pNombre = it.producto?.nombre || 'Sin nombre';
      const accP = gastoPorProducto.get(pNombre) || { nombre: pNombre, unidades: 0, costoUnit: cUnit, costoTotal: 0, ventaTotal: 0 };
      accP.unidades += it.cantidad;
      accP.costoTotal += cLinea;
      accP.ventaTotal += vLinea;
      accP.costoUnit = cUnit;
      gastoPorProducto.set(pNombre, accP);

      // Consumo por insumo (con venta y ganancia atribuidas)
      const comps = it.producto?.componentes || [];
      for (const c of comps) {
        const iNombre = c.item?.nombre || 'Sin insumo';
        const costoComp = (c.cantidad || 0) * (c.item?.costo || 0) * it.cantidad;
        // Repartir la venta del producto entre sus insumos según su aporte de costo;
        // si el producto no tiene costo, se reparte en partes iguales.
        const proporcion = cLinea > 0 ? (costoComp / cLinea) : (comps.length ? 1 / comps.length : 0);
        const ventaComp = vLinea * proporcion;
        const accI = gastoPorInsumo.get(iNombre) || { nombre: iNombre, unidad: c.item?.unidad || '', cantidad: 0, costoTotal: 0, ventaTotal: 0 };
        accI.cantidad += (c.cantidad || 0) * it.cantidad;
        accI.costoTotal += costoComp;
        accI.ventaTotal += ventaComp;
        gastoPorInsumo.set(iNombre, accI);
      }
    }
  }

  res.json({
    totales: { ...totales, totalNeto: totales.total + totales.notasDebito - totales.notasCredito - totales.retenciones },
    ventasPorDia: agruparPeriodo(facturas, diaKey),
    ventasPorSemana: agruparPeriodo(facturas, semanaKey),
    ventasPorMes: agruparPeriodo(facturas, mesKey),
    productos: {
      dia: productosPorPeriodo(facturas, diaKey),
      semana: productosPorPeriodo(facturas, semanaKey),
      mes: productosPorPeriodo(facturas, mesKey),
    },
    porCategoria: [...porCategoria.values()].sort((a, b) => b.total - a.total),
    porMesera: [...porMesera.values()].sort((a, b) => b.total - a.total),
    porMesa: [...porMesa.values()].sort((a, b) => (a.numero - b.numero) || (b.total - a.total)),
    porFormaPago: [...porFormaPago.values()].sort((a, b) => b.total - a.total),
    // Detalle: una fila por factura con su número (el mismo que se imprime)
    detalle: facturas.map((f) => {
      const notasCredito = (f.notasCredito || []).reduce((s, n) => s + (n.total || 0), 0);
      const notasDebito = (f.notasDebito || []).reduce((s, n) => s + (n.total || 0), 0);
      const retenciones = (f.retenciones || []).reduce((s, r) => s + (r.valor || 0), 0);
      return {
        numero: f.numeroFactura ? `${f.prefijo || ''}${f.numeroFactura}` : f.id,
        fecha: f.createdAt,
        ubicacion: f.pedido?.mesa ? `Mesa ${f.pedido.mesa.numero}` : 'Directa',
        cliente: f.pedido?.cliente || 'Consumidor Final',
        formaPago: f.metodoPago || '',
        total: f.total,
        notasCredito,
        notasDebito,
        retenciones,
        totalNeto: f.total + notasDebito - notasCredito - retenciones,
      };
    }),
    // Gastos de insumos (costo de lo vendido) y utilidad
    gastos: {
      totalGasto: gastos.totalGasto,
      totalVenta: gastos.totalVenta,
      utilidad: gastos.totalVenta - gastos.totalGasto,
      margen: gastos.totalVenta > 0 ? ((gastos.totalVenta - gastos.totalGasto) / gastos.totalVenta) * 100 : 0,
      porProducto: [...gastoPorProducto.values()]
        .map((p) => ({ ...p, utilidad: p.ventaTotal - p.costoTotal }))
        .sort((a, b) => b.costoTotal - a.costoTotal),
      porInsumo: [...gastoPorInsumo.values()]
        .map((i) => ({ ...i, utilidad: i.ventaTotal - i.costoTotal }))
        .sort((a, b) => b.utilidad - a.utilidad),
    },
    // Compras a proveedores en el periodo
    compras: {
      total: totalCompras,
      cantidad: compras.length,
      detalle: compras
        .map((c) => ({ id: c.id, fecha: c.fecha, proveedor: c.proveedor?.nombre || 'Sin proveedor', subtotal: c.subtotal || 0, iva: c.iva || 0, total: c.total || 0 }))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
      porInsumo: [...comprasPorInsumo.values()].sort((a, b) => b.costo - a.costo),
    },
  });
}));

// Reporte de pedidos por mesa: quien tomo cada linea, a que hora, si fue editado y que cambio.
// Filtro opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/pedidos-mesa', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const where = {};
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = inicioDiaColombia(desde);
    if (hasta) where.fecha.lt = finDiaColombia(hasta);
  }
  const filas = await prisma.pedidoMesa.findMany({
    where,
    include: { mesa: true, mesera: true, producto: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(filas.map((f) => ({
    consecutivo: f.consecutivo,
    fecha: f.fecha,
    mesa: f.mesa?.numero ?? null,
    mesera: f.mesera?.nombre ?? null,
    producto: f.producto?.nombre ?? null,
    cantidad: f.cantidad,
    editado: f.editado,
    cambios: f.cambios,
    observaciones: f.observaciones,
  })));
}));

// Reporte de confirmaciones de cocina: a que hora se marco listo, quien lo preparo.
// Filtro opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/cocina', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const where = {};
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt.gte = inicioDiaColombia(desde);
    if (hasta) where.createdAt.lt = finDiaColombia(hasta);
  }
  const filas = await prisma.preparacionCocina.findMany({
    where,
    include: { mesa: true, cocinero: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(filas.map((f) => ({
    consecutivo: f.consecutivo,
    fecha: f.createdAt,
    mesa: f.mesa?.numero ?? null,
    productos: f.productos,
    cocinero: f.cocinero?.nombre ?? null,
    listo: f.listo,
    fechaListo: f.fechaListo,
  })));
}));

router.get('/historial-pedidos', wrap(async (req, res) => {
  const eventos = await prisma.pedidoEvento.findMany({
    where: filtroHistorialPedidos(req.query),
    include: { pedido: { select: { estado: true, preparacion: { select: { listo: true } } } } },
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
  });
  const normalizados = await Promise.all(eventos.map(async ({ pedido, ...evento }) => {
    let antes = evento.antes;
    const itemsAntes = evento.antes?.items || [];
    const itemsDespues = evento.despues?.items || [];
    const mismaFirma = (items) => JSON.stringify(items.map((item) => [item.id ?? item.productoId ?? item.nombre, item.cantidad]).sort());
    if (evento.accion === 'REENVIAR' && evento.detalle && mismaFirma(itemsAntes) === mismaFirma(itemsDespues)) {
      const reconstruido = await estadoAntesDeReenvio(prisma, evento.pedidoId, evento.despues, evento.id);
      if (mismaFirma(reconstruido?.items || []) !== mismaFirma(itemsDespues)) antes = reconstruido;
    }
    return { ...evento, antes, estado: estadoActualPedido(pedido) };
  }));
  res.json(normalizados);
}));

export default router;
