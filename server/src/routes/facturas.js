import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { crearFacturaFactus } from '../factus.js';
import { reservarNumeroDocumento } from '../numeracionDocumentos.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const redondear = (n) => Math.round(n * 100) / 100;
export const impuestoSobrePrecio = (precio, porcentaje, incluido = false) =>
  redondear(precio * porcentaje / (incluido ? 100 + porcentaje : 100));

// Calcula la fecha de vencimiento sumando los dias de credito a hoy.
const calcularVence = (dias) => {
  const d = Number(dias);
  if (!d || d <= 0) return null;
  const f = new Date();
  f.setDate(f.getDate() + d);
  return f;
};

// Reserva el consecutivo del submodulo en la misma transaccion que crea la factura.
async function asignarNumeracion(tx, electronica = true) {
  const clase = electronica ? 'FACTURA ELECTRONICA DE VENTA' : 'FACTURA DE VENTA (NO ELECTRONICA)';
  const reserva = await reservarNumeroDocumento(tx, clase);
  return { ...reserva, numeroFactura: String(reserva.consecutivo) };
}

// Resuelve el cliente de una factura. Por defecto "Consumidor Final".
async function resolverCliente(clienteId) {
  if (clienteId == null || clienteId === '') return { clienteId: null, nombre: 'Consumidor Final' };
  const c = await prisma.cliente.findUnique({ where: { id: String(clienteId) } });
  if (!c) return { clienteId: null, nombre: 'Consumidor Final' };
  return { clienteId: c.id, nombre: c.razonSocial || c.nombre };
}

// Devuelve la apertura de caja ABIERTA (prefiere la del usuario). null si no hay ninguna.
async function aperturaActiva(usuarioId) {
  if (usuarioId) {
    const propia = await prisma.aperturaCaja.findFirst({
      where: { estado: 'ABIERTA', usuarioId: String(usuarioId) },
      orderBy: { fechaApertura: 'desc' },
    });
    if (propia) return propia;
  }
  return prisma.aperturaCaja.findFirst({ where: { estado: 'ABIERTA' }, orderBy: { fechaApertura: 'desc' } });
}

const redondearCentavos = (valor) => Math.round((Number(valor) || 0) * 100);
const desdeCentavos = (valor) => valor / 100;

function repartirCentavos(total, pesos) {
  const centavos = redondearCentavos(total);
  const pesoTotal = pesos.reduce((suma, peso) => suma + peso, 0);
  if (!pesoTotal) return pesos.map(() => 0);
  let asignado = 0;
  return pesos.map((peso, indice) => {
    if (indice === pesos.length - 1) return centavos - asignado;
    const parte = Math.round(centavos * peso / pesoTotal);
    asignado += parte;
    return parte;
  });
}

function calcularLineaPedido(item, electronica) {
  const totalLinea = redondear(item.precioUnit * item.cantidad);
  const impuesto = impuestoSobrePrecio(totalLinea, item.producto.iva || 0, !electronica);
  const subtotal = electronica ? totalLinea : redondear(totalLinea - impuesto);
  return { item, subtotal, impuesto, total: electronica ? redondear(subtotal + impuesto) : totalLinea };
}

