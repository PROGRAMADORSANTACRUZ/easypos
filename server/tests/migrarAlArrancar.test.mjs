import assert from 'node:assert/strict';
import test from 'node:test';
import { migrarAlArrancar } from '../scripts/migrar-al-arrancar.mjs';

const silencioso = { log() {}, warn() {}, error() {} };

test('al arrancar aplica las migraciones solo si la base ya lleva el historial de Prisma', async () => {
  let despliegues = 0;
  const desplegar = () => { despliegues += 1; };
  assert.equal(await migrarAlArrancar({ consultar: async () => [{ total: 52 }], desplegar, log: silencioso }), 'OK');
  assert.equal(despliegues, 1);
  assert.equal(await migrarAlArrancar({ consultar: async () => { throw new Error('no existe _prisma_migrations'); }, desplegar, log: silencioso }), 'SIN_HISTORIAL');
  assert.equal(await migrarAlArrancar({ consultar: async () => [{ total: 0 }], desplegar, log: silencioso }), 'SIN_HISTORIAL');
  assert.equal(despliegues, 1);
});

test('una migracion fallida no detiene el arranque del POS', async () => {
  const resultado = await migrarAlArrancar({
    consultar: async () => [{ total: 52 }],
    desplegar: () => { throw new Error('P3009'); },
    log: silencioso,
  });
  assert.equal(resultado, 'ERROR');
});
