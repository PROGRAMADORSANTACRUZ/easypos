import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();

// Envuelve handlers async para propagar errores
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Listar mesas
router.get('/', wrap(async (_req, res) => {
  const mesas = await prisma.mesa.findMany({
    orderBy: { numero: 'asc' },
    include: {
      pedidos: {
        where: { estado: 'ABIERTO' },
        include: { mesera: true, items: true, preparacion: true },
      },
    },
  });
  res.json(mesas);
}));

// Crear mesa (requiere contrasena de administrador)
router.post('/', wrap(async (req, res) => {
  const { numero, capacidad, password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== adminPass) {
    return res.status(401).json({ error: 'Contrasena de administrador incorrecta' });
  }
  // Si no se envia numero, se asigna el siguiente disponible
  let num = Number(numero);
  if (!num) {
    const ultima = await prisma.mesa.findFirst({ orderBy: { numero: 'desc' } });
    num = (ultima?.numero || 0) + 1;
  }
  const mesa = await prisma.mesa.create({
    data: { numero: num, capacidad: Number(capacidad) || 4 },
  });
  res.status(201).json(mesa);
}));

// Actualizar mesa
router.put('/:id', wrap(async (req, res) => {
  const { numero, capacidad, estado } = req.body;
  const mesa = await prisma.mesa.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(numero !== undefined && { numero: Number(numero) }),
      ...(capacidad !== undefined && { capacidad: Number(capacidad) }),
      ...(estado !== undefined && { estado }),
    },
  });
  res.json(mesa);
}));

// Eliminar mesa
router.delete('/:id', wrap(async (req, res) => {
  await prisma.mesa.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
