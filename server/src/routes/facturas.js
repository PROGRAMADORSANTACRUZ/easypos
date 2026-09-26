import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { crearFacturaFactus } from '../factus.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const redondear = (n) => Math.round(n * 100) / 100;

// Calcula la fecha de vencimiento sumando los dias de credito a hoy.
const calcularVence = (dias) => {
  const d = Number(dias);
  if (!d || d <= 0) return null;
  const f = new Date();
  f.setDate(f.getDate() + d);
  return f;
};

// Toma el siguiente numero de facturacion y lo incrementa de forma atomica.
// Prioriza el Tipo de documento activo (clase FACTURA), compartido por todas las cajas:
// el primero que graba bloquea la fila y toma el consecutivo, el siguiente continua.
// Si no hay tipo configurado, cae al comportamiento anterior con la resolucion DIAN vigente.
// Devuelve { prefijo, numeroFactura } o nulos si no hay numeracion disponible.
async function asignarNumeracion(tx) {
  const hoy = new Date();

  // 1) Tipo de documento activo de clase FACTURA (numeracion compartida entre cajas)
  const tipo = await tx.tipoDocumento.findFirst({
    where: { clase: 'FACTURA ELECTRONICA DE VENTA', activo: true },
    orderBy: { createdAt: 'asc' },
  });
  if (tipo) {
    // Si aun no se ha inicializado el proximo consecutivo, arranca desde el inicial (o 1).
    const proximo = tipo.consProximo != null ? tipo.consProximo : (tipo.consInicial != null ? tipo.consInicial : 1);
    if (tipo.consFinal == null || proximo <= tipo.consFinal) {
      // Incremento atomico: el UPDATE bloquea la fila y serializa las cajas concurrentes.
      const actualizado = await tx.tipoDocumento.update({
        where: { id: tipo.id },
        data: { consProximo: proximo + 1 },
      });
      const asignado = actualizado.consProximo - 1; // consecutivo tomado por esta factura
      return { prefijo: tipo.prefijo, numeroFactura: String(asignado) };
    }
  }

  // 2) Fallback: resolucion DIAN vigente (comportamiento anterior)
  // La resolucion mas reciente vigente tiene prioridad (orden determinista).
  const resoluciones = await tx.resolucionFacturacion.findMany({
    orderBy: { fechaInicio: { sort: 'desc', nulls: 'last' } },
  });
  const vigente = resoluciones.find((r) => {
    const iniOk = !r.fechaInicio || r.fechaInicio <= hoy;
    const finOk = !r.fechaFin || r.fechaFin >= hoy;
    const cupoOk = r.siguienteNumero != null && (r.rangoFinal == null || r.siguienteNumero <= r.rangoFinal);
    return iniOk && finOk && cupoOk;
  });
  if (!vigente) return { prefijo: null, numeroFactura: null };
  const numero = vigente.siguienteNumero;
  await tx.resolucionFacturacion.update({
    where: { id: vigente.id },
    data: { siguienteNumero: numero + 1n },
  });
  return { prefijo: vigente.prefijo, numeroFactura: String(numero) };
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
        detalle: { include: { producto: true } },
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
        detalle: { include: { producto: true } },
      },
    });
  }
}

// Listar facturas
// query ?electronica=false devuelve solo las ventas de "Factura de venta" (NO_APLICA, modulo aparte);
// por defecto (sin query) devuelve solo las facturas electronicas reales del modulo Facturacion.
router.get('/', wrap(async (req, res) => {
  const soloNoElectronicas = req.query.electronica === 'false';
  // OJO: en SQL, "columna <> 'X'" NO incluye filas NULL — hay que pedirlas aparte con OR,
  // si no, las facturas antiguas (sin estadoDIAN) quedan invisibles en el historial.
  const facturas = await prisma.factura.findMany({
    where: soloNoElectronicas
      ? { estadoDIAN: 'NO_APLICA' }
      : { OR: [{ estadoDIAN: { not: 'NO_APLICA' } }, { estadoDIAN: null }] },
    orderBy: { createdAt: 'desc' },
    include: {
      pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
      cliente: true,
      usuario: true,
      apertura: { include: { caja: true } },
      detalle: { include: { producto: true } },
      notasCredito: true,
      notasDebito: true,
      retenciones: true,
    },
  });
  res.json(facturas);
}));

