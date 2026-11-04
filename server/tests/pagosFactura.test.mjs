import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { desglosarFactura } from '../src/routes/aperturas.js';
import { etiquetaPagos } from '../../client/src/pagosMultiples.js';
import { separarMetodosPago, separarValoresPago } from '../src/pagosFactura.js';

test('cobra 8800 con propina incluso cuando el servidor solo dispone de locale en-US', () => {
  const codigo = `
    import assert from 'node:assert/strict';
    const FormatoOriginal = Intl.NumberFormat;
    Intl.NumberFormat = class extends FormatoOriginal {
      constructor(_locale, opciones) { super('en-US', opciones); }
    };
    const { separarMetodosPago, separarValoresPago } = await import(${JSON.stringify(new URL('../src/pagosFactura.js', import.meta.url).href)});
    const metodos = separarMetodosPago({ total: 8000, propina: 800, metodoPago: 'EFECTIVO' });
    assert.equal(metodos.metodoPago1, 'EFECTIVO $8.800');
    assert.equal(separarValoresPago(metodos).valor1, 8800);
    const centavos = separarMetodosPago({ total: 8000.75, metodoPago: 'TARJETA' });
    assert.equal(centavos.metodoPago1, 'TARJETA $8.000,75');
    assert.equal(separarValoresPago(centavos).valor1, 8000.75);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', codigo]);
});

test('separa cada medio de su importe numerico y deja los pares no usados en cero', () => {
  assert.deepEqual(separarValoresPago({
    metodoPago1: 'EFECTIVO $10.000', metodoPago2: 'TARJETA $10.000', metodoPago3: 'TRANSFERENCIA $17.400', metodoPago4: '0',
  }), {
    metodoPago1: 'EFECTIVO', valor1: 10000,
    metodoPago2: 'TARJETA', valor2: 10000,
    metodoPago3: 'TRANSFERENCIA', valor3: 17400,
    metodoPago4: '0', valor4: 0,
  });
});

test('los valores separados conservan centavos y reconocen el espacio monetario del cliente', () => {
  const resultado = separarValoresPago({ metodoPago1: `TARJETA $${String.fromCharCode(160)}25.000,75` });
  assert.equal(resultado.metodoPago1, 'TARJETA');
  assert.equal(resultado.valor1, 25000.75);
  assert.equal(typeof resultado.valor1, 'number');
  assert.equal(resultado.valor4, 0);
});

test('separa sin recalcular los importes historicos ni inventar valores ausentes', () => {
  assert.equal(separarValoresPago({ metodoPago1: 'EFECTIVO $10.000' }).valor1, 10000);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO' }), /importe verificable/);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO $0' }), /positivo/);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO $10,123' }), /importe verificable/);
});

test('separa tres medios en orden y deja el cuarto en cero sin duplicar propina', () => {
  assert.deepEqual(separarMetodosPago({ total: 34000, propina: 3400, metodoPago: 'EFECTIVO $ 10.000 + TARJETA $ 10.000 + TRANSFERENCIA $ 17.400' }), {
    metodoPago1: 'EFECTIVO $10.000', metodoPago2: 'TARJETA $10.000', metodoPago3: 'TRANSFERENCIA $17.400', metodoPago4: '0',
  });
});

test('un pago simple registra medio e importe y los demas quedan en cero', () => {
  assert.deepEqual(separarMetodosPago({ total: 25000.75, metodoPago: 'TARJETA' }), {
    metodoPago1: 'TARJETA $25.000,75', metodoPago2: '0', metodoPago3: '0', metodoPago4: '0',
  });
});

test('credito sin cobro deja los cuatro campos en cero y no convierte cartera en efectivo', () => {
  assert.deepEqual(separarMetodosPago({ total: 30000, credito: true, metodoPago: 'CRÉDITO 30 días' }), {
    metodoPago1: '0', metodoPago2: '0', metodoPago3: '0', metodoPago4: '0',
  });
  assert.equal(separarMetodosPago({ total: 30000, credito: true, propina: 3000 }).metodoPago1, 'EFECTIVO $3.000');
});

test('agrupa medios repetidos conservando el orden y admite cuatro distintos', () => {
  const pagos = [{ formaPago: 'TARJETA', monto: 10 }, { formaPago: 'EFECTIVO', monto: 5 }, { formaPago: 'TARJETA', monto: 5 }, { formaPago: 'TRANSFERENCIA', monto: 10 }, { formaPago: 'BONO', monto: 10 }];
  assert.deepEqual(separarMetodosPago({ total: 40 }, pagos), {
    metodoPago1: 'TARJETA $15', metodoPago2: 'EFECTIVO $5', metodoPago3: 'TRANSFERENCIA $10', metodoPago4: 'BONO $10',
  });
  assert.throws(() => separarMetodosPago({ total: 41 }, [...pagos, { formaPago: 'OTRO', monto: 1 }]), /hasta cuatro/);
  assert.throws(() => separarMetodosPago({ total: 39 }, pagos), /exactamente/);
});

test('el cierre conserva tres medios sin duplicar la propina ya incluida', () => {
  const partes = desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'EFECTIVO $18.000 + TARJETA $10.000 + TRANSFERENCIA $5.000' });
  assert.deepEqual(partes, [{ metodo: 'EFECTIVO', monto: 18000 }, { metodo: 'TARJETA', monto: 10000 }, { metodo: 'TRANSFERENCIA', monto: 5000 }]);
  assert.equal(partes.reduce((suma, parte) => suma + parte.monto, 0), 33000);
});

test('la propina puede pagarse sin efectivo y no crea una entrada ficticia al cajon', () => {
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'TARJETA $20.000 + TRANSFERENCIA $13.000' }), [
    { metodo: 'TARJETA', monto: 20000 }, { metodo: 'TRANSFERENCIA', monto: 13000 },
  ]);
});

test('conserva el tratamiento de propinas de facturas mixtas anteriores y pagos simples', () => {
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'EFECTIVO $20.000 + TARJETA $10.000' }), [
    { metodo: 'EFECTIVO', monto: 23000 }, { metodo: 'TARJETA', monto: 10000 },
  ]);
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'TARJETA' }), [{ metodo: 'TARJETA', monto: 33000 }]);
});

test('el formato del cliente conserva centavos al calcular el cierre de caja', () => {
  const pagos = [{ formaPago: 'EFECTIVO', monto: 15000.25 }, { formaPago: 'TARJETA', monto: 10000.5 }];
  const metodoPago = etiquetaPagos(pagos, 25000.75);
  assert.deepEqual(desglosarFactura({ total: 25000.75, propina: 0, metodoPago }), [
    { metodo: 'EFECTIVO', monto: 15000.25 }, { metodo: 'TARJETA', monto: 10000.5 },
  ]);
});

test('solo una conversion historica explicita conserva importes que no cuadran', () => {
  const factura = { total: 36720, propina: 3400, metodoPago: 'EFECTIVO $10.000 + TARJETA $10.000 + TRANSFERENCIA $17.400' };
  assert.throws(() => separarMetodosPago(factura), /exactamente/);
  assert.deepEqual(separarMetodosPago(factura, [], { conservarImportesRegistrados: true }), {
    metodoPago1: 'EFECTIVO $10.000', metodoPago2: 'TARJETA $10.000', metodoPago3: 'TRANSFERENCIA $17.400', metodoPago4: '0',
  });
});