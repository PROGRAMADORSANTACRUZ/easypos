import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anchoCssDeTirilla, elegirImpresoraCelular, guardarImpresora, impresoraDelCelular, impresoraPrefacturas, leerImpresora,
  repartirPorImpresora, SIN_IMPRESORA_DIRECTA, sinImpresionDirecta, validarImpresora,
} from '../src/impresoraTirillas.js';

const almacen = () => {
  const datos = new Map();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v), removeItem: (k) => datos.delete(k) };
};

test('solo acepta impresoras con IP de la red local, puerto y papel validos', () => {
  assert.deepEqual(validarImpresora({ ip: ' 192.168.1.50 ', papel: '58' }), { ip: '192.168.1.50', puerto: 9100, papel: 58 });
  assert.deepEqual(validarImpresora({ ip: '10.0.0.9', puerto: '9101', papel: 80 }), { ip: '10.0.0.9', puerto: 9101, papel: 80 });
  for (const malo of [{ ip: '8.8.8.8' }, { ip: '192.168.1.300' }, { ip: 'impresora' }, { ip: '172.32.0.1' }]) {
    assert.throws(() => validarImpresora(malo), /IP de la impresora/);
  }
  assert.throws(() => validarImpresora({ ip: '192.168.1.5', puerto: 70000 }), /Puerto/);
  assert.throws(() => validarImpresora({ ip: '192.168.1.5', papel: 76 }), /58 u 80/);
});

test('la impresora queda guardada en el celular y una configuracion dañada se ignora', () => {
  const local = almacen();
  assert.equal(leerImpresora(local), null);
  guardarImpresora({ ip: '192.168.0.95', papel: 58 }, local);
  assert.deepEqual(leerImpresora(local), { ip: '192.168.0.95', puerto: 9100, papel: 58 });
  local.setItem('pos.impresoraTirillas', '{roto');
  assert.equal(leerImpresora(local), null);
});

test('toma el ancho de diseño de la tirilla desde su @page', () => {
  assert.equal(anchoCssDeTirilla('<style>@page { size: 58mm auto; margin: 0; }</style>'), 219);
  assert.equal(anchoCssDeTirilla('<style>\n    @page { size: 80mm auto; margin: 0; }</style>'), 302);
  assert.equal(anchoCssDeTirilla('<p>sin estilos</p>'), 302);
});

test('reconoce una APK vieja sin impresion directa', () => {
  assert.equal(sinImpresionDirecta({ code: 'UNIMPLEMENTED' }), true);
  assert.equal(sinImpresionDirecta(new Error('Method imprimirTirillaRed not implemented')), true);
  assert.equal(sinImpresionDirecta(new Error('No se pudo conectar con la impresora 192.168.0.95:9100')), false);
});

const cocina = { id: 'imp-cocina', nombre: 'Cocina', ip: '192.168.0.93', puerto: 9100, papel: 80, categoriaIds: ['cat-sancochos', 'cat-entradas'] };
const bar = { id: 'imp-bar', nombre: 'Bar', ip: '192.168.0.95', puerto: 9100, papel: 80, categoriaIds: ['cat-bebidas'] };
const item = (nombre, categoriaId) => ({ cantidad: 1, producto: { nombre, categoriaId } });

test('reparte un pedido mixto: cada producto sale solo en la impresora de su categoria', () => {
  const { grupos, sinImpresora } = repartirPorImpresora(
    [item('Limonada', 'cat-bebidas'), item('Sancocho', 'cat-sancochos'), item('Chorizo', 'cat-entradas')],
    [cocina, bar],
  );
  assert.deepEqual(grupos.map((g) => [g.impresora.nombre, g.items.map((i) => i.producto.nombre)]), [
    ['Cocina', ['Sancocho', 'Chorizo']],
    ['Bar', ['Limonada']],
  ]);
  assert.deepEqual(sinImpresora, []);
});

test('lo que no tiene categoria asignada no sale en ninguna impresora y se reporta', () => {
  const { grupos, sinImpresora } = repartirPorImpresora([item('Postre', 'cat-postres'), item('Limonada', 'cat-bebidas')], [cocina, bar]);
  assert.deepEqual(grupos.map((g) => [g.impresora.nombre, g.items.map((i) => i.producto.nombre)]), [['Bar', ['Limonada']]]);
  assert.deepEqual(sinImpresora.map((i) => i.producto.nombre), ['Postre']);
});

test('en una orden mixta ningun producto de la .95 sale en la .93 ni al reves', () => {
  const pedido = [item('Limonada', 'cat-bebidas'), item('Sancocho', 'cat-sancochos'), item('Gaseosa', 'cat-bebidas'), item('Chorizo', 'cat-entradas')];
  const { grupos } = repartirPorImpresora(pedido, [cocina, bar]);
  const por = Object.fromEntries(grupos.map((g) => [g.impresora.ip, g.items.map((i) => i.producto.nombre)]));
  assert.deepEqual(por, { '192.168.0.93': ['Sancocho', 'Chorizo'], '192.168.0.95': ['Limonada', 'Gaseosa'] });
  // Aunque una configuracion vieja repitiera una categoria, el producto sale en una sola impresora
  const repetida = repartirPorImpresora([item('Limonada', 'cat-bebidas')], [bar, { ...cocina, categoriaIds: ['cat-bebidas'] }]);
  assert.deepEqual(repetida.grupos.map((g) => g.impresora.nombre), ['Bar']);
});

test('la prefactura va a la 192.168.0.93 desde cualquier tablet, salvo que el local marque otra', () => {
  assert.equal(impresoraPrefacturas([]).ip, '192.168.0.93');
  assert.equal(impresoraPrefacturas([]).papel, 80);
  assert.equal(impresoraPrefacturas([cocina, bar]).ip, '192.168.0.93');
  assert.equal(impresoraPrefacturas([cocina, { ...bar, tirillas: true }]).ip, '192.168.0.95');
});

test('el celular usa la impresora elegida, la del local, la configuracion anterior o el dialogo de Android', () => {
  const local = almacen();
  assert.equal(impresoraDelCelular([cocina, bar], local), null);
  guardarImpresora({ ip: '192.168.0.50', papel: 58 }, local);
  assert.equal(impresoraDelCelular([cocina, bar], local).ip, '192.168.0.50');
  // La marcada en el local como de prefacturas manda sobre la configuracion anterior del celular
  const conPrefacturas = [{ ...cocina, tirillas: true }, bar];
  assert.equal(impresoraDelCelular(conPrefacturas, local).ip, '192.168.0.93');
  elegirImpresoraCelular('imp-bar', local);
  assert.equal(impresoraDelCelular(conPrefacturas, local).nombre, 'Bar');
  assert.equal(leerImpresora(local), null);
  elegirImpresoraCelular('', local);
  assert.equal(impresoraDelCelular(conPrefacturas, local).nombre, 'Cocina');
  elegirImpresoraCelular(SIN_IMPRESORA_DIRECTA, local);
  assert.equal(impresoraDelCelular(conPrefacturas, local), null);
});
