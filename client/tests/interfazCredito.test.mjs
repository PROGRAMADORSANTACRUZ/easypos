import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ExcelJS from 'exceljs';

const fuente = await readFile(new URL('../src/pages/Facturas.jsx', import.meta.url), 'utf8');
const inicio = fuente.indexOf('  const exportarInterfaz = async () => {');
const fin = fuente.indexOf('\n  const reenviarDian =', inicio);
assert.ok(inicio >= 0 && fin > inicio);
const exportador = fuente.slice(inicio, fin);

function factura(datos = {}) {
  return {
    id: 'factura-prueba', prefijo: 'FV', numeroFactura: '228',
    companiaCodigo: '004', centroOperacionCodigo: '420', createdAt: '2026-09-29T15:00:00Z',
    credito: true, metodoPago: 'CREDITO', total: 34000,
    cliente: { numeroDocumento: '900391505' },
    detalle: [{ total: 34000, iva: 4000, producto: { impuesto: { nombre: 'Impuesto de prueba', ctaCreditoVentas: '240801', ctaDebitoVentas: '240802', cuentasBase: '413501', cuentasBaseDevoluciones: '417501' } } }],
    ...datos,
  };
}

async function exportar(facturas, electronica = false) {
  let archivo;
  const avisos = [];
  const enlaces = [];
  const contexto = {
    electronica, facturasFiltradas: facturas, ExcelJS, Blob,
    filtroFecha: { desde: '2026-09-29', hasta: '2026-09-29' },
    diaColombia: fecha => fecha.slice(0, 10),
    numeroDian: registro => `${registro.prefijo}${registro.numeroFactura}`,
    notify: (...argumentos) => avisos.push(argumentos),
    URL: { createObjectURL: blob => { archivo = blob; return 'blob:prueba'; }, revokeObjectURL: () => {} },
    document: { createElement: () => { const enlace = { click() { enlaces.push(this.download); } }; return enlace; } },
  };
  const ejecutar = new Function(...Object.keys(contexto), `${exportador}\nreturn exportarInterfaz();`);
  await ejecutar(...Object.values(contexto));
  const filas = [];
  if (archivo) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    libro.worksheets[0].eachRow((fila, numero) => { if (numero > 1) filas.push(fila.values.slice(1)); });
  }
  return { filas, avisos, enlaces };
}

test('credito genera debito a 1305050101 y conserva ingresos e impuesto', async () => {
  const { filas, avisos, enlaces } = await exportar([factura()]);
  assert.deepEqual(avisos, []);
  assert.equal(enlaces.length, 1);
  assert.equal(filas.length, 3);
  assert.deepEqual(filas[0], ['004', '420', 'DVP', '263', '1305050101', '900391505', '420', '001', '', '', 34000, 0, 0, '', '', 'VENTAS INTERFAZ 29 SEPTIEMBRE', 'FV228']);
  assert.equal(filas[1][4], '240801');
  assert.equal(filas[1][11], 4000);
  assert.equal(filas[2][4], '413501');
  assert.equal(filas[2][11], 30000);
  assert.equal(filas.reduce((total, fila) => total + fila[10], 0), filas.reduce((total, fila) => total + fila[11], 0));
});

test('reconoce credito con plazo y sin bandera en documentos anteriores', async () => {
  for (const metodoPago of ['CREDITO', 'CR\u00c9DITO 30 D\u00cdAS', ' cr\u00e9dito ']) {
    const { filas } = await exportar([factura({ credito: undefined, metodoPago })]);
    assert.equal(filas[0][4], '1305050101');
    assert.equal(filas[0][10], 34000);
  }
});

test('contado y tarjeta de credito no generan cartera', async () => {
  for (const metodoPago of ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA CREDITO', 'TARJETA', 'EFECTIVO + TARJETA']) {
    const { filas } = await exportar([factura({ credito: false, metodoPago })]);
    assert.equal(filas.length, 2);
    assert.ok(filas.every(fila => fila[4] !== '1305050101'));
  }
});

test('dos facturas generan debitos separados con su tercero y numero', async () => {
  const segunda = factura({ numeroFactura: '229', cliente: { documento: '830505537' }, total: 101300, detalle: [{ total: 101300, iva: 0, producto: { impuesto: { cuentasBase: '413501' } } }] });
  const { filas } = await exportar([factura(), segunda]);
  const cartera = filas.filter(fila => fila[4] === '1305050101');
  assert.deepEqual(cartera.map(fila => [fila[5], fila[10], fila[16]]), [['900391505', 34000, 'FV228'], ['830505537', 101300, 'FV229']]);
});

test('devolucion a credito revierte la cartera y los ingresos', async () => {
  const registro = factura();
  registro.total = -34000;
  registro.detalle[0].total = -34000;
  registro.detalle[0].iva = -4000;
  const { filas } = await exportar([registro]);
  assert.equal(filas[0][10], 0);
  assert.equal(filas[0][11], 34000);
  assert.equal(filas.reduce((total, fila) => total + fila[10], 0), filas.reduce((total, fila) => total + fila[11], 0));
});

test('no genera archivos de factura electronica ni oculta cuentas faltantes', async () => {
  assert.equal((await exportar([factura()], true)).enlaces.length, 0);
  const registro = factura();
  registro.detalle[0].producto.impuesto.cuentasBase = '';
  const resultado = await exportar([registro]);
  assert.equal(resultado.enlaces.length, 0);
  assert.match(resultado.avisos[0][0], /CUENTA BASE/);
});