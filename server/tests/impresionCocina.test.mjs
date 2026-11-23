import assert from 'node:assert/strict';
import test from 'node:test';
import { imprimeElServidor, prepararComandas, ticketsComanda } from '../src/impresionCocina.js';

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
  assert.match(deCocina, /Mesa: 4 {4}Mesera: Ana/);
  assert.match(deCocina, /Obs: sin sal/);
  assert.doesNotMatch(deCocina, /LIMONADA/);
  assert.ok(deCocina.startsWith('\x1b@'));
  assert.ok(deCocina.endsWith('\x1dVA\x00'));
  assert.deepEqual(ticketsComanda(pedido, [items[2]]), []);
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
