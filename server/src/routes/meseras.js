import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (_req, res) => {
  const meseras = await prisma.mesera.findMany({ orderBy: { nombre: 'asc' } });
  res.json(meseras);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, codigo } = req.body;
  const mesera = await prisma.mesera.create({ data: { nombre, codigo: String(codigo) } });
  res.status(201).json(mesera);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, codigo, activa } = req.body;
  const mesera = await prisma.mesera.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nombre !== undefined && { nombre }),
      ...(codigo !== undefined && { codigo: String(codigo) }),
      ...(activa !== undefined && { activa }),
    },
  });
  res.json(mesera);
}));

router.delete('/:id', wrap(async (req, res) => {
  await prisma.mesera.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
