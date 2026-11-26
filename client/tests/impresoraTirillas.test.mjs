import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anchoCssDeTirilla, elegirImpresoraCelular, guardarImpresora, impresoraDelCelular, leerImpresora,
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

test('lo que no tiene categoria asignada va a la impresora del celular o se reporta', () => {
  const pedido = [item('Postre', 'cat-postres'), item('Limonada', 'cat-bebidas')];
  const conCelular = repartirPorImpresora(pedido, [cocina, bar], cocina);
  assert.deepEqual(conCelular.grupos.map((g) => [g.impresora.nombre, g.items.length]), [['Cocina', 1], ['Bar', 1]]);
  const sinCelular = repartirPorImpresora(pedido, [cocina, bar], null);
  assert.deepEqual(sinCelular.sinImpresora.map((i) => i.producto.nombre), ['Postre']);
  // Una categoria en dos impresoras sale en ambas
  const doble = repartirPorImpresora([item('Limonada', 'cat-bebidas')], [cocina, { ...bar }, { ...bar, id: 'imp-caja', nombre: 'Caja' }]);
  assert.deepEqual(doble.grupos.map((g) => g.impresora.nombre), ['Bar', 'Caja']);
});

test('el celular usa la impresora elegida, la configuracion anterior o el dialogo de Android', () => {
  const local = almacen();
  assert.equal(impresoraDelCelular([cocina, bar], local), null);
  guardarImpresora({ ip: '192.168.0.50', papel: 58 }, local);
  assert.equal(impresoraDelCelular([cocina, bar], local).ip, '192.168.0.50');
  elegirImpresoraCelular('imp-bar', local);
  assert.equal(impresoraDelCelular([cocina, bar], local).nombre, 'Bar');
  assert.equal(leerImpresora(local), null);
  elegirImpresoraCelular(SIN_IMPRESORA_DIRECTA, local);
  assert.equal(impresoraDelCelular([cocina, bar], local), null);
});
