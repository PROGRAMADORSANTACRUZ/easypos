import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { ajustarStockEnBodega, buscarBodegaCompras } from '../inventarioKits.js';
import { actualizarReferenciasExistentesSiesa } from '../siesaProductos.js';
import { recalcularCostosPlatos } from '../costeoPlatos.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Listar insumos de inventario
router.get('/', wrap(async (_req, res) => {
  const bodegaId = _req.query.bodegaId ? String(_req.query.bodegaId) : null;
  const items = await prisma.inventarioItem.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      cuentaContable: true,
      ...(bodegaId && { existenciasBodega: { where: { bodegaId }, select: { stock: true } } }),
    },
  });
  res.json(bodegaId ? items.map((item) => ({
    ...item,
    stock: item.existenciasBodega[0]?.stock || 0,
  })) : items);
}));

router.put('/siesa/actualizar', wrap(async (req, res) => {
  const resultado = await actualizarReferenciasExistentesSiesa(prisma);
  await auditar({
    req,
    accion: 'EDITAR',
    entidad: 'catalogo_siesa',
    detalle: `${resultado.productosActualizados} productos y ${resultado.inventarioActualizados} insumos actualizados; ${resultado.omitidos} omitidos`,
  });
  res.json(resultado);
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
    const item = await prisma.$transaction(async (tx) => {
      const bodega = await buscarBodegaCompras(tx);
      const creado = await tx.inventarioItem.create({
        data: {
          codigo: codigo?.trim() || null,
          nombre: nombre?.trim().toUpperCase(),
          unidad: unidad?.trim().toUpperCase() || 'UNIDAD',
          stock: Number(stock) || 0,
          stockMinimo: Number(stockMinimo) || 0,
          costo: Number(costo) || 0,
          cuentaContableId: cuentaContableId ? String(cuentaContableId) : null,
        },
        include: { cuentaContable: true },
      });
      await tx.inventarioItemBodega.create({
        data: { itemId: creado.id, bodegaId: bodega.id, stock: creado.stock },
      });
      return creado;
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
    const id = Number(req.params.id);
    const item = await prisma.$transaction(async (tx) => {
      const anterior = await tx.inventarioItem.findUnique({ where: { id } });
      if (!anterior) throw Object.assign(new Error('Insumo no encontrado'), { code: 'P2025' });
      const actualizado = await tx.inventarioItem.update({
        where: { id },
        data: {
          ...(codigo !== undefined && { codigo: codigo?.trim() || null }),
          ...(nombre !== undefined && { nombre: nombre?.trim().toUpperCase() }),
          ...(unidad !== undefined && { unidad: unidad?.trim().toUpperCase() }),
          ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) }),
          ...(costo !== undefined && { costo: Number(costo) }),
          ...(cuentaContableId !== undefined && { cuentaContableId: cuentaContableId ? String(cuentaContableId) : null }),
        },
        include: { cuentaContable: true },
      });
      if (costo !== undefined && Number(costo) !== anterior.costo) await recalcularCostosPlatos(tx, { itemIds: [id] });
      if (stock !== undefined) {
        const bodega = await buscarBodegaCompras(tx);
        await ajustarStockEnBodega(tx, id, bodega.id, Number(stock) - anterior.stock);
        return tx.inventarioItem.findUnique({ where: { id }, include: { cuentaContable: true } });
      }
      return actualizado;
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
  const id = Number(req.params.id);
  const diferencia = Number(cantidad);
  const item = await prisma.$transaction(async (tx) => {
    const bodega = await buscarBodegaCompras(tx);
    await ajustarStockEnBodega(tx, id, bodega.id, diferencia);
    await tx.movimientoInventario.create({
      data: {
        itemId: id,
        bodegaId: bodega.id,
        tipoMovimiento: 'AJUSTE',
        cantidad: Math.abs(diferencia),
        documentoReferencia: 'Ajuste manual',
      },
    });
    return tx.inventarioItem.findUnique({ where: { id } });
  });
  await auditar({ req, accion: 'AJUSTE', entidad: 'inventario', entidadId: item.id, detalle: `${item.nombre}: ${diferencia >= 0 ? '+' : ''}${diferencia} (stock ${item.stock})` });
  res.json(item);
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.inventarioItem.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'inventario', entidadId: id });
  res.status(204).end();
}));

export default router;
