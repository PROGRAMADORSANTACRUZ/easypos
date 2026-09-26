import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Lista de permisos, agrupables por modulo en el cliente
router.get('/', wrap(async (_req, res) => {
  const permisos = await prisma.permiso.findMany({
    orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
  });
  res.json(permisos);
}));

export default router;
