import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));

router.get('/', wrap(async (req, res) => {
  const { facturaId, desde, hasta } = req.query;
  const where = { ...(facturaId && { facturaId: String(facturaId) }) };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999`);
  }
  const notas = await prisma.notaDebito.findMany({
    where,
    include: { factura: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(notas);
}));

router.get('/:id', wrap(async (req, res) => {
  const n = await prisma.notaDebito.findUnique({ where: { id: String(req.params.id) }, include: { factura: true } });
  if (!n) return res.status(404).json({ error: 'Nota débito no encontrada' });
  res.json(n);
}));

router.post('/', wrap(async (req, res) => {
  const { facturaId, numeroNota, motivo, total, estadoDIAN, fecha } = req.body;
  const n = await prisma.notaDebito.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      numeroNota: numeroNota ? String(numeroNota) : null,
      motivo: motivo ? String(motivo) : null,
      total: toNum(total),
      estadoDIAN: estadoDIAN ? String(estadoDIAN) : null,
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'nota_debito', entidadId: n.id, detalle: n.numeroNota || '' });
  res.status(201).json(n);
}));

router.put('/:id', wrap(async (req, res) => {
  const { facturaId, numeroNota, motivo, total, estadoDIAN, fecha } = req.body;
  try {
    const n = await prisma.notaDebito.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(numeroNota !== undefined && { numeroNota: numeroNota ? String(numeroNota) : null }),
        ...(motivo !== undefined && { motivo: motivo ? String(motivo) : null }),
        ...(total !== undefined && { total: toNum(total) }),
        ...(estadoDIAN !== undefined && { estadoDIAN: estadoDIAN ? String(estadoDIAN) : null }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'nota_debito', entidadId: n.id, detalle: n.numeroNota || '' });
    res.json(n);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Nota débito no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.notaDebito.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'nota_debito', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Nota débito no encontrada' });
    throw e;
  }
}));

export default router;
