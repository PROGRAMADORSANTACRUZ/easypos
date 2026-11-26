import assert from 'node:assert/strict';
import test from 'node:test';
import { COLUMNAS, imprimeElServidor, prepararComandas, ticketsComanda } from '../src/impresionCocina.js';
import { fechaHoraColombia } from '../src/fechaColombia.js';

const cocina = { nombre: 'COCINA', impresoraIp: '192.168.0.95', impresoraPuerto: 9100 };
const bar = { nombre: 'BAR', impresoraIp: '192.168.0.96' };
const pedido = { id: 7, mesa: { numero: 4 }, mesera: { nombre: 'Ana' }, cambios: null, observaciones: 'sin sal' };
const items = [
  { cantidad: 2, notas: 'bien asado', producto: { nombre: 'Churrasco', categoria: cocina } },
  { cantidad: 1, producto: { nombre: 'Limonada', categoria: bar } },
  { cantidad: 1, producto: { nombre: 'Postre', categoria: { nombre: 'SIN IMPRESORA' } } },
  { cantidad: 1, producto: { nombre: 'Mazorca', categoria: cocina } },
];
const texto = (t) => Buffer.from(t.datos, 'base64').toString('binary');

test('arma una comanda por impresora con solo sus productos y en base64', () => {
  const tickets = ticketsComanda(pedido, items);
  assert.deepEqual(tickets.map(({ ip, puerto, estacion }) => ({ ip, puerto, estacion })), [
    { ip: '192.168.0.95', puerto: 9100, estacion: 'COCINA' },
    { ip: '192.168.0.96', puerto: 9100, estacion: 'BAR' },
  ]);
  const deCocina = texto(tickets[0]);
  assert.match(deCocina, /2x CHURRASCO/);
  assert.match(deCocina, /\(bien asado\)/);
  assert.match(deCocina, /1x MAZORCA/);
  assert.match(deCocina, /Mesa: 4 +Pedido #7/);
  assert.match(deCocina, /Mesera: Ana/);
  assert.match(deCocina, /Obs: sin sal/);
  assert.doesNotMatch(deCocina, /LIMONADA/);
  assert.ok(deCocina.startsWith('\x1b@'));
  assert.ok(deCocina.endsWith('\x1dVA\x00'));
  assert.deepEqual(ticketsComanda(pedido, [items[2]]), []);
});

test('la comanda usa el ancho de 80 mm (48 columnas) y parte los nombres largos sin pasarse', () => {
  const largo = { cantidad: 1, producto: { nombre: 'Chorizo artesanal de res restaurante con arepa y guacamole', categoria: cocina } };
  const lineas = texto(ticketsComanda(pedido, [largo])[0]).replace(/\x1b@|\x1b[aEt].|\x1d!.|\x1dV../g, '').split('\n');
  const separador = lineas.find((l) => /^-+$/.test(l));
  assert.equal(separador.length, COLUMNAS);
  assert.equal(COLUMNAS, 48);
  assert.ok(lineas.every((l) => l.length <= COLUMNAS), lineas.filter((l) => l.length > COLUMNAS).join(' | '));
  const nombre = lineas.filter((l) => /CHORIZO|GUACAMOLE|ARTESANAL|AREPA/.test(l));
  assert.ok(nombre.length >= 2);
  assert.ok(nombre.slice(1).every((l) => l.startsWith('   ')));
  assert.match(lineas.find((l) => l.startsWith('Mesa:')), /^Mesa: 4 +Pedido #7$/);
});

test('la fecha de la comanda va en hora de Colombia aunque el servidor este en UTC', () => {
  assert.equal(fechaHoraColombia(new Date('2026-11-26T19:36:06Z')), '26/11/2026 2:36 p. m.');
  assert.equal(fechaHoraColombia(new Date('2026-11-27T04:05:00Z')), '26/11/2026 11:05 p. m.');
  assert.equal(fechaHoraColombia(new Date('2026-11-26T05:00:00Z')), '26/11/2026 12:00 a. m.');
  assert.equal(fechaHoraColombia(new Date('2026-11-26T17:00:00Z')), '26/11/2026 12:00 p. m.');
});

test('por defecto las comandas las imprime el dispositivo; con IMPRESION_COMANDAS_SERVIDOR=true las envia el servidor', async () => {
  const enviados = [];
  const enviar = async (ip, puerto, contenido) => { enviados.push({ ip, puerto, contenido }); };

  const paraDispositivo = prepararComandas(pedido, items, { env: {}, enviar });
  assert.equal(paraDispositivo.length, 2);
  assert.deepEqual(enviados, []);

  const delServidor = prepararComandas(pedido, items, { env: { IMPRESION_COMANDAS_SERVIDOR: 'TRUE' }, enviar });
  assert.deepEqual(delServidor, []);
  assert.deepEqual(enviados.map(({ ip, puerto }) => `${ip}:${puerto}`), ['192.168.0.95:9100', '192.168.0.96:9100']);
  assert.match(enviados[0].contenido, /2x CHURRASCO/);
  assert.equal(imprimeElServidor({}), false);
});
