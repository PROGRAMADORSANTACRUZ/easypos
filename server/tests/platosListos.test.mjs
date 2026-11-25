import assert from 'node:assert/strict';
import test from 'node:test';
import { mesasConPlatosListos } from '../src/platosListos.js';

const mesa = (id, itemsListos, listo = false) => ({
  id,
  numero: id,
  pedidos: [{
    items: [{ id: id * 10, cantidad: 2, producto: { nombre: 'Costilla' } }, { id: id * 10 + 1, cantidad: 1, producto: { nombre: 'Chorizo' } }],
    preparacion: { listo, itemsListos },
  }],
});

test('lista solo los platos listos sin entregar de cada mesa', () => {
  const resultado = mesasConPlatosListos([
    mesa(1, [{ pedidoItemId: 10, cantidad: 2 }, { pedidoItemId: 11, cantidad: 1, entregadoAt: '2026-11-24T10:00:00Z' }]),
    mesa(2, [{ pedidoItemId: 20, cantidad: 2, entregadoAt: '2026-11-24T10:00:00Z' }]),
    { id: 3, numero: 3, pedidos: [] },
  ]);
  assert.deepEqual(resultado, [{ mesaId: 1, numero: 1, platos: ['2x Costilla'] }]);
});

test('respeta las mesas asignadas a la mesera', () => {
  const mesas = [mesa(1, [{ pedidoItemId: 10, cantidad: 2 }]), mesa(2, [{ pedidoItemId: 20, cantidad: 2 }])];
  assert.deepEqual(mesasConPlatosListos(mesas, [2]).map((m) => m.mesaId), [2]);
  assert.deepEqual(mesasConPlatosListos(mesas, []).map((m) => m.mesaId), [1, 2]);
});

test('pedidos anteriores sin detalle por plato usan el indicador general', () => {
  assert.deepEqual(mesasConPlatosListos([mesa(1, [], true)]), [{ mesaId: 1, numero: 1, platos: [] }]);
  assert.deepEqual(mesasConPlatosListos([mesa(1, [], false)]), []);
});

test('solo avisa a quien hizo el pedido, aunque tenga otras mesas asignadas', () => {
  const deAna = mesa(1, [{ pedidoItemId: 10, cantidad: 2 }]);
  deAna.pedidos[0].usuarioId = 'ana';
  const deLuis = mesa(2, [{ pedidoItemId: 20, cantidad: 2 }]);
  deLuis.pedidos[0].usuarioId = 'luis';
  const mesas = [deAna, deLuis];
  assert.deepEqual(mesasConPlatosListos(mesas, [], 'ana').map((m) => m.mesaId), [1]);
  assert.deepEqual(mesasConPlatosListos(mesas, [1, 2], 'luis').map((m) => m.mesaId), [2]);
  assert.deepEqual(mesasConPlatosListos(mesas, [], 'otra'), []);
});
