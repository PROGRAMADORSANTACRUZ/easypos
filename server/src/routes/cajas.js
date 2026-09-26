import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (_req, res) => {
  const cajas = await prisma.caja.findMany({ orderBy: { nombre: 'asc' } });
  res.json(cajas);
}));

router.get('/:id', wrap(async (req, res) => {
  const caja = await prisma.caja.findUnique({ where: { id: String(req.params.id) } });
  if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
  res.json(caja);
}));

router.post('/', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const caja = await prisma.caja.create({ data: { nombre } });
  await auditar({ req, accion: 'CREAR', entidad: 'caja', entidadId: caja.id, detalle: caja.nombre });
  res.status(201).json(caja);
}));

router.put('/:id', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const caja = await prisma.caja.update({ where: { id: String(req.params.id) }, data: { nombre } });
    await auditar({ req, accion: 'EDITAR', entidad: 'caja', entidadId: caja.id, detalle: caja.nombre });
    res.json(caja);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Caja no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.caja.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'caja', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Caja no encontrada' });
    throw e;
  }
}));

export default router;
