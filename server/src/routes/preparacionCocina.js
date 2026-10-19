import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ACCIONES_COCINA, combinarHistorialCocina, estadoPreparacion, filtroFechaCocina, registrarResultadoCocina } from '../historialCocina.js';

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
  const eventos = items.length ? await prisma.auditoria.findMany({
    where: { entidad: 'PreparacionCocina', entidadId: { in: items.map((item) => String(item.pedidoId)) }, accion: { in: ACCIONES_COCINA } },
    orderBy: { createdAt: 'desc' }, distinct: ['entidadId'],
  }) : [];
  const ultimos = new Map(eventos.map((evento) => [evento.entidadId, evento]));
  res.json(items.map((item) => ({ ...item, estadoCocina: estadoPreparacion(item, ultimos.get(String(item.pedidoId))) })));
}));

router.get('/historial', wrap(async (req, res) => {
  const fecha = filtroFechaCocina(req.query.desde, req.query.hasta);
  const [preparaciones, eventos] = await Promise.all([
    prisma.preparacionCocina.findMany({ where: { listo: true, fechaListo: fecha }, include, orderBy: { fechaListo: 'desc' } }),
    prisma.auditoria.findMany({
      where: { entidad: 'PreparacionCocina', accion: { in: ACCIONES_COCINA }, createdAt: fecha },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json(combinarHistorialCocina(preparaciones, eventos));
}));

router.put('/:pedidoId/resultado', wrap(async (req, res) => {
  try {
    const resultado = await registrarResultadoCocina(prisma, {
      pedidoId: Number(req.params.pedidoId), estado: req.body.estado,
      motivo: req.body.motivo, cocineroId: req.body.cocineroId,
      usuarioId: req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null,
    });
    res.json(resultado);
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'La comanda cambio; actualiza e intenta de nuevo' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
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