export function crearPartesPedido(pedido, { modo, cantidadPartes, asignaciones, electronica, propina }) {
  const partes = Array.from({ length: cantidadPartes }, (_, indice) => ({
    numero: indice + 1,
    lineas: [],
    subtotal: 0,
    impuesto: 0,
    total: 0,
    propina: 0,
  }));
  const lineasBase = pedido.items.map((item) => calcularLineaPedido(item, electronica));

  if (modo === 'IGUALES') {
    for (const linea of lineasBase) {
      const subv = repartirCentavos(linea.subtotal, partes.map(() => 1));
      const ivav = repartirCentavos(linea.impuesto, partes.map(() => 1));
      partes.forEach((parte, indice) => {
        const subtotalParte = desdeCentavos(subv[indice]);
        const impuestoParte = desdeCentavos(ivav[indice]);
        const totalParte = redondear(subtotalParte + impuestoParte);
        parte.lineas.push({
          pedidoItemId: linea.item.id,
          productoId: linea.item.productoId,
          cantidad: linea.item.cantidad / partes.length,
          precioUnitario: linea.item.precioUnit,
          subtotal: subtotalParte,
          impuesto: impuestoParte,
          total: totalParte,
        });
        parte.subtotal += subtotalParte;
        parte.impuesto += impuestoParte;
        parte.total += totalParte;
      });
    }
  } else {
    const asignacionesMap = new Map((asignaciones || []).map((a) => [Number(a.pedidoItemId), a.cantidades]));
    for (const linea of lineasBase) {
      const cantidades = asignacionesMap.get(linea.item.id);
      if (!Array.isArray(cantidades) || cantidades.length !== cantidadPartes) {
        throw Object.assign(new Error('Asigna cada producto a una de las partes'), { status: 400 });
      }
      const cantidadesValidas = cantidades.map(Number);
      if (cantidadesValidas.some((cantidad) => !Number.isInteger(cantidad) || cantidad < 0)
        || cantidadesValidas.reduce((suma, cantidad) => suma + cantidad, 0) !== linea.item.cantidad) {
        throw Object.assign(new Error(`Las cantidades de ${linea.item.producto.nombre} no coinciden con el pedido`), { status: 400 });
      }
      const subv = repartirCentavos(linea.subtotal, cantidadesValidas);
      const ivav = repartirCentavos(linea.impuesto, cantidadesValidas);
      partes.forEach((parte, indice) => {
        const cantidad = cantidadesValidas[indice];
        if (!cantidad) return;
        const subtotalParte = desdeCentavos(subv[indice]);
        const impuestoParte = desdeCentavos(ivav[indice]);
        const totalParte = redondear(subtotalParte + impuestoParte);
        parte.lineas.push({
          pedidoItemId: linea.item.id,
          productoId: linea.item.productoId,
          cantidad,
          precioUnitario: linea.item.precioUnit,
          subtotal: subtotalParte,
          impuesto: impuestoParte,
          total: totalParte,
        });
        parte.subtotal += subtotalParte;
        parte.impuesto += impuestoParte;
        parte.total += totalParte;
      });
    }
  }

  const totalBase = partes.reduce((suma, parte) => suma + parte.total, 0);
  const propinas = repartirCentavos(propina, partes.map((parte) => parte.total || totalBase / cantidadPartes));
  partes.forEach((parte, indice) => {
    parte.subtotal = redondear(parte.subtotal);
    parte.impuesto = redondear(parte.impuesto);
    parte.total = redondear(parte.total);
    parte.propina = desdeCentavos(propinas[indice]);
  });
  if (partes.some((parte) => parte.total <= 0)) {
    throw Object.assign(new Error('Cada parte debe tener productos con valor mayor a cero'), { status: 400 });
  }
  return partes;
}

// Reporta la factura a Factus (DIAN); si falla, la venta local ya quedo hecha y solo se
// deja estadoDIAN en ERROR para reintentar despues, sin tumbar la respuesta al cajero.
async function emitirEnFactus(factura) {
  try {
    const resp = await crearFacturaFactus(factura);
    const data = resp.data || {};
    return prisma.factura.update({
      where: { id: factura.id },
      data: {
        cufe: data.cufe || null,
        numeroFactus: data.number || null,
        pdfPath: data.links?.public_url || null,
        estadoDIAN: 'ACEPTADA',
      },
      include: {
        pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
        cliente: true,
        usuario: true,
        apertura: { include: { caja: true } },
        detalle: { include: { producto: { include: { impuesto: true } } } },
      },
    });
  } catch (e) {
    console.error('Factus: fallo al emitir factura', factura.id, e.message, e.detalle);
    return prisma.factura.update({
      where: { id: factura.id },
      data: { estadoDIAN: 'ERROR' },
      include: {
        pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
        cliente: true,
        usuario: true,
        apertura: { include: { caja: true } },
        detalle: { include: { producto: { include: { impuesto: true } } } },
      },
    });
  }
}

