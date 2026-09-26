import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));
const conRelaciones = { proveedor: true, detalle: { include: { item: true } } };

// Normaliza las lineas recibidas: solo las que tienen insumo y cantidad valida.
const normalizarLineas = (detalle) =>
  (Array.isArray(detalle) ? detalle : [])
    .map((l) => ({
      itemId: l.itemId != null && l.itemId !== '' ? parseInt(l.itemId, 10) : null,
      cantidad: Number(l.cantidad) || 0,
      costoUnitario: Number(l.costoUnitario) || 0,
    }))
    .filter((l) => l.itemId != null && l.cantidad > 0);

// Suma (o resta con factor -1) el stock de los insumos de un conjunto de lineas.
async function aplicarStock(tx, lineas, factor = 1) {
  for (const l of lineas) {
    if (l.itemId == null || !l.cantidad) continue;
    await tx.inventarioItem.update({ where: { id: l.itemId }, data: { stock: { increment: factor * l.cantidad } } });
  }
}

// Registra un movimiento de ENTRADA por cada linea, ligado a la compra por documentoReferencia.
async function registrarMovimientos(tx, lineas, compraId) {
  for (const l of lineas) {
    if (l.itemId == null || !l.cantidad) continue;
    await tx.movimientoInventario.create({
      data: {
        itemId: l.itemId,
        tipoMovimiento: 'ENTRADA',
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
        documentoReferencia: compraId,
      },
    });
  }
}

// Borra los movimientos generados por una compra (al editar o eliminar).
async function borrarMovimientos(tx, compraId) {
  await tx.movimientoInventario.deleteMany({ where: { documentoReferencia: compraId } });
}

router.get('/', wrap(async (req, res) => {
  const { proveedorId, desde, hasta } = req.query;
  const where = {
    ...(proveedorId && { proveedorId: String(proveedorId) }),
  };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(`${desde}T00:00:00`);
    if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999`);
  }
  const compras = await prisma.compra.findMany({ where, include: conRelaciones, orderBy: { fecha: 'desc' } });
  res.json(compras);
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await prisma.compra.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!c) return res.status(404).json({ error: 'Compra no encontrada' });
  res.json(c);
}));

router.post('/', wrap(async (req, res) => {
  const { proveedorId, subtotal, iva, total, fecha, detalle } = req.body;
  const lineas = normalizarLineas(detalle);
  const subtotalLineas = lineas.reduce((s, l) => s + l.cantidad * l.costoUnitario, 0);
  const compra = await prisma.$transaction(async (tx) => {
    const creada = await tx.compra.create({
      data: {
        proveedorId: proveedorId ? String(proveedorId) : null,
        subtotal: toNum(subtotal) ?? (lineas.length ? subtotalLineas : null),
        iva: toNum(iva),
        total: toNum(total),
        ...(toDate(fecha) && { fecha: toDate(fecha) }),
        detalle: { create: lineas },
      },
      include: conRelaciones,
    });
    await aplicarStock(tx, lineas, 1);
    await registrarMovimientos(tx, lineas, creada.id);
    return creada;
  });
  await auditar({ req, accion: 'CREAR', entidad: 'compra', entidadId: compra.id, detalle: `Total ${compra.total || ''} · ${lineas.length} líneas`.trim() });
  res.status(201).json(compra);
}));

router.put('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const { proveedorId, subtotal, iva, total, fecha, detalle } = req.body;
  const cambiaDetalle = detalle !== undefined;
  const lineas = cambiaDetalle ? normalizarLineas(detalle) : [];
  const subtotalLineas = lineas.reduce((s, l) => s + l.cantidad * l.costoUnitario, 0);
  try {
    const compra = await prisma.$transaction(async (tx) => {
      const anterior = await tx.compra.findUnique({ where: { id }, include: { detalle: true } });
      if (!anterior) { const e = new Error('P2025'); e.code = 'P2025'; throw e; }
      // Si cambian las lineas, revertir el stock anterior y reemplazarlas
      if (cambiaDetalle) {
        await aplicarStock(tx, anterior.detalle, -1);
        await tx.compraDetalle.deleteMany({ where: { compraId: id } });
        await borrarMovimientos(tx, id);
      }
      const actualizada = await tx.compra.update({
        where: { id },
        data: {
          ...(proveedorId !== undefined && { proveedorId: proveedorId ? String(proveedorId) : null }),
          ...(subtotal !== undefined && { subtotal: toNum(subtotal) }),
          ...(subtotal === undefined && cambiaDetalle && { subtotal: subtotalLineas }),
          ...(iva !== undefined && { iva: toNum(iva) }),
          ...(total !== undefined && { total: toNum(total) }),
          ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
          ...(cambiaDetalle && { detalle: { create: lineas } }),
        },
        include: conRelaciones,
      });
      if (cambiaDetalle) await aplicarStock(tx, lineas, 1);
      if (cambiaDetalle) await registrarMovimientos(tx, lineas, id);
      return actualizada;
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'compra', entidadId: compra.id, detalle: `Total ${compra.total || ''}`.trim() });
    res.json(compra);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Compra no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({ where: { id }, include: { detalle: true } });
      if (!compra) { const e = new Error('P2025'); e.code = 'P2025'; throw e; }
      // Revertir el stock que sumo esta compra antes de borrarla
      await aplicarStock(tx, compra.detalle, -1);
      await borrarMovimientos(tx, id);
      await tx.compra.delete({ where: { id } });
    });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'compra', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Compra no encontrada' });
    throw e;
  }
}));

export default router;
