import assert from 'node:assert/strict';
import test from 'node:test';
import { anchoCssDeTirilla, guardarImpresora, leerImpresora, sinImpresionDirecta, validarImpresora } from '../src/impresoraTirillas.js';

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
