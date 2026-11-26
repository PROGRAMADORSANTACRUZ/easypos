import assert from 'node:assert/strict';
import test from 'node:test';
import { cambiarNivelLupa, nivelLupaGuardado } from '../src/lupaMesa.js';

test('la lupa sube y baja por niveles sin salirse del rango', () => {
  assert.equal(cambiarNivelLupa(1, 1), 1.15);
  assert.equal(cambiarNivelLupa(1.5, -1), 1.3);
  assert.equal(cambiarNivelLupa(1, -1), 1);
  assert.equal(cambiarNivelLupa(2, 1), 2);
});

test('un nivel guardado invalido o ausente vuelve al tamaño normal', () => {
  assert.equal(nivelLupaGuardado('1.5'), 1.5);
  assert.equal(nivelLupaGuardado(null), 1);
  assert.equal(nivelLupaGuardado('7'), 1);
  assert.equal(nivelLupaGuardado('abc'), 1);
});