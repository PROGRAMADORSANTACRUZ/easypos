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
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));

router.get('/', wrap(async (req, res) => {
  const { clienteId, estado } = req.query;
  const where = {
    ...(clienteId && { clienteId: String(clienteId) }),
    ...(estado && { estado: String(estado) }),
  };
  res.json(await prisma.remision.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: { cliente: true },
    orderBy: { fecha: 'desc' },
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const r = await prisma.remision.findUnique({ where: { id: String(req.params.id) }, include: { cliente: true } });
  if (!r) return res.status(404).json({ error: 'Remisión no encontrada' });
  res.json(r);
}));

router.post('/', wrap(async (req, res) => {
  const { numero, clienteId, fecha, estado, observaciones } = req.body;
  const r = await prisma.remision.create({
    data: {
      numero: limpiar(numero),
      clienteId: clienteId ? String(clienteId) : null,
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
      ...(estado && { estado: String(estado) }),
      observaciones: limpiar(observaciones),
    },
    include: { cliente: true },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'remision', entidadId: r.id, detalle: r.numero || '' });
  res.status(201).json(r);
}));

router.put('/:id', wrap(async (req, res) => {
  const { numero, clienteId, fecha, estado, observaciones } = req.body;
  try {
    const r = await prisma.remision.update({
      where: { id: String(req.params.id) },
      data: {
        ...(numero !== undefined && { numero: limpiar(numero) }),
        ...(clienteId !== undefined && { clienteId: clienteId ? String(clienteId) : null }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
        ...(estado !== undefined && { estado: String(estado) }),
        ...(observaciones !== undefined && { observaciones: limpiar(observaciones) }),
      },
      include: { cliente: true },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'remision', entidadId: r.id });
    res.json(r);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Remisión no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.remision.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'remision', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Remisión no encontrada' });
    throw e;
  }
}));

export default router;
