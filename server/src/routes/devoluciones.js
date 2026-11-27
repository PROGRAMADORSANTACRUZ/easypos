// Devoluciones (total o parcial) de facturas. Cada una toma su numero del tipo de documento de clase DEVOLUCION
// (codigo 1NE en Siesa), reintegra el inventario y, si se devuelve en efectivo, saca el dinero de la caja abierta.
// El envio a Siesa lo hace el programador o el agente (siesaProgramador.js), igual que las ventas.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { filtroParesCentros } from '../centrosUsuario.js';
import { reservarNumeroDocumento } from '../numeracionDocumentos.js';
import { calcularInsumosRequeridos, revertirInsumos } from '../inventarioKits.js';
import { esMedioEfectivo } from '../pagosFactura.js';
import { armarLineasDevolucion, disponiblesPorLinea, mediosDeFactura, totalDevolucion } from '../devolucionesNucleo.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const CLASE_DEVOLUCION = 'DEVOLUCION';
const ORIGENES = ['factura', 'facturaVenta'];
const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const filtroCentros = (usuario) => filtroParesCentros(usuario?.centrosOperacion);
const documento = (d) => `${d.prefijo || d.tipoDocumentoCodigo || ''}${d.numeroFactura ?? d.numero}`;

async function buscarFactura(origen, id, usuario) {
  if (!ORIGENES.includes(origen)) return null;
  return prisma[origen].findFirst({
    where: { id: String(id), AND: [filtroCentros(usuario)] },
    include: { detalle: true },
  });
}

async function devueltoPorLinea(cliente, idsLineas) {
  const previas = idsLineas.length
    ? await cliente.devolucionDetalle.findMany({ where: { facturaDetalleId: { in: idsLineas } }, select: { facturaDetalleId: true, cantidad: true } })
    : [];
  const devuelto = new Map();
  for (const { facturaDetalleId, cantidad } of previas) devuelto.set(facturaDetalleId, (devuelto.get(facturaDetalleId) || 0) + cantidad);
  return devuelto;
}

async function aperturaActiva(usuarioId) {
  const propia = usuarioId && await prisma.aperturaCaja.findFirst({
    where: { estado: 'ABIERTA', usuarioId: String(usuarioId) }, orderBy: { fechaApertura: 'desc' },
  });
  return propia || prisma.aperturaCaja.findFirst({ where: { estado: 'ABIERTA' }, orderBy: { fechaApertura: 'desc' } });
}

const resumenFactura = (origen, f) => ({
  origen, id: f.id, documento: documento(f), prefijo: f.prefijo, numeroFactura: f.numeroFactura,
  tipoDocumentoCodigo: f.tipoDocumentoCodigo, companiaCodigo: f.companiaCodigo, centroOperacionCodigo: f.centroOperacionCodigo,
  fecha: f.createdAt, nombreCliente: f.nombreCliente, numeroDocumentoCliente: f.numeroDocumentoCliente,
  total: f.total, credito: Boolean(f.credito), estado: f.estado || null,
});