// Listar facturas
// query ?electronica=false devuelve solo las ventas de "Factura de venta" (NO_APLICA, modulo aparte);
// por defecto (sin query) devuelve solo las facturas electronicas reales del modulo Facturacion.
router.get('/', wrap(async (req, res) => {
  const soloNoElectronicas = req.query.electronica === 'false';
  const include = {
    pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
    cliente: true,
    usuario: true,
    apertura: { include: { caja: true } },
    detalle: { include: { producto: { include: { impuesto: true } } } },
    tipoDocumento: true,
    compania: true,
    centroOperacion: true,
  };
  if (soloNoElectronicas) {
    const ventas = await prisma.facturaVenta.findMany({
      where: { estadoDIAN: 'NO_APLICA' },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return res.json(ventas.map((f) => ({ ...f, notasCredito: [], notasDebito: [], retenciones: [] })));
  }
  // OJO: en SQL, "columna <> 'X'" NO incluye filas NULL — hay que pedirlas aparte con OR,
  // si no, las facturas antiguas (sin estadoDIAN) quedan invisibles en el historial.
  const facturas = await prisma.factura.findMany({
    where: { OR: [{ estadoDIAN: { not: 'NO_APLICA' } }, { estadoDIAN: null }] },
    orderBy: { createdAt: 'desc' },
    include: {
      ...include,
      notasCredito: true,
      notasDebito: true,
      retenciones: true,
    },
  });
  res.json(facturas);
}));

router.get('/:id', wrap(async (req, res) => {
  const include = {
    pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
    cliente: true,
    usuario: true,
    apertura: { include: { caja: true } },
    detalle: { include: { producto: { include: { impuesto: true } } } },
    tipoDocumento: true,
    compania: true,
    centroOperacion: true,
  };
  const factura = await prisma.factura.findUnique({
    where: { id: String(req.params.id) },
    include: {
      ...include,
      notasCredito: true,
      notasDebito: true,
      retenciones: true,
    },
  });
  if (factura) return res.json(factura);
  const venta = await prisma.facturaVenta.findUnique({
    where: { id: String(req.params.id) },
    include,
  });
  if (venta) return res.json({ ...venta, notasCredito: [], notasDebito: [], retenciones: [] });
  return res.status(404).json({ error: 'Factura no encontrada' });
}));

// Reintenta el envío a Factus (DIAN) de una factura que quedó con estadoDIAN = 'ERROR' o sin reportar.
router.post('/:id/reenviar-dian', wrap(async (req, res) => {
  const factura = await prisma.factura.findUnique({
    where: { id: String(req.params.id) },
    include: { cliente: true, detalle: { include: { producto: true } } },
  });
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  const facturaFinal = await emitirEnFactus(factura);
  await auditar({ req, accion: 'EDITAR', entidad: 'factura', entidadId: factura.id, detalle: `Reenvio a Factus • ${facturaFinal.estadoDIAN}` });
  res.json(facturaFinal);
}));

// Divide una cuenta y factura cada parte o registra varios pagos en una sola factura.
router.post('/dividir', wrap(async (req, res) => {
  const {
    pedidoId, electronica = true, modo, cantidadPartes, asignaciones,
    emision = 'SEPARADAS', pagos = [], metodoPago = 'EFECTIVO', clienteId, propina = 0,
  } = req.body;
  const id = Number(pedidoId);
  const partesN = Number(cantidadPartes);
  if (!Number.isInteger(partesN) || partesN < 2 || partesN > 12) {
    return res.status(400).json({ error: 'La cuenta se puede dividir entre 2 y 12 personas' });
  }
  if (!['IGUALES', 'PRODUCTOS'].includes(modo)) return res.status(400).json({ error: 'Selecciona cómo dividir la cuenta' });
  if (!['UNA', 'SEPARADAS'].includes(emision)) return res.status(400).json({ error: 'Selecciona cómo generar las facturas' });
  if (electronica !== true && electronica !== false) return res.status(400).json({ error: 'Tipo de factura inválido' });
  if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(metodoPago)) return res.status(400).json({ error: 'Método de pago inválido' });

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { mesa: true, items: { include: { producto: true } } },
  });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.estado !== 'ABIERTO') return res.status(400).json({ error: 'El pedido no está abierto' });
  if (!pedido.items.length) return res.status(400).json({ error: 'El pedido no tiene productos' });
  const apertura = await aperturaActiva(req.headers['x-usuario-id']);
  if (!apertura) return res.status(409).json({ error: 'Debes abrir la caja antes de facturar' });

  const propinaTotal = electronica ? Math.max(0, Number(propina) || 0) : 0;
  let partes;
  try {
    partes = crearPartesPedido(pedido, { modo, cantidadPartes: partesN, asignaciones, electronica, propina: propinaTotal });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  const cliente = await resolverCliente(clienteId);
  if (!Array.isArray(pagos) || pagos.length !== partesN) {
    return res.status(400).json({ error: 'Registra un pago por cada persona' });
  }
  if (pagos.some((pago) => !['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(pago.formaPago)
    || !Number.isFinite(Number(pago.monto)) || Number(pago.monto) <= 0)) {
    return res.status(400).json({ error: 'Revisa los métodos y montos de pago' });
  }
  for (const [indice, pago] of pagos.entries()) {
    const esperado = partes[indice].total + partes[indice].propina;
    if (Math.abs(redondear(Number(pago.monto)) - redondear(esperado)) > 0.01) {
      return res.status(400).json({ error: `El pago de la parte ${indice + 1} debe ser ${esperado.toFixed(2)}` });
    }
  }

  const lineasFacturaUnica = pedido.items.map((item) => {
    const linea = calcularLineaPedido(item, electronica);
    return { pedidoItemId: item.id, productoId: item.productoId, cantidad: item.cantidad, precioUnitario: item.precioUnit, ...linea };
  });
  const partesFactura = emision === 'UNA'
    ? [{
        numero: 1,
        lineas: lineasFacturaUnica,
        subtotal: redondear(lineasFacturaUnica.reduce((suma, linea) => suma + linea.subtotal, 0)),
        impuesto: redondear(lineasFacturaUnica.reduce((suma, linea) => suma + linea.impuesto, 0)),
        total: redondear(lineasFacturaUnica.reduce((suma, linea) => suma + linea.total, 0)),
        propina: propinaTotal,
      }]
    : partes;
  const metodosPago = emision === 'UNA' ? [...new Set(pagos.map((pago) => pago.formaPago))].join(' + ') : null;
  const resumenDivision = partes.map((parte) => ({
    numero: parte.numero,
    productos: parte.lineas.map((linea) => ({ pedidoItemId: linea.pedidoItemId, cantidad: linea.cantidad })),
    subtotal: parte.subtotal,
    impuesto: parte.impuesto,
    total: parte.total,
    propina: parte.propina,
  }));

  const creadas = await prisma.$transaction(async (tx) => {
    const cerrado = await tx.pedido.updateMany({
      where: { id, estado: 'ABIERTO' },
      data: { estado: 'FACTURADO', cliente: cliente.nombre, clienteId: cliente.clienteId },
    });
    if (!cerrado.count) throw Object.assign(new Error('El pedido ya fue facturado'), { status: 409 });
    if (pedido.mesaId) await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });

    const division = await tx.divisionCuenta.create({
      data: { pedidoId: id, modo, emision, partes: resumenDivision },
    });
    const resultados = [];
    for (const parte of partesFactura) {
      const numero = await asignarNumeracion(tx, electronica);
      const modelo = electronica ? tx.factura : tx.facturaVenta;
      const pagosFactura = emision === 'UNA' ? pagos : [pagos[parte.numero - 1]];
      const basePago = pagosFactura.map((pago, indice) => ({
        formaPago: pago.formaPago,
        monto: emision === 'UNA' ? partes[indice].total : parte.total,
      }));
      const factura = await modelo.create({
        data: {
          pedidoId: id,
          divisionCuentaId: division.id,
          prefijo: numero.prefijo,
          numeroFactura: numero.numeroFactura,
          ...(!electronica && { estadoDIAN: 'NO_APLICA' }),
          tipoDocumentoId: numero.tipoDocumentoId,
          companiaCodigo: numero.companiaCodigo,
          centroOperacionCodigo: numero.centroOperacionCodigo,
          clienteId: cliente.clienteId,
          usuarioId: req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null,
          subtotal: parte.subtotal,
          impuestoPct: parte.subtotal > 0 ? redondear(parte.impuesto / parte.subtotal * 100) : 0,
          impuesto: parte.impuesto,
          total: parte.total,
          propina: parte.propina,
          metodoPago: emision === 'UNA' ? metodosPago : pagosFactura[0].formaPago,
          credito: false,
          aperturaId: apertura.id,
          pagos: { create: basePago },
          detalle: {
            create: parte.lineas.map((linea) => ({
              productoId: linea.productoId,
              companiaCodigo: numero.companiaCodigo,
              centroOperacionCodigo: numero.centroOperacionCodigo,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
              iva: linea.impuesto,
              total: electronica ? redondear(linea.subtotal + linea.impuesto) : linea.total,
            })),
          },
        },
        include: {
          pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
          cliente: true,
          usuario: true,
          apertura: { include: { caja: true } },
          detalle: { include: { producto: true } },
          pagos: true,
        },
      });
      resultados.push(factura);
    }
    return resultados;
  });

  const finales = [];
  for (const factura of creadas) {
    await auditar({ req, accion: 'FACTURAR', entidad: 'factura', entidadId: factura.id, detalle: `División pedido ${id} • total ${factura.total}` });
    finales.push(electronica ? await emitirEnFactus(factura) : factura);
  }
  res.status(201).json({ facturas: finales });
}));

