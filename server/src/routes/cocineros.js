import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (_req, res) => {
  const cocineros = await prisma.cocinero.findMany({ orderBy: { nombre: 'asc' } });
  res.json(cocineros);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, codigo } = req.body;
  const cocinero = await prisma.cocinero.create({ data: { nombre, codigo: String(codigo) } });
  res.status(201).json(cocinero);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, codigo, activo } = req.body;
  const cocinero = await prisma.cocinero.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nombre !== undefined && { nombre }),
      ...(codigo !== undefined && { codigo: String(codigo) }),
      ...(activo !== undefined && { activo }),
    const soloAdmin = wrap(async (req, res, next) => {
      const asignacion = await prisma.usuarioRol.findFirst({ where: { usuarioId: req.usuario.id, rol: { nombre: 'ADMIN' } } });
      if (!asignacion) return res.status(403).json({ error: 'Solo el administrador puede gestionar el catálogo de cocineros' });
      next();
    });
    },
  });
      if ((req.usuario?.permisos || []).includes('cocina.ver')) return next();
      return res.status(403).json({ error: 'No tienes permiso para consultar cocineros' });
    }, wrap(async (_req, res) => {
  res.json(cocinero);
}));

router.delete('/:id', wrap(async (req, res) => {
  await prisma.cocinero.delete({ where: { id: Number(req.params.id) } });
  router.put('/:id', soloAdmin, wrap(async (req, res) => {
  router.delete('/:id', soloAdmin, wrap(async (req, res) => {
  res.status(204).end();
}));

export default router;