// Busca facturas por numero (con o sin prefijo) en los centros del usuario.
router.get('/facturas', wrap(async (req, res) => {
  const numero = Number(String(req.query.numero || '').replace(/\D/g, ''));
  if (!Number.isSafeInteger(numero) || numero <= 0) return res.status(400).json({ error: 'Escribe el número de la factura' });
  const resultados = [];
  for (const origen of ORIGENES) {
    const facturas = await prisma[origen].findMany({
      where: { numeroFactura: numero, AND: [filtroCentros(req.usuario)] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    resultados.push(...facturas.map((f) => resumenFactura(origen, f)));
  }
  res.json(resultados);
}));

// Detalle de una factura con lo que aun se puede devolver y los medios con que se pago.
router.get('/facturas/:origen/:id', wrap(async (req, res) => {
  const factura = await buscarFactura(req.params.origen, req.params.id, req.usuario);
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  const [devuelto, formas, anteriores] = await Promise.all([
    devueltoPorLinea(prisma, factura.detalle.map((linea) => linea.id)),
    prisma.formaPago.findMany({ where: { activo: true }, orderBy: { id: 'asc' }, select: { id: true, formaPago: true, formaPagoDian: true } }),
    prisma.devolucion.findMany({ where: { facturaId: factura.id }, orderBy: { createdAt: 'asc' }, select: { id: true, prefijo: true, numero: true, total: true, createdAt: true } }),
  ]);
  res.json({
    ...resumenFactura(req.params.origen, factura),
    lineas: disponiblesPorLinea(factura.detalle, devuelto).map((linea) => ({
      id: linea.id, productoId: linea.productoId, productoCodigo: linea.productoCodigo, productoNombre: linea.productoNombre,
      unidad: linea.unidad, cantidad: linea.cantidad, total: linea.total, devuelto: linea.devuelto, disponible: linea.disponible,
    })),
    mediosFactura: mediosDeFactura(factura),
    formasPago: formas.map((forma) => ({ ...forma, efectivo: esMedioEfectivo(forma.id, formas) })),
    devoluciones: anteriores,
  });
}));

router.get('/', wrap(async (req, res) => {
  const devoluciones = await prisma.devolucion.findMany({
    where: { AND: [filtroCentros(req.usuario)] },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { detalle: { select: { productoNombre: true, cantidad: true, unidad: true } } },
  });
  const logs = devoluciones.length ? await prisma.logIntegracion.findMany({
    where: { sistema: 'SIESA', tipo: { in: devoluciones.map(({ id }) => `DEVOLUCION:${id}`) } },
    orderBy: { fecha: 'asc' }, select: { tipo: true, estado: true, mensaje: true },
  }) : [];
  const siesa = new Map(logs.map((log) => [log.tipo.slice('DEVOLUCION:'.length), { estado: log.estado, mensaje: log.mensaje }]));
  res.json(devoluciones.map((d) => ({ ...d, siesa: siesa.get(d.id) || null })));
}));

// body: { origen, facturaId, items: [{ detalleId, cantidad }], formaPago, motivo }
router.post('/', wrap(async (req, res) => {
  const { origen, facturaId, items, formaPago: formaPedida, motivo: motivoPedido } = req.body || {};
  const motivo = String(motivoPedido || '').trim();
  if (motivo.length < 3) return res.status(400).json({ error: 'Escribe el motivo de la devolución' });
  if (motivo.length > 500) return res.status(400).json({ error: 'El motivo admite hasta 500 caracteres' });
  const factura = await buscarFactura(origen, facturaId, req.usuario);
  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
  if (factura.credito) return res.status(400).json({ error: 'Las facturas a crédito no se devuelven desde aquí: no hubo pago que reembolsar' });
  if (factura.estado && factura.estado !== 'FACTURADA') return res.status(400).json({ error: `La factura está ${String(factura.estado).toLowerCase()}` });

  const formas = await prisma.formaPago.findMany({ where: { activo: true }, select: { id: true, formaPagoDian: true } });
  const formaPago = String(formaPedida || '').trim().toUpperCase();
  if (!formas.some((forma) => forma.id === formaPago)) return res.status(400).json({ error: 'Elige un medio de pago activo para la devolución' });
  const efectivo = esMedioEfectivo(formaPago, formas);
  const apertura = efectivo ? await aperturaActiva(req.usuario?.id) : null;
  if (efectivo && !apertura) return res.status(409).json({ error: 'Abre la caja para devolver en efectivo' });

  let devolucion;
  try {
    devolucion = await prisma.$transaction(async (tx) => {
      // Se recalcula dentro de la transaccion: dos devoluciones simultaneas no pueden pasar de lo vendido
      const devuelto = await devueltoPorLinea(tx, factura.detalle.map((linea) => linea.id));
      const lineas = armarLineasDevolucion(factura.detalle, devuelto, items);
      const total = totalDevolucion(lineas);
      const reserva = await reservarNumeroDocumento(tx, CLASE_DEVOLUCION, {
        companiaCodigo: factura.companiaCodigo, centroOperacionCodigo: factura.centroOperacionCodigo,
      });
      const creada = await tx.devolucion.create({
        data: {
          companiaCodigo: factura.companiaCodigo,
          centroOperacionCodigo: factura.centroOperacionCodigo,
          tipoDocumentoCodigo: reserva.tipoDocumento,
          prefijo: reserva.prefijo,
          numero: reserva.numero,
          origen,
          facturaId: factura.id,
          facturaTipoDocumento: factura.tipoDocumentoCodigo,
          facturaPrefijo: factura.prefijo,
          facturaNumero: factura.numeroFactura,
          clienteId: factura.clienteId || null,
          numeroDocumentoCliente: factura.numeroDocumentoCliente || null,
          nombreCliente: factura.nombreCliente || null,
          direccionCliente: factura.direccionCliente || null,
          sucursalCliente: factura.sucursalCliente || null,
          formaPago,
          total,
          motivo,
          aperturaId: apertura?.id || null,
          usuarioId: req.usuario?.id || null,
          usuarioNombre: req.usuario?.nombre || null,
          detalle: { create: lineas },
        },
        include: { detalle: true },
      });
      const referencia = `Devolucion ${creada.prefijo}${creada.numero} de ${documento(factura)}`;

      // Los productos devueltos vuelven al inventario (insumos de su receta), como al cancelar un pedido
      const idsProductos = [...new Set(lineas.map((linea) => linea.productoId).filter(Boolean))];
      if (idsProductos.length) {
        const productos = await tx.producto.findMany({ where: { id: { in: idsProductos } }, include: { componentes: true } });
        const requeridos = calcularInsumosRequeridos(
          lineas.filter((linea) => linea.productoId).map((linea) => ({ productoId: linea.productoId, cantidad: linea.cantidad })),
          productos,
        );
        await revertirInsumos(tx, requeridos, { documentoReferencia: referencia });
      }
      if (efectivo) {
        await tx.movimientoCaja.create({
          data: { aperturaId: apertura.id, usuarioId: req.usuario?.id || null, tipo: 'EGRESO', monto: total, motivo: referencia.slice(0, 250) },
        });
      }
      return creada;
    }, { timeout: 15000 });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  const medioOriginal = mediosDeFactura(factura).includes(formaPago);
  await auditar({
    req, accion: 'CREAR', entidad: 'devolucion', entidadId: devolucion.id,
    detalle: `${devolucion.prefijo}${devolucion.numero} de ${documento(factura)} por ${devolucion.total} en ${formaPago}${medioOriginal ? '' : ' (medio distinto al de la factura)'}`,
  });
  res.status(201).json(devolucion);
}));

export default router;