router.get('/:id', wrap(async (req, res) => {
  const factura = await prisma.factura.findUnique({
    where: { id: String(req.params.id) },
    include: {
      pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
      cliente: true,
      usuario: true,
      apertura: { include: { caja: true } },
      detalle: { include: { producto: true } },
      notasCredito: true,
      notasDebito: true,
      retenciones: true,
    },
  });
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(factura);
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

// Facturar un pedido: el inventario ya se descontó al crear el pedido (cocina); aquí solo se cierra y cobra.
// body: { pedidoId, metodoPago?, clienteId?, credito?, creditoDias?, propina? }
router.post('/', wrap(async (req, res) => {
  const { pedidoId, metodoPago, clienteId, credito, creditoDias, propina } = req.body;
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

  const subtotal = redondear(pedido.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0));
  const impuesto = redondear(pedido.items.reduce((s, it) => s + (it.precioUnit * it.cantidad) * ((it.producto.iva || 0) / 100), 0));
  const total = redondear(subtotal + impuesto);
  const ivaPctPromedio = subtotal > 0 ? redondear((impuesto / subtotal) * 100) : 0;

  const cli = await resolverCliente(clienteId);

  const factura = await prisma.$transaction(async (tx) => {
    // Cerrar pedido, asignar cliente y liberar mesa (los domicilios no tienen mesa)
    await tx.pedido.update({ where: { id }, data: { estado: 'FACTURADO', cliente: cli.nombre, clienteId: cli.clienteId } });
    if (pedido.mesaId) {
      await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
    }
    // Numeracion DIAN segun resolucion vigente
    const num = await asignarNumeracion(tx);
    // Crear factura
    return tx.factura.create({
      data: {
        pedidoId: id,
        prefijo: num.prefijo,
        numeroFactura: num.numeroFactura,
        clienteId: cli.clienteId,
        usuarioId: req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null,
        subtotal,
        impuestoPct: ivaPctPromedio,
        impuesto,
        total,
        propina: Math.max(0, Number(propina) || 0),
        metodoPago: metodoPago || 'EFECTIVO',
        credito: !!credito,
        creditoDias: credito ? (Number(creditoDias) || null) : null,
        vence: credito ? calcularVence(creditoDias) : null,
        aperturaId: apertura.id,
        detalle: {
          create: pedido.items.map((it) => {
            const lineaSub = it.precioUnit * it.cantidad;
            const lineaIva = redondear(lineaSub * ((it.producto.iva || 0) / 100));
            return {
              productoId: it.productoId,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnit,
              iva: lineaIva,
              total: redondear(lineaSub + lineaIva),
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
  const facturaFinal = await emitirEnFactus(factura);
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

  const subtotal = redondear(items.reduce((s, i) => s + buscar(i.productoId).precio * (Number(i.cantidad) || 1), 0));
  const impuesto = redondear(items.reduce((s, i) => {
    const prod = buscar(i.productoId);
    return s + prod.precio * (Number(i.cantidad) || 1) * ((prod.iva || 0) / 100);
  }, 0));
  const total = redondear(subtotal + impuesto);
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
    const num = await asignarNumeracion(tx);
    return tx.factura.create({
      data: {
        pedidoId: pedido.id,
        prefijo: num.prefijo,
        numeroFactura: num.numeroFactura,
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
            const lineaIva = redondear(lineaSub * ((buscar(i.productoId).iva || 0) / 100));
            return {
              productoId: String(i.productoId),
              cantidad: cant,
              precioUnitario: precio,
              iva: lineaIva,
              total: redondear(lineaSub + lineaIva),
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
    return res.status(201).json(await prisma.factura.update({
      where: { id: factura.id },
      data: { estadoDIAN: 'NO_APLICA' },
      include: {
        pedido: { include: { mesa: true, mesera: true, items: { include: { producto: true } } } },
        cliente: true,
        usuario: true,
        apertura: { include: { caja: true } },
        detalle: { include: { producto: true } },
      },
    }));
  }
  const facturaFinal = await emitirEnFactus(factura);
  res.status(201).json(facturaFinal);
}));

export default router;
