import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const include = {
  mesa: true,
  cocinero: true,
  pedido: { include: { mesera: true, items: { include: { producto: true } } } },
};

// Lista las confirmaciones de cocina (por defecto solo las pendientes, ?listo=1 para ver las listas)
router.get('/', wrap(async (req, res) => {
  const { listo } = req.query;
  const where = listo === undefined ? { listo: false } : { listo: listo === '1' || listo === 'true' };
  const items = await prisma.preparacionCocina.findMany({ where, include, orderBy: { consecutivo: 'asc' } });
  res.json(items);
}));

// Marca el pedido como listo para que el mesero lo recoja.
// Si el pedido es anterior a este modulo y no tiene preparacion registrada, se crea al vuelo.
// body: { cocineroId }
router.put('/:pedidoId/listo', wrap(async (req, res) => {
  const pedidoId = Number(req.params.pedidoId);
  const { cocineroId } = req.body;

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: { include: { producto: true } } },
  });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const resumen = pedido.items.map((it) => `${it.cantidad}x ${it.producto?.nombre || ''}`).join(', ');
  const prep = await prisma.preparacionCocina.upsert({
    where: { pedidoId },
    create: {
      pedidoId,
      mesaId: pedido.mesaId,
      productos: resumen,
      listo: true,
      fechaListo: new Date(),
      cocineroId: cocineroId ? Number(cocineroId) : null,
    },
    update: {
      listo: true,
      fechaListo: new Date(),
      cocineroId: cocineroId ? Number(cocineroId) : null,
    },
    include,
  });
  res.json(prep);
}));

// Reabre la preparacion (por si se marco listo por error)
router.put('/:pedidoId/reabrir', wrap(async (req, res) => {
  const pedidoId = Number(req.params.pedidoId);
  try {
    const prep = await prisma.preparacionCocina.update({
      where: { pedidoId },
      data: { listo: false, fechaListo: null },
      include,
    });
    res.json(prep);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'No hay preparación registrada para ese pedido' });
    throw e;
  }
}));

export default router;
