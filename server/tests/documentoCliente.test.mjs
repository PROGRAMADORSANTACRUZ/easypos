import assert from 'node:assert/strict';
import test from 'node:test';
import { errorDocumento, MENSAJE_DOCUMENTO } from '../src/documentoCliente.js';
import { soloDigitos } from '../../client/src/documento.js';

test('el documento del cliente acepta solo numeros (hasta 15) o vacio', () => {
  for (const valido of ['1048324072', '900123456', '1', '123456789012345', '', '  ', null, undefined]) {
    assert.equal(errorDocumento(valido), null, `debe aceptar ${JSON.stringify(valido)}`);
  }
  for (const invalido of ['1048324072---inijijj', '900.123.456', '900123456-7', 'ABC', '12 34', '1234567890123456', '１２３']) {
    assert.equal(errorDocumento(invalido), MENSAJE_DOCUMENTO, `debe rechazar ${JSON.stringify(invalido)}`);
  }
});

test('el campo del cliente descarta lo que no es numero y recorta a 15 digitos', () => {
  assert.equal(soloDigitos('1048324072---inijijj'), '1048324072');
  assert.equal(soloDigitos('900.123.456-7'), '9001234567');
  assert.equal(soloDigitos('abc'), '');
  assert.equal(soloDigitos(null), '');
  assert.equal(soloDigitos('1234567890123456789'), '123456789012345');
});
