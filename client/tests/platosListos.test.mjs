import assert from 'node:assert/strict';
import test from 'node:test';
import { platosListos, tienePlatoListo } from '../src/platosListos.js';

const mesa = (itemsListos, listo = false) => ({
  pedidos: [{
    items: [
      { id: 1, cantidad: 2, producto: { nombre: 'Costilla' } },
      { id: 2, cantidad: 1, producto: { nombre: 'Chorizo' } },
    ],
    preparacion: { listo, itemsListos },
  }],
});

test('solo avisa los platos listos que aun no se entregan', () => {
  const m = mesa([
    { pedidoItemId: 1, cantidad: 2 },
    { pedidoItemId: 2, cantidad: 1, entregadoAt: '2026-11-24T10:00:00Z' },
  ]);
  assert.deepEqual(platosListos(m), ['2x Costilla']);
  assert.equal(tienePlatoListo(m), true);
});

test('deja de avisar cuando se entregan todos los platos listos', () => {
  const m = mesa([{ pedidoItemId: 1, cantidad: 2, entregadoAt: '2026-11-24T10:00:00Z' }], false);
  assert.equal(tienePlatoListo(m), false);
});

test('ignora un plato listo cuya cantidad cambio despues de marcarse', () => {
  assert.equal(tienePlatoListo(mesa([{ pedidoItemId: 1, cantidad: 1 }])), false);
});

test('pedidos anteriores sin detalle por plato usan el indicador general', () => {
  assert.equal(tienePlatoListo(mesa([], true)), true);
  assert.equal(tienePlatoListo(mesa([], false)), false);
});
