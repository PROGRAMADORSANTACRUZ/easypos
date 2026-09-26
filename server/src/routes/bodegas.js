import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (_req, res) => {
  const bodegas = await prisma.bodega.findMany({ orderBy: { nombre: 'asc' } });
  res.json(bodegas);
}));

router.get('/:id', wrap(async (req, res) => {
  const bodega = await prisma.bodega.findUnique({ where: { id: String(req.params.id) } });
  if (!bodega) return res.status(404).json({ error: 'Bodega no encontrada' });
  res.json(bodega);
}));

router.post('/', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const bodega = await prisma.bodega.create({ data: { nombre } });
  await auditar({ req, accion: 'CREAR', entidad: 'bodega', entidadId: bodega.id, detalle: bodega.nombre });
  res.status(201).json(bodega);
}));

router.put('/:id', wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const bodega = await prisma.bodega.update({ where: { id: String(req.params.id) }, data: { nombre } });
    await auditar({ req, accion: 'EDITAR', entidad: 'bodega', entidadId: bodega.id, detalle: bodega.nombre });
    res.json(bodega);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Bodega no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  await prisma.bodega.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'bodega', entidadId: id });
  res.status(204).end();
}));

export default router;
