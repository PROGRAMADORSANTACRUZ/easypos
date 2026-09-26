import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.listaPrecio.findMany({ include: { _count: { select: { precios: true } } }, orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const l = await prisma.listaPrecio.findUnique({
    where: { id: String(req.params.id) },
    include: { precios: { include: { producto: true } } },
  });
  if (!l) return res.status(404).json({ error: 'Lista de precios no encontrada' });
  res.json(l);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, descripcion, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const l = await prisma.listaPrecio.create({
    data: { nombre: nombreLimpio, descripcion: limpiar(descripcion), ...(activo !== undefined && { activo: aBool(activo) }) },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'lista_precio', entidadId: l.id, detalle: l.nombre });
  res.status(201).json(l);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, descripcion, activo } = req.body;
  try {
    const l = await prisma.listaPrecio.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(descripcion !== undefined && { descripcion: limpiar(descripcion) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'lista_precio', entidadId: l.id, detalle: l.nombre });
    res.json(l);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Lista de precios no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.listaPrecio.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'lista_precio', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Lista de precios no encontrada' });
    throw e;
  }
}));

// Asigna/actualiza el precio de un producto en la lista (upsert de la linea)
router.post('/:id/precios', wrap(async (req, res) => {
  const listaPrecioId = String(req.params.id);
  const { productoId, precio } = req.body;
  if (!productoId) return res.status(400).json({ error: 'productoId es obligatorio' });
  const linea = await prisma.productoListaPrecio.upsert({
    where: { listaPrecioId_productoId: { listaPrecioId, productoId: String(productoId) } },
    update: { precio: Number(precio) || 0 },
    create: { listaPrecioId, productoId: String(productoId), precio: Number(precio) || 0 },
    include: { producto: true },
  });
  await auditar({ req, accion: 'EDITAR', entidad: 'lista_precio', entidadId: listaPrecioId, detalle: `Precio ${linea.producto?.nombre || ''}` });
  res.status(201).json(linea);
}));

router.delete('/:id/precios/:lineaId', wrap(async (req, res) => {
  try {
    await prisma.productoListaPrecio.delete({ where: { id: String(req.params.lineaId) } });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Línea no encontrada' });
    throw e;
  }
}));

export default router;
