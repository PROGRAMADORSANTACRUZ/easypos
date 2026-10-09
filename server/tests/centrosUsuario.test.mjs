import test from 'node:test';
import assert from 'node:assert/strict';
import { centroPermitido, centrosUnicos } from '../src/centrosUsuario.js';

const centros = [
  { codigo: '606', companiaCodigo: '006', estado: 'Activo' },
  { codigo: '401', companiaCodigo: '004', estado: 'Activo' },
  { codigo: '001', companiaCodigo: '006', estado: 'Inactivo' },
];

test('autoriza solo el par compañía-centro asignado y activo', () => {
  assert.equal(centroPermitido(centros, '006', '606'), true);
  assert.equal(centroPermitido(centros, '004', '606'), false);
  assert.equal(centroPermitido(centros, '006', '001'), false);
  assert.equal(centroPermitido(centros, '004', '402'), false);
});

test('normaliza códigos de centro y elimina duplicados', () => {
  assert.deepEqual(centrosUnicos(['606', ' 401 ', '606', '', null]), ['606', '401']);
  assert.deepEqual(centrosUnicos(null), []);
});
