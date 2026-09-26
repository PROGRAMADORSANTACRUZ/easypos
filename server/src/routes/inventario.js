import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Listar insumos de inventario
router.get('/', wrap(async (_req, res) => {
  const items = await prisma.inventarioItem.findMany({ orderBy: { nombre: 'asc' }, include: { cuentaContable: true } });
  res.json(items);
}));

// Insumos con stock por debajo del minimo
router.get('/alertas', wrap(async (_req, res) => {
  const items = await prisma.inventarioItem.findMany({ orderBy: { nombre: 'asc' }, include: { cuentaContable: true } });
  res.json(items.filter((i) => i.stock <= i.stockMinimo));
}));

// Crear insumo
router.post('/', wrap(async (req, res) => {
  const { codigo, nombre, unidad, stock, stockMinimo, costo, cuentaContableId } = req.body;
  try {
    const item = await prisma.inventarioItem.create({
      data: {
        codigo: codigo?.trim() || null,
        nombre,
        unidad: unidad || 'unidad',
        stock: Number(stock) || 0,
        stockMinimo: Number(stockMinimo) || 0,
        costo: Number(costo) || 0,
        cuentaContableId: cuentaContableId ? String(cuentaContableId) : null,
      },
      include: { cuentaContable: true },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'inventario', entidadId: item.id, detalle: item.nombre });
    res.status(201).json(item);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un insumo con esa referencia o nombre' });
    throw e;
  }
}));

// Actualizar insumo
router.put('/:id', wrap(async (req, res) => {
  const { codigo, nombre, unidad, stock, stockMinimo, costo, cuentaContableId } = req.body;
  try {
    const item = await prisma.inventarioItem.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(codigo !== undefined && { codigo: codigo?.trim() || null }),
        ...(nombre !== undefined && { nombre }),
        ...(unidad !== undefined && { unidad }),
        ...(stock !== undefined && { stock: Number(stock) }),
        ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
        ...(costo !== undefined && { costo: Number(costo) }),
        ...(cuentaContableId !== undefined && { cuentaContableId: cuentaContableId ? String(cuentaContableId) : null }),
      },
      include: { cuentaContable: true },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'inventario', entidadId: item.id, detalle: item.nombre });
    res.json(item);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un insumo con esa referencia o nombre' });
    throw e;
  }
}));

// Ajustar stock (entrada/salida). cantidad puede ser negativa
router.post('/:id/ajuste', wrap(async (req, res) => {
  const { cantidad } = req.body;
  const item = await prisma.inventarioItem.update({
    where: { id: Number(req.params.id) },
    data: { stock: { increment: Number(cantidad) } },
  });
  await auditar({ req, accion: 'AJUSTE', entidad: 'inventario', entidadId: item.id, detalle: `${item.nombre}: ${Number(cantidad) >= 0 ? '+' : ''}${Number(cantidad)} (stock ${item.stock})` });
  res.json(item);
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.inventarioItem.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'inventario', entidadId: id });
  res.status(204).end();
}));

export default router;
