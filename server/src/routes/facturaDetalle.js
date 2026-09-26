import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const conRelaciones = { producto: true };

// Listar detalle (filtro opcional ?facturaId= &productoId=)
router.get('/', wrap(async (req, res) => {
  const { facturaId, productoId } = req.query;
  const where = {
    ...(facturaId && { facturaId: String(facturaId) }),
    ...(productoId && { productoId: String(productoId) }),
  };
  const detalle = await prisma.facturaDetalle.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
  });
  res.json(detalle);
}));

router.get('/:id', wrap(async (req, res) => {
  const d = await prisma.facturaDetalle.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!d) return res.status(404).json({ error: 'Detalle no encontrado' });
  res.json(d);
}));

// Crear una linea de factura
router.post('/', wrap(async (req, res) => {
  const { facturaId, productoId, cantidad, precioUnitario, iva, total } = req.body;
  const d = await prisma.facturaDetalle.create({
    data: {
      facturaId: facturaId ? String(facturaId) : null,
      productoId: productoId ? String(productoId) : null,
      cantidad: Number(cantidad) || 0,
      precioUnitario: Number(precioUnitario) || 0,
      iva: Number(iva) || 0,
      total: Number(total) || 0,
    },
    include: conRelaciones,
  });
  await auditar({ req, accion: 'CREAR', entidad: 'factura_detalle', entidadId: d.id, detalle: `${d.producto?.nombre || 'Producto'} x${d.cantidad}` });
  res.status(201).json(d);
}));

router.put('/:id', wrap(async (req, res) => {
  const { facturaId, productoId, cantidad, precioUnitario, iva, total } = req.body;
  try {
    const d = await prisma.facturaDetalle.update({
      where: { id: String(req.params.id) },
      data: {
        ...(facturaId !== undefined && { facturaId: facturaId ? String(facturaId) : null }),
        ...(productoId !== undefined && { productoId: productoId ? String(productoId) : null }),
        ...(cantidad !== undefined && { cantidad: Number(cantidad) || 0 }),
        ...(precioUnitario !== undefined && { precioUnitario: Number(precioUnitario) || 0 }),
        ...(iva !== undefined && { iva: Number(iva) || 0 }),
        ...(total !== undefined && { total: Number(total) || 0 }),
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'factura_detalle', entidadId: d.id, detalle: `${d.producto?.nombre || 'Producto'} x${d.cantidad}` });
    res.json(d);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Detalle no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.facturaDetalle.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'factura_detalle', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Detalle no encontrado' });
    throw e;
  }
}));

export default router;
