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

router.post('/:id/reservar', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const nombre = String(req.body?.nombre || '').trim();
  const telefono = String(req.body?.telefono || '').trim();
  const fechaHora = new Date(req.body?.fechaHora);
  const personas = Number(req.body?.personas);
  const notas = String(req.body?.notas || '').trim();
  const itemsReserva = req.body?.items ?? [];
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre de la reserva' });
  if (!Number.isFinite(fechaHora.getTime()) || fechaHora <= new Date()) {
    return res.status(400).json({ error: 'La fecha y hora deben ser futuras' });
  }

  const mesa = await prisma.mesa.findUnique({ where: { id } });
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
  if (mesa.estado !== 'LIBRE') return res.status(409).json({ error: `La mesa ${mesa.numero} no está disponible para reservar` });
  if (!Number.isInteger(personas) || personas < 1 || personas > mesa.capacidad) {
    return res.status(400).json({ error: `La cantidad de personas debe estar entre 1 y ${mesa.capacidad}` });
  }
  if (!Array.isArray(itemsReserva) || itemsReserva.length > 100
    || itemsReserva.some((item) => !item?.productoId || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1)) {
    return res.status(400).json({ error: 'El prepedido de la reserva no es válido' });
  }
  const productosReserva = itemsReserva.length
    ? await prisma.producto.findMany({ where: { id: { in: [...new Set(itemsReserva.map((item) => String(item.productoId)))] } } })
    : [];
  if (productosReserva.length !== new Set(itemsReserva.map((item) => String(item.productoId))).size) {
    return res.status(400).json({ error: 'Uno o más productos de la reserva ya no existen' });
  }
  const reservaItems = itemsReserva.map((item) => ({
    productoId: String(item.productoId),
    productoNombre: productosReserva.find((producto) => producto.id === String(item.productoId)).nombre,
    cantidad: Number(item.cantidad),
    notas: String(item.notas || '').trim() || null,
  }));

  const ocupada = await prisma.pedido.findFirst({ where: { mesaId: id, estado: 'ABIERTO' }, select: { id: true } });
  if (ocupada) return res.status(409).json({ error: 'La mesa tiene un pedido abierto' });

  const actualizada = await prisma.mesa.updateMany({
    where: { id, estado: 'LIBRE' },
    data: {
      estado: 'RESERVADA',
      reservaNombre: nombre,
      reservaTelefono: telefono || null,
      reservaFechaHora: fechaHora,
      reservaPersonas: personas,
      reservaNotas: notas || null,
      reservaItems,
    },
  });
  if (!actualizada.count) return res.status(409).json({ error: 'La mesa dejó de estar disponible' });
  res.json(await prisma.mesa.findUnique({ where: { id } }));
}));

router.post('/:id/cancelar-reserva', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const actualizada = await prisma.mesa.updateMany({
    where: { id, estado: 'RESERVADA' },
    data: {
      estado: 'LIBRE',
      reservaNombre: null,
      reservaTelefono: null,
      reservaFechaHora: null,
      reservaPersonas: null,
      reservaNotas: null,
      reservaItems: null,
    },
  });
  if (!actualizada.count) return res.status(404).json({ error: 'La mesa no tiene una reserva activa' });
  res.json(await prisma.mesa.findUnique({ where: { id } }));
}));

// Actualizar mesa
router.put('/:id', wrap(async (req, res) => {
  const { numero, capacidad, estado } = req.body;
  if (estado !== undefined && !['LIBRE', 'OCUPADA'].includes(estado)) {
    return res.status(400).json({ error: 'El estado RESERVADA se gestiona desde el flujo de reservas' });
  }
  const mesa = await prisma.mesa.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(numero !== undefined && { numero: Number(numero) }),
      ...(capacidad !== undefined && { capacidad: Number(capacidad) }),
      ...(estado !== undefined && { estado }),
      ...(estado !== undefined && {
        reservaNombre: null,
        reservaTelefono: null,
        reservaFechaHora: null,
        reservaPersonas: null,
        reservaNotas: null,
        reservaItems: null,
      }),
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
