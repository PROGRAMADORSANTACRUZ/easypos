import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { normalizarEnsamble, validarExistenciasEnsamble } from '../ensamble.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (_req, res) => {
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { documentoReferencia: { startsWith: 'ENS-' } },
    include: { item: true },
    orderBy: { fecha: 'desc' },
    take: 1000,
  });
  const grupos = new Map();

  for (const movimiento of movimientos) {
    if (!grupos.has(movimiento.documentoReferencia)) {
      grupos.set(movimiento.documentoReferencia, {
        referencia: movimiento.documentoReferencia,
        fecha: movimiento.fecha,
        salida: null,
        entradas: [],
      });
    }
    const grupo = grupos.get(movimiento.documentoReferencia);
    const item = movimiento.item;
    const detalle = {
      itemId: movimiento.itemId,
      codigo: item?.codigo || null,
      nombre: item?.nombre || 'Insumo eliminado',
      unidad: item?.unidad || '',
      cantidad: movimiento.cantidad,
    };
    if (movimiento.tipoMovimiento === 'ENSAMBLE_ENTRADA') grupo.salida = detalle;
    if (movimiento.tipoMovimiento === 'ENSAMBLE_SALIDA') grupo.entradas.push(detalle);
  }

  res.json([...grupos.values()].slice(0, 100));
}));

router.post('/', wrap(async (req, res) => {
  let ensamble;
  try {
    ensamble = normalizarEnsamble(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const referencia = `ENS-${randomUUID()}`;
  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const ids = [ensamble.outputItemId, ...ensamble.inputs.map((input) => input.itemId)];
      const items = await tx.inventarioItem.findMany({ where: { id: { in: ids } } });
      const itemSalida = items.find((item) => item.id === ensamble.outputItemId);
      if (!itemSalida) {
        const error = new Error('El insumo que vas a producir no existe');
        error.status = 404;
        throw error;
      }

      let itemsPorId;
      try {
        itemsPorId = validarExistenciasEnsamble({ inputs: ensamble.inputs, items });
      } catch (error) {
        error.status = 409;
        throw error;
      }

      for (const input of ensamble.inputs) {
        const actualizado = await tx.inventarioItem.updateMany({
          where: { id: input.itemId, stock: { gte: input.quantity } },
          data: { stock: { decrement: input.quantity } },
        });
        if (actualizado.count !== 1) {
          const item = itemsPorId.get(input.itemId);
          const error = new Error(`El stock de "${item.nombre}" cambió; revisa la existencia e intenta de nuevo`);
          error.status = 409;
          throw error;
        }
      }

      const salidaActualizada = await tx.inventarioItem.update({
        where: { id: ensamble.outputItemId },
        data: { stock: { increment: ensamble.outputQuantity } },
      });
      const movimientos = ensamble.inputs.map((input) => ({
        itemId: input.itemId,
        tipoMovimiento: 'ENSAMBLE_SALIDA',
        cantidad: input.quantity,
        costoUnitario: itemsPorId.get(input.itemId).costo,
        documentoReferencia: referencia,
      }));
      movimientos.push({
        itemId: ensamble.outputItemId,
        tipoMovimiento: 'ENSAMBLE_ENTRADA',
        cantidad: ensamble.outputQuantity,
        costoUnitario: itemSalida.costo,
        documentoReferencia: referencia,
      });
      await tx.movimientoInventario.createMany({ data: movimientos });

      return {
        referencia,
        salida: {
          itemId: salidaActualizada.id,
          codigo: salidaActualizada.codigo,
          nombre: salidaActualizada.nombre,
          unidad: salidaActualizada.unidad,
          cantidad: ensamble.outputQuantity,
          stock: salidaActualizada.stock,
        },
        entradas: ensamble.inputs.map((input) => {
          const item = itemsPorId.get(input.itemId);
          return {
            itemId: item.id,
            codigo: item.codigo,
            nombre: item.nombre,
            unidad: item.unidad,
            cantidad: input.quantity,
            stock: item.stock - input.quantity,
          };
        }),
      };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  await auditar({
    req,
    accion: 'ENSAMBLAR',
    entidad: 'ensamble',
    entidadId: resultado.referencia,
    detalle: `${resultado.salida.nombre}: +${resultado.salida.cantidad} ${resultado.salida.unidad}`,
  });
  res.status(201).json(resultado);
}));

export default router;