// Facturar un pedido: el inventario ya se descontó al crear el pedido (cocina); aquí solo se cierra y cobra.
// body: { pedidoId, metodoPago?, clienteId?, credito?, creditoDias?, propina? }
router.post('/', wrap(async (req, res) => {
  const { pedidoId, metodoPago, clienteId, credito, creditoDias, propina, electronica } = req.body;
  const id = Number(pedidoId);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      items: { include: { producto: { include: { componentes: true } } } },
      factura: true,
    },
  });

  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.estado !== 'ABIERTO') return res.status(400).json({ error: 'El pedido no esta abierto' });
  if (pedido.items.length === 0) return res.status(400).json({ error: 'El pedido no tiene items' });

  // Debe existir una caja abierta (con base) para poder facturar y dar vueltos
  const apertura = await aperturaActiva(req.headers['x-usuario-id']);
  if (!apertura) return res.status(409).json({ error: 'Debes abrir la caja antes de facturar. Registra la base con la que inicias.' });

  const precioProductos = redondear(pedido.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0));
  const impuesto = redondear(pedido.items.reduce((s, it) => s + impuestoSobrePrecio(it.precioUnit * it.cantidad, it.producto.iva || 0, electronica === false), 0));
  const subtotal = electronica === false ? redondear(precioProductos - impuesto) : precioProductos;
  const total = electronica === false ? precioProductos : redondear(subtotal + impuesto);
  const ivaPctPromedio = subtotal > 0 ? redondear((impuesto / subtotal) * 100) : 0;

  const cli = await resolverCliente(clienteId);

  const factura = await prisma.$transaction(async (tx) => {
    // Cerrar pedido, asignar cliente y liberar mesa (los domicilios no tienen mesa)
    const cerrado = await tx.pedido.updateMany({
      where: { id, estado: 'ABIERTO' },
      data: { estado: 'FACTURADO', cliente: cli.nombre, clienteId: cli.clienteId },
    });
    if (!cerrado.count) throw Object.assign(new Error('El pedido ya fue facturado'), { status: 409 });
    if (pedido.mesaId) {
      await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
    }
    const num = await asignarNumeracion(tx, electronica !== false);
    // Crear factura
    const modeloFactura = electronica === false ? tx.facturaVenta : tx.factura;
    return modeloFactura.create({
      data: {
        pedidoId: id,
        prefijo: num.prefijo,
        numeroFactura: num.numeroFactura,
        ...(electronica === false && { estadoDIAN: 'NO_APLICA' }),
        tipoDocumentoId: num.tipoDocumentoId,
        companiaCodigo: num.companiaCodigo,
        centroOperacionCodigo: num.centroOperacionCodigo,
        clienteId: cli.clienteId,
        usuarioId: req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null,
        subtotal,
        impuestoPct: ivaPctPromedio,
        impuesto,
        total,
        propina: electronica === false ? 0 : Math.max(0, Number(propina) || 0),
        metodoPago: metodoPago || 'EFECTIVO',
        credito: !!credito,
        creditoDias: credito ? (Number(creditoDias) || null) : null,
        vence: credito ? calcularVence(creditoDias) : null,
        aperturaId: apertura.id,
        detalle: {
          create: pedido.items.map((it) => {
            const lineaSub = it.precioUnit * it.cantidad;
            const lineaIva = impuestoSobrePrecio(lineaSub, it.producto.iva || 0, electronica === false);
            return {
              productoId: it.productoId,
              companiaCodigo: num.companiaCodigo,
              centroOperacionCodigo: num.centroOperacionCodigo,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnit,
              iva: lineaIva,
              total: electronica === false ? redondear(lineaSub) : redondear(lineaSub + lineaIva),
            };
          }),
        },
      },
      include: {
        pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
        cliente: true,
        usuario: true,
        apertura: { include: { caja: true } },
        detalle: { include: { producto: true } },
      },
    });
  });

  await auditar({ req, accion: 'FACTURAR', entidad: 'factura', entidadId: factura.id, detalle: `Pedido ${id} • total ${factura.total}` });
  const facturaFinal = electronica === false ? factura : await emitirEnFactus(factura);
  res.status(201).json(facturaFinal);
}));

