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
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));
const conRelaciones = { factura: true, metodoPago: true };

router.get('/', wrap(async (req, res) => {
  const { facturaId, metodoPagoId } = req.query;
  const where = {
    ...(facturaId && { facturaId: String(facturaId) }),
    ...(metodoPagoId && { metodoPagoId: String(metodoPagoId) }),
  };
  res.json(await prisma.pago.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
    orderBy: { fecha: 'desc' },
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const p = await prisma.pago.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!p) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json(p);
}));

router.post('/', wrap(async (req, res) => {
  const { facturaId, metodoPagoId, monto, referencia, fecha } = req.body;
  const p = await prisma.pago.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      metodoPagoId: metodoPagoId ? String(metodoPagoId) : null,
      monto: toNum(monto) ?? 0,
      referencia: limpiar(referencia),
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
    include: conRelaciones,
  });
  await auditar({ req, accion: 'CREAR', entidad: 'pago', entidadId: p.id, detalle: `Monto ${p.monto}` });
  res.status(201).json(p);
}));

router.put('/:id', wrap(async (req, res) => {
  const { facturaId, metodoPagoId, monto, referencia, fecha } = req.body;
  try {
    const p = await prisma.pago.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(metodoPagoId !== undefined && { metodoPagoId: metodoPagoId ? String(metodoPagoId) : null }),
        ...(monto !== undefined && { monto: toNum(monto) ?? 0 }),
        ...(referencia !== undefined && { referencia: limpiar(referencia) }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'pago', entidadId: p.id });
    res.json(p);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Pago no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.pago.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'pago', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Pago no encontrado' });
    throw e;
  }
}));

export default router;
