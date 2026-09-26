import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const pad = (n) => String(n).padStart(2, '0');
const diaKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mesKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
// Semana ISO (ej: 2026-S32)
const semanaKey = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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

// Reporte completo de ventas (filtro opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
router.get('/', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const where = {};
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.createdAt.lte = new Date(`${hasta}T23:59:59.999`);
  }

  const facturas = await prisma.factura.findMany({
    where,
    include: {
      notasCredito: true,
      notasDebito: true,
      retenciones: true,
      pedido: {
        include: {
          mesa: true,
          mesera: true,
          items: { include: { producto: { include: { categoria: true, componentes: { include: { item: true } } } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Compras del mismo periodo (filtran por su propia fecha)
  const whereCompras = {};
  if (desde || hasta) {
    whereCompras.fecha = {};
    if (desde) whereCompras.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) whereCompras.fecha.lte = new Date(`${hasta}T23:59:59.999`);
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
        const monto = i >= 0 ? Number(parte.slice(i).replace(/[^\d]/g, '')) || 0 : 0;
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
    if (desde) where.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999`);
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
    if (desde) where.createdAt.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.createdAt.lte = new Date(`${hasta}T23:59:59.999`);
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

export default router;
