import { Router } from 'express';
import { prisma } from '../prisma.js';
import { permisoModuloFacturacion } from '../middleware/auth.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  const electronica = req.method === 'GET' || req.method === 'DELETE'
    ? req.query.electronica !== 'false'
    : req.body?.electronica !== false;
  return permisoModuloFacturacion(electronica ? 'facturas' : 'factura_venta')(req, res, next);
});

router.get('/', wrap(async (req, res) => {
  const electronica = req.query.electronica !== 'false';
  const ventas = await prisma.ventaCongelada.findMany({
    where: { usuarioId: req.usuario.id, electronica },
    orderBy: { createdAt: 'desc' },
    select: { id: true, cliente: true, pago: true, items: true, createdAt: true },
  });
  res.json(ventas);
}));

router.post('/', wrap(async (req, res) => {
  const { electronica, cliente, pago, items } = req.body;
  if (typeof electronica !== 'boolean') return res.status(400).json({ error: 'Tipo de factura inválido' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ error: 'La venta debe tener entre 1 y 100 productos' });
  }
  if (items.some((item) => !item?.producto?.id || !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0)) {
    return res.status(400).json({ error: 'Los productos de la venta no son válidos' });
  }

  const venta = await prisma.ventaCongelada.create({
    data: {
      usuarioId: req.usuario.id,
      electronica,
      cliente: typeof cliente === 'string' ? cliente : null,
      pago: typeof pago === 'string' && pago ? pago : 'EFECTIVO',
      items,
    },
    select: { id: true, cliente: true, pago: true, items: true, createdAt: true },
  });
  res.status(201).json(venta);
}));

router.delete('/:id', wrap(async (req, res) => {
  const electronica = req.query.electronica !== 'false';
  const resultado = await prisma.ventaCongelada.deleteMany({
    where: { id: req.params.id, usuarioId: req.usuario.id, electronica },
  });
  if (resultado.count === 0) return res.status(404).json({ error: 'Venta congelada no encontrada' });
  res.status(204).end();
}));

export default router;