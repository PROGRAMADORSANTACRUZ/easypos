import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requirePermission = (permission) => (req, res, next) => {
  if ((req.usuario?.permisos || []).includes(permission)) return next();
  return res.status(403).json({ error: 'No tienes permiso para consultar meseras' });
};
const soloAdmin = wrap(async (req, res, next) => {
  const asignacion = await prisma.usuarioRol.findFirst({ where: { usuarioId: req.usuario.id, rol: { nombre: 'ADMIN' } } });
  if (!asignacion) return res.status(403).json({ error: 'Solo el administrador puede gestionar el catálogo de meseras' });
  next();
});

router.get('/', requirePermission('pedidos.ver'), wrap(async (_req, res) => {
  const meseras = await prisma.mesera.findMany({ orderBy: { nombre: 'asc' } });
  res.json(meseras);
}));

router.post('/', soloAdmin, wrap(async (req, res) => {
  const { nombre, codigo } = req.body;
  const mesera = await prisma.mesera.create({ data: { nombre, codigo: String(codigo) } });
  res.status(201).json(mesera);
}));

router.put('/:id', soloAdmin, wrap(async (req, res) => {
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

router.delete('/:id', soloAdmin, wrap(async (req, res) => {
  await prisma.mesera.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
