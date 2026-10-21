import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEnsamble, validarExistenciasEnsamble } from '../src/ensamble.js';

test('normaliza cantidades y combina líneas repetidas del mismo insumo', () => {
  assert.deepEqual(normalizarEnsamble({
    outputItemId: '8',
    outputQuantity: '3.5',
    inputs: [
      { itemId: '2', quantity: '1.25' },
      { itemId: 2, quantity: 0.75 },
      { itemId: 3, quantity: 2 },
    ],
  }), {
    outputItemId: 8,
    outputQuantity: 3.5,
    inputs: [
      { itemId: 2, quantity: 2 },
      { itemId: 3, quantity: 2 },
    ],
  });
});

test('rechaza producto sin cantidad o insumos válidos y evita consumirse a sí mismo', () => {
  assert.throws(() => normalizarEnsamble({ outputItemId: 0, outputQuantity: 1, inputs: [{ itemId: 2, quantity: 1 }] }));
  assert.throws(() => normalizarEnsamble({ outputItemId: 1, outputQuantity: 0, inputs: [{ itemId: 2, quantity: 1 }] }));
  assert.throws(() => normalizarEnsamble({ outputItemId: 1, outputQuantity: 1, inputs: [] }));
  assert.throws(() => normalizarEnsamble({ outputItemId: 1, outputQuantity: 1, inputs: [{ itemId: 1, quantity: 1 }] }));
});

test('bloquea el ensamble si un insumo no tiene stock suficiente', () => {
  assert.throws(() => validarExistenciasEnsamble({
    inputs: [{ itemId: 2, quantity: 4 }],
    items: [{ id: 2, nombre: 'BRAZO DE CERDO', unidad: 'KG', stock: 3 }],
  }), /Stock insuficiente/);
});

test('valida existencia de todos los insumos y devuelve un índice por ID', () => {
  const items = [{ id: 2, nombre: 'BRAZO DE CERDO', unidad: 'KG', stock: 4 }];
  assert.equal(validarExistenciasEnsamble({ inputs: [{ itemId: 2, quantity: 4 }], items }).get(2), items[0]);
  assert.throws(() => validarExistenciasEnsamble({ inputs: [{ itemId: 3, quantity: 1 }], items }), /ya no existen/);
});