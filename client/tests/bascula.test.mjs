import assert from 'node:assert/strict';
import test from 'node:test';
import { cantidadDesdePeso, esProductoPesable } from '../src/bascula.js';

const producto = (abreviatura, factorConversion = 1000, nombre = '') => ({ unidad: { abreviatura, nombre, factorConversion } });

test('convierte el peso en kg a la unidad de venta del producto con su precision', () => {
  assert.equal(cantidadDesdePeso(producto('KG'), 1.2345), 1.235);
  assert.equal(cantidadDesdePeso(producto('Kg.', 100), 0.756), 0.76);
  assert.equal(cantidadDesdePeso(producto('GR', 1), 0.7504), 750);
  assert.equal(cantidadDesdePeso(producto('LB', 100), 1), 2.2);
  assert.equal(cantidadDesdePeso(producto('', 1000, 'Kilogramo'), 0.5), 0.5);
});

test('solo los productos con unidad de peso se pesan y un peso en cero no cuenta', () => {
  assert.equal(esProductoPesable(producto('UND')), false);
  assert.equal(esProductoPesable({ nombre: 'Gaseosa' }), false);
  assert.equal(esProductoPesable(producto('KG')), true);
  assert.equal(cantidadDesdePeso(producto('UND'), 1), null);
  assert.equal(cantidadDesdePeso(producto('KG'), 0), null);
  assert.equal(cantidadDesdePeso(producto('KG'), -0.2), null);
  assert.equal(cantidadDesdePeso(producto('KG'), 0.0004), null);
});
