import test from 'node:test';
import assert from 'node:assert/strict';
import { reservarNumeroDocumento } from '../src/numeracionDocumentos.js';

function crearTx(tipoDocumento) {
  const llamadas = {};
  return {
    llamadas,
    tipoDocumento: {
      async findFirst(argumentos) {
        llamadas.busqueda = argumentos;
        return tipoDocumento;
      },
      async updateMany(argumentos) {
        llamadas.actualizacion = argumentos;
        return { count: 1 };
      },
    },
  };
}

test('reserva numeración solo para compañía y centro solicitados', async () => {
  const tx = crearTx({
    id: 'tipo-006-606',
    clase: 'FACTURA DE VENTA (NO ELECTRONICA)',
    esElectronico: false,
    prefijo: 'FAV',
    consInicial: 1,
    consFinal: 100,
    consProximo: 9,
    companiaCodigo: '006',
    centroOperacionCodigo: '606',
  });
  const reserva = await reservarNumeroDocumento(tx, 'FACTURA DE VENTA (NO ELECTRONICA)', {
    companiaCodigo: '006',
    centroOperacionCodigo: '606',
  });
  assert.deepEqual(tx.llamadas.busqueda.where, {
    clase: 'FACTURA DE VENTA (NO ELECTRONICA)',
    esElectronico: false,
    activo: true,
    companiaCodigo: '006',
    centroOperacionCodigo: '606',
  });
  assert.equal(reserva.prefijo, 'FAV');
  assert.equal(reserva.consecutivo, 9);
  assert.equal(reserva.companiaCodigo, '006');
  assert.equal(reserva.centroOperacionCodigo, '606');
});

test('rechaza facturar si el centro no tiene un tipo documental configurado', async () => {
  const tx = crearTx(null);
  await assert.rejects(
    reservarNumeroDocumento(tx, 'FACTURA ELECTRONICA DE VENTA', { companiaCodigo: '004', centroOperacionCodigo: '401' }),
    (error) => error.status === 409 && /compañía 004 y el centro 401/.test(error.message),
  );
});

test('exige compañía y centro antes de reservar cualquier consecutivo', async () => {
  const tx = crearTx(null);
  await assert.rejects(
    reservarNumeroDocumento(tx, 'FACTURA ELECTRONICA DE VENTA'),
    (error) => error.status === 400,
  );
});
