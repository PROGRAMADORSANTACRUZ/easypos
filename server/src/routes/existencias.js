import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const conRelaciones = { producto: true, bodega: true };

// Listar existencias (filtros opcionales ?productoId= &bodegaId=)
router.get('/', wrap(async (req, res) => {
  const { productoId, bodegaId } = req.query;
  const where = {
    ...(productoId && { productoId: String(productoId) }),
    ...(bodegaId && { bodegaId: String(bodegaId) }),
  };
  const existencias = await prisma.inventario.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
  });
  res.json(existencias);
}));

router.get('/:id', wrap(async (req, res) => {
  const ex = await prisma.inventario.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!ex) return res.status(404).json({ error: 'Existencia no encontrada' });
  res.json(ex);
}));

// Crear existencia (producto en una bodega con una cantidad)
router.post('/', wrap(async (req, res) => {
  const { productoId, bodegaId, cantidad } = req.body;
  const ex = await prisma.inventario.create({
    data: {
      productoId: productoId ? String(productoId) : null,
      bodegaId: bodegaId ? String(bodegaId) : null,
      cantidad: Number(cantidad) || 0,
    },
    include: conRelaciones,
  });
  await auditar({ req, accion: 'CREAR', entidad: 'inventario', entidadId: ex.id, detalle: `${ex.producto?.nombre || 'Producto'} en ${ex.bodega?.nombre || 'bodega'}: ${ex.cantidad}` });
  res.status(201).json(ex);
}));

router.put('/:id', wrap(async (req, res) => {
  const { productoId, bodegaId, cantidad } = req.body;
  try {
    const ex = await prisma.inventario.update({
      where: { id: String(req.params.id) },
      data: {
        ...(productoId !== undefined && { productoId: productoId ? String(productoId) : null }),
        ...(bodegaId !== undefined && { bodegaId: bodegaId ? String(bodegaId) : null }),
        ...(cantidad !== undefined && { cantidad: Number(cantidad) || 0 }),
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'inventario', entidadId: ex.id, detalle: `${ex.producto?.nombre || 'Producto'} en ${ex.bodega?.nombre || 'bodega'}: ${ex.cantidad}` });
    res.json(ex);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Existencia no encontrada' });
    throw e;
  }
}));

// Ajustar cantidad (entrada/salida). cantidad puede ser negativa
router.post('/:id/ajuste', wrap(async (req, res) => {
  const { cantidad } = req.body;
  try {
    const ex = await prisma.inventario.update({
      where: { id: String(req.params.id) },
      data: { cantidad: { increment: Number(cantidad) || 0 } },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'AJUSTE', entidad: 'inventario', entidadId: ex.id, detalle: `${ex.producto?.nombre || 'Producto'}: ${Number(cantidad) >= 0 ? '+' : ''}${Number(cantidad)} (cantidad ${ex.cantidad})` });
    res.json(ex);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Existencia no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  await prisma.inventario.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'inventario', entidadId: id });
  res.status(204).end();
}));

export default router;
