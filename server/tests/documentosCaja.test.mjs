import assert from 'node:assert/strict';
import test from 'node:test';
import { construirDocumentosCaja, claseMedio } from '../src/documentosCaja.js';

const formas = [
  { id: 'EFE', formaPago: 'REC EFECTIVO', formaPagoDian: '10-Efectivo' },
  { id: 'DAT', formaPago: 'DATAFONOS TD-TC', formaPagoDian: '48' },
  { id: 'DBO', formaPago: 'DATAFONOS BOLD', formaPagoDian: '48' },
  { id: 'AJP', formaPago: 'AJUSTE AL PESO', formaPagoDian: null },
];
const cajera = { nombre: 'ACOSTA KATERINE', usuario: 'katerine' };

test('arma recogidas E y cierres G con consecutivo por centro, columnas por medio, faltantes y cuadre fisico', () => {
  const documentos = construirDocumentosCaja({
    formas,
    centros: new Map([['ap1', { compania: '004', centro: '405' }]]),
    recogidas: [
      { id: 'r1', aperturaId: 'ap1', fecha: '2026-11-11T15:00:00Z', monto: 3000000, motivo: 'Recogida', usuario: cajera },
      { id: 'r2', aperturaId: 'ap1', fecha: '2026-11-11T18:00:00Z', monto: 1000000, motivo: 'Recogida', usuario: cajera },
    ],
    aperturas: [{
      id: 'ap1', estado: 'CERRADA', fechaCierre: '2026-11-11T23:00:00Z', caja: { nombre: 'Caja 1' }, usuario: cajera,
      cuadreMedios: { medios: [
        { id: 'EFE', nombre: 'REC EFECTIVO', esperado: 151700, contado: 149500, diferencia: -2200 },
        { id: 'DAT', nombre: 'DATAFONOS TD-TC', esperado: 1287766, contado: 1287766, diferencia: 0 },
        { id: 'DBO', nombre: 'DATAFONOS BOLD', esperado: 5401371, contado: 5401326, diferencia: -45 },
        { id: 'AJP', nombre: 'AJUSTE AL PESO', esperado: 1120, contado: 0, diferencia: -1120 },
        { id: 'QR', nombre: 'QR', esperado: 0, contado: 0, diferencia: 0 },
      ] },
    }],
    pagos: [
      { aperturaId: 'ap1', formaPago: 'DAT', monto: 1287766, referencia: '083115', documento: 'POS1' },
      { aperturaId: 'ap1', formaPago: 'AJP', monto: 27, documento: 'POS2' },
      { aperturaId: 'ap1', formaPago: 'EFE', monto: 4151700, documento: 'POS3' },
    ],
    movimientos: [{ aperturaId: 'ap1', tipo: 'RECOGIDA', monto: 4000000 }, { aperturaId: 'ap1', tipo: 'INGRESO', monto: 5000 }],
  });

  assert.deepEqual(documentos.map((doc) => doc.documento), ['E04-405-00000001', 'E04-405-00000002', 'G04-405-00000001']);
  const [recogida, , cierre] = documentos;
  assert.equal(recogida.otrosEgresos, 3000000);
  assert.equal(recogida.efectivo, 3000000);
  assert.deepEqual(recogida.conceptos, [{ concepto: 'REC_PAR', descripcion: 'RECOGIDA PARCIAL', debito: 3000000, credito: 0 }]);
  assert.deepEqual([recogida.tercero, recogida.cajero, recogida.cuadre], ['katerine', 'ACOSTA KATERINE', []]);

  assert.equal(cierre.recogidas, 6841957);
  assert.deepEqual([cierre.efectivo, cierre.tarjetaCredito, cierre.tarjetaDebito, cierre.otros, cierre.otrosIngresos], [151700, 1287766, 5401371, 1120, 5000]);
  assert.deepEqual(cierre.conceptos.slice(-4), [
    { concepto: 'EFE', descripcion: 'REC EFECTIVO', debito: 0, credito: 2200 },
    { concepto: 'DBO', descripcion: 'DATAFONOS BOLD', debito: 0, credito: 45 },
    { concepto: 'AJP', descripcion: 'AJUSTE AL PESO', debito: 0, credito: 1120 },
    { concepto: 'FAL', descripcion: 'FALTANTE', debito: 3365, credito: 0 },
  ]);
  assert.deepEqual(cierre.medios.map((medio) => [medio.medio, medio.egreso, medio.referencia]), [
    ['EFE', 151700, ''], ['DAT', 1287766, '083115'], ['AJP', 27, 'Redondeo documento'],
  ]);
  assert.equal(cierre.cuadre.length, 4);
  assert.deepEqual(cierre.cuadre[0], { medio: 'EFE', nombre: 'REC EFECTIVO', saldo: 151700, fisico: 149500, diferencia: -2200 });
});

test('reconstruye el saldo de cierres antiguos sin cuadre guardado y clasifica cheques', () => {
  const [cierre] = construirDocumentosCaja({
    formas: [...formas, { id: 'CHQ', formaPago: 'CHEQUE', formaPagoDian: '20-Cheque' }],
    centros: new Map(),
    recogidas: [],
    aperturas: [{ id: 'ap', estado: 'CERRADA', fechaCierre: '2026-11-10T23:00:00Z', usuario: cajera }],
    pagos: [{ aperturaId: 'ap', formaPago: 'EFE', monto: 500 }, { aperturaId: 'ap', formaPago: 'CHQ', monto: 200 }],
    movimientos: [{ aperturaId: 'ap', tipo: 'RECOGIDA', monto: 300 }],
  });
  assert.equal(cierre.documento, 'G00-000-00000001');
  assert.deepEqual([cierre.efectivo, cierre.cheque, cierre.recogidas], [200, 200, 400]);
  assert.equal(cierre.cuadre[0].fisico, null);
  assert.equal(claseMedio('DTF', formas), 'tarjetaCredito');
});