// Factura directa (venta en caja, sin mesa): crea el pedido ya facturado y descuenta inventario
// body: { items: [{ productoId, cantidad }], metodoPago?, clienteId?, credito?, creditoDias?, propina?, electronica? }
// electronica=false (ej. modulo "Factura de venta"): NO se reporta a Factus/DIAN, es solo un documento de venta interno.
router.post('/directa', wrap(async (req, res) => {
  const { items = [], metodoPago, clienteId, credito, creditoDias, propina, electronica } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agrega al menos un producto' });
  }

  // Debe existir una caja abierta (con base) para poder facturar y dar vueltos
  const apertura = await aperturaActiva(req.headers['x-usuario-id']);
  if (!apertura) return res.status(409).json({ error: 'Debes abrir la caja antes de facturar. Registra la base con la que inicias.' });

  const ids = items.map((i) => String(i.productoId));
  const productos = await prisma.producto.findMany({
    where: { id: { in: ids } },
    include: { componentes: true },
  });
  const buscar = (id) => productos.find((p) => p.id === String(id));
  for (const i of items) {
    if (!buscar(i.productoId)) return res.status(404).json({ error: `Producto ${i.productoId} no encontrado` });
  }

  // Insumos requeridos segun los kits
  const requeridos = new Map();
  for (const i of items) {
    const prod = buscar(i.productoId);
    const cant = Number(i.cantidad) || 1;
    for (const c of prod.componentes) {
      requeridos.set(c.itemId, (requeridos.get(c.itemId) || 0) + c.cantidad * cant);
    }
  }

  const insumos = await prisma.inventarioItem.findMany({ where: { id: { in: [...requeridos.keys()] } } });
  for (const insumo of insumos) {
    const req_ = requeridos.get(insumo.id) || 0;
    if (insumo.stock < req_) {
      return res.status(409).json({
        error: `Inventario insuficiente de "${insumo.nombre}" (disponible ${insumo.stock}, requerido ${req_})`,
      });
    }
  }

  const precioProductos = redondear(items.reduce((s, i) => s + buscar(i.productoId).precio * (Number(i.cantidad) || 1), 0));
  const impuesto = redondear(items.reduce((s, i) => {
    const prod = buscar(i.productoId);
    return s + impuestoSobrePrecio(prod.precio * (Number(i.cantidad) || 1), prod.iva || 0, electronica === false);
  }, 0));
  const subtotal = electronica === false ? redondear(precioProductos - impuesto) : precioProductos;
  const total = electronica === false ? precioProductos : redondear(subtotal + impuesto);
  const ivaPctPromedio = subtotal > 0 ? redondear((impuesto / subtotal) * 100) : 0;

  const cli = await resolverCliente(clienteId);

  const factura = await prisma.$transaction(async (tx) => {
    for (const [itemId, cantidad] of requeridos.entries()) {
      await tx.inventarioItem.update({ where: { id: itemId }, data: { stock: { decrement: cantidad } } });
    }
    const pedido = await tx.pedido.create({
      data: {
        cliente: cli.nombre,
        clienteId: cli.clienteId,
        estado: 'FACTURADO',
        items: {
          create: items.map((i) => ({
            productoId: String(i.productoId),
            cantidad: Number(i.cantidad) || 1,
            precioUnit: buscar(i.productoId).precio,
          })),
        },
      },
    });
    const num = await asignarNumeracion(tx, electronica !== false);
    const modeloFactura = electronica === false ? tx.facturaVenta : tx.factura;
    return modeloFactura.create({
      data: {
        pedidoId: pedido.id,
        prefijo: num.prefijo,
        numeroFactura: num.numeroFactura,
        ...(electronica === false && { estadoDIAN: 'NO_APLICA' }),
        tipoDocumentoId: num.tipoDocumentoId,
        companiaCodigo: num.companiaCodigo,
        centroOperacionCodigo: num.centroOperacionCodigo,
        clienteId: cli.clienteId,
        usuarioId: req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null,
        subtotal,
        impuestoPct: ivaPctPromedio,
        impuesto,
        total,
        propina: electronica === false ? 0 : Math.max(0, Number(propina) || 0),
        metodoPago: metodoPago || 'EFECTIVO',
        credito: !!credito,
        creditoDias: credito ? (Number(creditoDias) || null) : null,
        vence: credito ? calcularVence(creditoDias) : null,
        aperturaId: apertura.id,
        detalle: {
          create: items.map((i) => {
            const cant = Number(i.cantidad) || 1;
            const precio = buscar(i.productoId).precio;
            const lineaSub = precio * cant;
            const lineaIva = impuestoSobrePrecio(lineaSub, buscar(i.productoId).iva || 0, electronica === false);
            return {
              productoId: String(i.productoId),
              companiaCodigo: num.companiaCodigo,
              centroOperacionCodigo: num.centroOperacionCodigo,
              cantidad: cant,
              precioUnitario: precio,
              iva: lineaIva,
              total: electronica === false ? redondear(lineaSub) : redondear(lineaSub + lineaIva),
            };
          }),
        },
      },
      include: {
        pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
        cliente: true,
        usuario: true,
        apertura: { include: { caja: true } },
        detalle: { include: { producto: true } },
      },
    });
  });

  await auditar({ req, accion: 'FACTURAR', entidad: 'factura', entidadId: factura.id, detalle: `Venta directa • total ${factura.total}` });
  if (electronica === false) {
    return res.status(201).json(factura);
  }
  const facturaFinal = await emitirEnFactus(factura);
  res.status(201).json(facturaFinal);
}));

export default router;
