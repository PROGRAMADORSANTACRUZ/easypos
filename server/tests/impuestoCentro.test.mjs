import test from 'node:test';
import assert from 'node:assert/strict';
import { porcentajeProducto } from '../src/impuestoCentro.js';

test('usa el porcentaje configurado para el centro cuando existe', () => {
  const tasas = new Map([['impuesto-inc-8', 10]]);
  assert.equal(porcentajeProducto({ impuestoId: 'impuesto-inc-8', iva: 8 }, tasas), 10);
});

test('usa el porcentaje base del producto cuando no hay override para el centro', () => {
  assert.equal(porcentajeProducto({ impuestoId: 'iva-19', iva: 19 }, new Map()), 19);
});

test('trata productos sin impuesto como tasa cero', () => {
  assert.equal(porcentajeProducto({ impuestoId: null, iva: null }, new Map()), 0);
});
