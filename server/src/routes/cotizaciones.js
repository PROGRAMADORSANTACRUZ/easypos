import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toInt = (v) => (v === undefined || v === null || v === '' ? null : parseInt(v, 10));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));

router.get('/', wrap(async (req, res) => {
  const { clienteId, estado } = req.query;
  const where = {
    ...(clienteId && { clienteId: String(clienteId) }),
    ...(estado && { estado: String(estado) }),
  };
  res.json(await prisma.cotizacion.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: { cliente: true, detalle: { include: { producto: true } } },
    orderBy: { fecha: 'desc' },
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await prisma.cotizacion.findUnique({
    where: { id: String(req.params.id) },
    include: { cliente: true, detalle: { include: { producto: true } } },
  });
  if (!c) return res.status(404).json({ error: 'Factura de venta no encontrada' });
  res.json(c);
}));

// Toma el siguiente consecutivo de la factura de venta (prefijo FDV). No es documento electronico.
async function siguienteConsecutivo(tx) {
  const ultima = await tx.cotizacion.findFirst({
    where: { consecutivo: { not: null } },
    orderBy: { consecutivo: 'desc' },
    select: { consecutivo: true },
  });
  return (ultima?.consecutivo || 0) + 1;
}

router.post('/', wrap(async (req, res) => {
  const { clienteId, fecha, validezDias, estado, observaciones, items } = req.body;
  const lineas = Array.isArray(items) ? items : [];
  const cot = await prisma.$transaction(async (tx) => {
    const consecutivo = await siguienteConsecutivo(tx);
    const prefijo = 'FDV';
    // Arma el detalle tomando el precio de venta actual del producto y su IVA.
    const detalleData = [];
    let subtotal = 0;
    let iva = 0;
    for (const it of lineas) {
      const prod = it.productoId ? await tx.producto.findUnique({ where: { id: String(it.productoId) } }) : null;
      const cantidad = toNum(it.cantidad) || 0;
      const precioUnitario = it.precioUnitario != null ? toNum(it.precioUnitario) : (prod?.precio || 0);
      const totalLinea = cantidad * precioUnitario;
      subtotal += totalLinea;
      iva += totalLinea * ((prod?.iva || 0) / 100);
      detalleData.push({ productoId: it.productoId ? String(it.productoId) : null, cantidad, precioUnitario, total: totalLinea });
    }
    return tx.cotizacion.create({
      data: {
        numero: `${prefijo}${consecutivo}`,
        prefijo,
        consecutivo,
        clienteId: clienteId ? String(clienteId) : null,
        ...(toDate(fecha) && { fecha: toDate(fecha) }),
        validezDias: toInt(validezDias),
        subtotal,
        iva,
        total: subtotal + iva,
        ...(estado && { estado: String(estado) }),
        observaciones: limpiar(observaciones),
        detalle: { create: detalleData },
      },
      include: { cliente: true, detalle: { include: { producto: true } } },
    });
  });
  await auditar({ req, accion: 'CREAR', entidad: 'cotizacion', entidadId: cot.id, detalle: `${cot.numero} • total ${cot.total ?? ''}` });
  res.status(201).json(cot);
}));

router.put('/:id', wrap(async (req, res) => {
  const { numero, clienteId, fecha, validezDias, subtotal, iva, total, estado, observaciones } = req.body;
  try {
    const c = await prisma.cotizacion.update({
      where: { id: String(req.params.id) },
      data: {
        ...(numero !== undefined && { numero: limpiar(numero) }),
        ...(clienteId !== undefined && { clienteId: clienteId ? String(clienteId) : null }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
        ...(validezDias !== undefined && { validezDias: toInt(validezDias) }),
        ...(subtotal !== undefined && { subtotal: toNum(subtotal) }),
        ...(iva !== undefined && { iva: toNum(iva) }),
        ...(total !== undefined && { total: toNum(total) }),
        ...(estado !== undefined && { estado: String(estado) }),
        ...(observaciones !== undefined && { observaciones: limpiar(observaciones) }),
      },
      include: { cliente: true },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'cotizacion', entidadId: c.id });
    res.json(c);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Factura de venta no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.cotizacion.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'cotizacion', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Factura de venta no encontrada' });
    throw e;
  }
}));

export default router;
