import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const conRelaciones = { producto: true, bodega: true, item: true };

// Signo del movimiento sobre el stock: salidas/egresos restan, el resto suma.
const signo = (tipo) => (/salida|egreso|baja/i.test(tipo || '') ? -1 : 1);
const efectoStock = (tipo, cantidad) => signo(tipo) * (Number(cantidad) || 0);

// Aplica un delta a la existencia (producto+bodega); la crea si no existe.
async function aplicarStock(tx, productoId, bodegaId, delta) {
  if (!productoId || !bodegaId || !delta) return;
  const ex = await tx.inventario.findFirst({ where: { productoId, bodegaId } });
  if (ex) await tx.inventario.update({ where: { id: ex.id }, data: { cantidad: { increment: delta } } });
  else await tx.inventario.create({ data: { productoId, bodegaId, cantidad: delta } });
}

// Listar movimientos (filtros opcionales ?productoId= &bodegaId= &tipoMovimiento=)
router.get('/', wrap(async (req, res) => {
  const { productoId, bodegaId, tipoMovimiento } = req.query;
  const where = {
    ...(productoId && { productoId: String(productoId) }),
    ...(bodegaId && { bodegaId: String(bodegaId) }),
    ...(tipoMovimiento && { tipoMovimiento: String(tipoMovimiento) }),
  };
  const movimientos = await prisma.movimientoInventario.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
    orderBy: { fecha: 'desc' },
  });
  res.json(movimientos);
}));

router.get('/:id', wrap(async (req, res) => {
  const mov = await prisma.movimientoInventario.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
  res.json(mov);
}));

// Registrar un movimiento de inventario (ajusta el stock de la existencia)
router.post('/', wrap(async (req, res) => {
  const { productoId, bodegaId, tipoMovimiento, cantidad, costoUnitario, documentoReferencia, fecha } = req.body;
  const data = {
    productoId: productoId ? String(productoId) : null,
    bodegaId: bodegaId ? String(bodegaId) : null,
    tipoMovimiento: tipoMovimiento ? String(tipoMovimiento) : null,
    cantidad: Number(cantidad) || 0,
    costoUnitario: Number(costoUnitario) || 0,
    documentoReferencia: documentoReferencia ? String(documentoReferencia) : null,
    ...(fecha && { fecha: new Date(fecha) }),
  };
  const mov = await prisma.$transaction(async (tx) => {
    const creado = await tx.movimientoInventario.create({ data, include: conRelaciones });
    await aplicarStock(tx, creado.productoId, creado.bodegaId, efectoStock(creado.tipoMovimiento, creado.cantidad));
    return creado;
  });
  await auditar({ req, accion: 'CREAR', entidad: 'movimiento_inventario', entidadId: mov.id, detalle: `${mov.tipoMovimiento || 'MOV'} ${mov.producto?.nombre || 'producto'} x${mov.cantidad} en ${mov.bodega?.nombre || 'bodega'}` });
  res.status(201).json(mov);
}));

router.put('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const { productoId, bodegaId, tipoMovimiento, cantidad, costoUnitario, documentoReferencia, fecha } = req.body;
  try {
    const mov = await prisma.$transaction(async (tx) => {
      const anterior = await tx.movimientoInventario.findUnique({ where: { id } });
      if (!anterior) { const e = new Error('P2025'); e.code = 'P2025'; throw e; }
      // Revertir el efecto anterior sobre el stock
      await aplicarStock(tx, anterior.productoId, anterior.bodegaId, -efectoStock(anterior.tipoMovimiento, anterior.cantidad));
      const actualizado = await tx.movimientoInventario.update({
        where: { id },
        data: {
          ...(productoId !== undefined && { productoId: productoId ? String(productoId) : null }),
          ...(bodegaId !== undefined && { bodegaId: bodegaId ? String(bodegaId) : null }),
          ...(tipoMovimiento !== undefined && { tipoMovimiento: tipoMovimiento ? String(tipoMovimiento) : null }),
          ...(cantidad !== undefined && { cantidad: Number(cantidad) || 0 }),
          ...(costoUnitario !== undefined && { costoUnitario: Number(costoUnitario) || 0 }),
          ...(documentoReferencia !== undefined && { documentoReferencia: documentoReferencia ? String(documentoReferencia) : null }),
          ...(fecha !== undefined && { fecha: new Date(fecha) }),
        },
        include: conRelaciones,
      });
      // Aplicar el efecto nuevo
      await aplicarStock(tx, actualizado.productoId, actualizado.bodegaId, efectoStock(actualizado.tipoMovimiento, actualizado.cantidad));
      return actualizado;
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'movimiento_inventario', entidadId: mov.id, detalle: `${mov.tipoMovimiento || 'MOV'} ${mov.producto?.nombre || 'producto'} x${mov.cantidad}` });
    res.json(mov);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Movimiento no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const anterior = await tx.movimientoInventario.findUnique({ where: { id } });
      if (!anterior) { const e = new Error('P2025'); e.code = 'P2025'; throw e; }
      // Revertir el efecto del movimiento sobre el stock
      await aplicarStock(tx, anterior.productoId, anterior.bodegaId, -efectoStock(anterior.tipoMovimiento, anterior.cantidad));
      await tx.movimientoInventario.delete({ where: { id } });
    });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'movimiento_inventario', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Movimiento no encontrado' });
    throw e;
  }
}));

export default router;
