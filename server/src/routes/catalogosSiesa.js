import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/paises', wrap(async (_req, res) => {
  res.json(await prisma.paisSiesa.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/departamentos', wrap(async (req, res) => {
  const paisCodigo = String(req.query.paisCodigo || '').trim();
  if (!paisCodigo) return res.status(400).json({ error: 'El código del país es obligatorio' });
  res.json(await prisma.departamentoSiesa.findMany({
    where: { paisCodigo },
    orderBy: { nombre: 'asc' },
  }));
}));

router.get('/ciudades', wrap(async (req, res) => {
  const departamentoCodigo = String(req.query.departamentoCodigo || '').trim();
  if (!departamentoCodigo) return res.status(400).json({ error: 'El código del departamento es obligatorio' });
  res.json(await prisma.ciudadSiesa.findMany({
    where: { departamentoCodigo },
    orderBy: { nombre: 'asc' },
  }));
}));

export default router;
