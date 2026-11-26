import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ||= 'prueba-impresoras';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { validarImpresoras, esIpPrivada } = await import('../src/routes/impresoras.js');

const CAT_BAR = '11111111-1111-4111-8111-111111111111';
const CAT_COCINA = '22222222-2222-4222-8222-222222222222';

test('normaliza la lista de impresoras del local con nombre, puerto, papel y orden', () => {
  const lista = validarImpresoras([
    { nombre: ' Bar ', ip: '192.168.0.95', papel: '80', categoriaIds: [CAT_BAR, CAT_BAR] },
    { ip: '192.168.0.93', puerto: '9101', papel: 58, categoriaIds: [CAT_COCINA] },
  ], [CAT_BAR, CAT_COCINA]);
  assert.deepEqual(lista, [
    { id: undefined, nombre: 'Bar', ip: '192.168.0.95', puerto: 9100, papel: 80, orden: 0, categoriaIds: [CAT_BAR] },
    { id: undefined, nombre: 'Impresora 2', ip: '192.168.0.93', puerto: 9101, papel: 58, orden: 1, categoriaIds: [CAT_COCINA] },
  ]);
});

test('rechaza IP fuera del local, papel o puerto invalidos y categorias que no existen', () => {
  const valida = { nombre: 'Cocina', ip: '192.168.0.93' };
  assert.throws(() => validarImpresoras([{ ...valida, ip: '8.8.8.8' }], []), /IP de la impresora/);
  assert.throws(() => validarImpresoras([{ ...valida, papel: 76 }], []), /58 u 80/);
  assert.throws(() => validarImpresoras([{ ...valida, puerto: 0 }], []), /puerto/);
  assert.throws(() => validarImpresoras([{ ...valida, categoriaIds: [CAT_BAR] }], [CAT_COCINA]), /categoría que ya no existe/);
  assert.throws(() => validarImpresoras('no', []), /lista/);
  assert.throws(
    () => validarImpresoras([{ ...valida, nombre: 'Bar', ip: '192.168.0.95', categoriaIds: [CAT_BAR] }, { ...valida, categoriaIds: [CAT_BAR] }], [{ id: CAT_BAR, nombre: 'BEBIDAS' }]),
    /BEBIDAS está en Bar y en Cocina/,
  );
  assert.equal(esIpPrivada('172.16.4.1'), true);
  assert.equal(esIpPrivada('172.32.4.1'), false);
  assert.equal(esIpPrivada('192.168.1.256'), false);
});
