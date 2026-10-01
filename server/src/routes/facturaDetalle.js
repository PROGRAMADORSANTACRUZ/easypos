import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const conRelaciones = { producto: true };

// Listar detalle (filtro opcional ?facturaId= &productoId=)
router.get('/', wrap(async (req, res) => {
  const { facturaId, productoId, electronica } = req.query;
  const where = {
    ...(facturaId && { facturaId: String(facturaId) }),
    ...(productoId && { productoId: String(productoId) }),
  };
  const whereVenta = {
    ...(facturaId && { facturaVentaId: String(facturaId) }),
    ...(productoId && { productoId: String(productoId) }),
  };
  const [detalle, detalleVenta] = await Promise.all([
    electronica === 'false' ? [] : prisma.facturaDetalle.findMany({ where: Object.keys(where).length ? where : undefined, include: conRelaciones }),
    electronica === 'true' ? [] : prisma.facturaVentaDetalle.findMany({ where: Object.keys(whereVenta).length ? whereVenta : undefined, include: conRelaciones }),
  ]);
  res.json([
    ...detalle,
    ...detalleVenta.map(({ facturaVentaId, ...d }) => ({ ...d, facturaId: facturaVentaId })),
  ]);
}));

router.get('/:id', wrap(async (req, res) => {
  const d = await prisma.facturaDetalle.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (d) return res.json(d);
  const venta = await prisma.facturaVentaDetalle.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!venta) return res.status(404).json({ error: 'Detalle no encontrado' });
  const { facturaVentaId, ...rest } = venta;
  res.json({ ...rest, facturaId: facturaVentaId });
}));

// Crear una linea de factura
router.post('/', wrap(async (req, res) => {
  const { facturaId, facturaVentaId, electronica, productoId, cantidad, precioUnitario, iva, total } = req.body;
  const id = facturaVentaId || facturaId;
  const esVenta = electronica === false || (!!id && !!(await prisma.facturaVenta.findUnique({ where: { id: String(id) }, select: { id: true } })));
  if (esVenta) {
    const d = await prisma.facturaVentaDetalle.create({
      data: {
        facturaVentaId: id ? String(id) : null,
        productoId: productoId ? String(productoId) : null,
        cantidad: Number(cantidad) || 0,
        precioUnitario: Number(precioUnitario) || 0,
        iva: Number(iva) || 0,
        total: Number(total) || 0,
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'CREAR', entidad: 'factura_detalle', entidadId: d.id, detalle: `${d.producto?.nombre || 'Producto'} x${d.cantidad}` });
    return res.status(201).json({ ...d, facturaId: d.facturaVentaId });
  }
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
  const { facturaId, facturaVentaId, electronica, productoId, cantidad, precioUnitario, iva, total } = req.body;
  try {
    const existenteVenta = await prisma.facturaVentaDetalle.findUnique({ where: { id: String(req.params.id) } });
    if (existenteVenta || electronica === false) {
      const id = facturaVentaId || facturaId;
      const d = await prisma.facturaVentaDetalle.update({
        where: { id: String(req.params.id) },
        data: {
          ...(id !== undefined && { facturaVentaId: id ? String(id) : null }),
          ...(productoId !== undefined && { productoId: productoId ? String(productoId) : null }),
          ...(cantidad !== undefined && { cantidad: Number(cantidad) || 0 }),
          ...(precioUnitario !== undefined && { precioUnitario: Number(precioUnitario) || 0 }),
          ...(iva !== undefined && { iva: Number(iva) || 0 }),
          ...(total !== undefined && { total: Number(total) || 0 }),
        },
        include: conRelaciones,
      });
      await auditar({ req, accion: 'EDITAR', entidad: 'factura_detalle', entidadId: d.id, detalle: `${d.producto?.nombre || 'Producto'} x${d.cantidad}` });
      return res.json({ ...d, facturaId: d.facturaVentaId });
    }
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
    const venta = await prisma.facturaVentaDetalle.findUnique({ where: { id }, select: { id: true } });
    if (venta) await prisma.facturaVentaDetalle.delete({ where: { id } });
    else await prisma.facturaDetalle.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'factura_detalle', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Detalle no encontrado' });
    throw e;
  }
}));

export default router;
