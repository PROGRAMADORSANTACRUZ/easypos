import test from 'node:test';
import assert from 'node:assert/strict';
import { ajustarStockEnBodega, descontarInsumos, validarStockSuficiente } from '../src/inventarioKits.js';

const bodegaCompras = { id: 'bodega-compras', nombre: 'Compras' };

function crearTx(stock) {
  const movimientos = [];
  const cambiosGlobales = [];
  let existencia = { itemId: 7, bodegaId: bodegaCompras.id, stock };
  const tx = {
    bodega: { findFirst: async () => bodegaCompras },
    inventarioItem: {
      findUnique: async () => ({ nombre: 'BRAZO DE CERDO' }),
      update: async ({ data }) => cambiosGlobales.push(data.stock.increment),
    },
    inventarioItemBodega: {
      findMany: async () => existencia ? [{ ...existencia, item: { nombre: 'BRAZO DE CERDO' } }] : [],
      findUnique: async () => existencia,
      updateMany: async ({ data }) => {
        if (!existencia || existencia.stock < data.stock.decrement) return { count: 0 };
        existencia.stock -= data.stock.decrement;
        return { count: 1 };
      },
      upsert: async ({ create, update }) => {
        existencia = existencia
          ? { ...existencia, stock: existencia.stock + update.stock.increment }
          : create;
        return existencia;
      },
    },
    movimientoInventario: { create: async ({ data }) => movimientos.push(data) },
  };
  return { tx, movimientos, cambiosGlobales, getExistencia: () => existencia };
}

test('valida la existencia disponible en Compras y rechaza faltantes', async () => {
  const { tx } = crearTx(4);
  await assert.doesNotReject(() => validarStockSuficiente(tx, new Map([[7, 3]])));
  await assert.rejects(() => validarStockSuficiente(tx, new Map([[7, 5]])), /en Compras/);
});

test('descuenta la bodega Compras y sincroniza el total global', async () => {
  const { tx, movimientos, cambiosGlobales, getExistencia } = crearTx(4);
  await descontarInsumos(tx, new Map([[7, 1.5]]), { documentoReferencia: 'Factura 123' });

  assert.equal(getExistencia().stock, 2.5);
  assert.deepEqual(cambiosGlobales, [-1.5]);
  assert.deepEqual(movimientos, [{
    itemId: 7,
    bodegaId: bodegaCompras.id,
    tipoMovimiento: 'SALIDA',
    cantidad: 1.5,
    documentoReferencia: 'Factura 123',
  }]);
});

test('no permite que una salida exceda el stock de la bodega', async () => {
  const { tx, cambiosGlobales, getExistencia } = crearTx(2);
  await assert.rejects(() => ajustarStockEnBodega(tx, 7, bodegaCompras.id, -3), /Inventario insuficiente/);
  assert.equal(getExistencia().stock, 2);
  assert.deepEqual(cambiosGlobales, []);
});
