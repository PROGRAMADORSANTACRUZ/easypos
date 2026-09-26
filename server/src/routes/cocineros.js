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
    },
  });
  res.json(cocinero);
}));

router.delete('/:id', wrap(async (req, res) => {
  await prisma.cocinero.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
