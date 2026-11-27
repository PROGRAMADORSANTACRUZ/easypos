import assert from 'node:assert/strict';
import test from 'node:test';
import { lineasParaDevolver, medioDistinto, totalADevolver } from '../src/devoluciones.js';

const lineas = [
  { id: 'l1', cantidad: 2, total: 52000, disponible: 1 },
  { id: 'l2', cantidad: 1.5, total: 36000, disponible: 1.5 },
];

test('calcula el valor a devolver y marca la cantidad que se pasa de lo disponible', () => {
  const resultado = lineasParaDevolver(lineas, { l1: '1', l2: '0.5' });
  assert.deepEqual(resultado.map((l) => [l.id, l.total, l.error]), [['l1', 26000, null], ['l2', 12000, null]]);
  assert.equal(totalADevolver(resultado), 38000);
  const excedido = lineasParaDevolver(lineas, { l1: '2', l2: '' });
  assert.deepEqual(excedido.map((l) => [l.id, l.error]), [['l1', 'Máximo 1']]);
  assert.equal(totalADevolver(excedido), 0);
});

test('alerta cuando el medio de la devolucion no se uso en la factura', () => {
  assert.equal(medioDistinto('EFE', ['EFE', 'DAT']), false);
  assert.equal(medioDistinto('tra', ['EFE']), true);
  assert.equal(medioDistinto('', ['EFE']), false);
});
