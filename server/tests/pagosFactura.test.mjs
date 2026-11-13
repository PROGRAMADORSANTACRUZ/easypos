import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { desglosarFactura, efectivoDeFactura } from '../src/routes/aperturas.js';
import { etiquetaPagos, resumirPagos } from '../../client/src/pagosMultiples.js';
import { datosPagoRecibido, separarMetodosPago, separarValoresPago, validarPagosActivos, esMedioEfectivo, codigoPagoDian } from '../src/pagosFactura.js';
import { cargarPagosFactura } from '../src/factus.js';

test('valida conceptos activos al confirmar y conserva codigos e importes aplicados', async () => {
  const formas = [{ id: 'EFE', activo: true }, { id: 'QR', activo: true }, { id: 'DTF', activo: false }];
  const tx = { $queryRaw: async (sql, codigos) => {
    assert.match(sql.join(''), /FOR SHARE/);
    assert.match(sql.join(''), /"Activo" AS "activo"/);
    return formas.filter((forma) => codigos.includes(forma.id));
  } };
  const pagos = [{ formaPago: 'EFE', monto: 13000 }, { formaPago: 'QR', monto: 5000 }];
  await validarPagosActivos(tx, pagos, { total: 18000 });
  assert.equal(separarValoresPago(separarMetodosPago({ total: 18000 }, pagos)).metodoPago1, 'EFE');
  formas[1].activo = false;
  await assert.rejects(validarPagosActivos(tx, pagos, { total: 18000 }), /QR.*inactivo/);
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'DTF', monto: 18000 }]), { status: 400 });
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'OTRO', monto: 18000 }]), /no existe/);
  await assert.rejects(validarPagosActivos(tx, []), /activos/);
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'EFE', monto: 17000 }], { total: 18000 }), /exactamente/);
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'EFE', monto: -1 }]), /positivos/);
});

test('guarda lo recibido y el vuelto solo en efectivo, y el cliente envia lo entregado', async () => {
  const formas = [{ id: 'EFE', activo: true, formaPagoDian: '10-Efectivo' }, { id: 'QR', activo: true, formaPagoDian: '42' }];
  const tx = { $queryRaw: async (sql, codigos) => formas.filter((forma) => codigos.includes(forma.id)) };
  const resumen = resumirPagos([{ formaPago: 'QR', monto: 5000 }, { formaPago: 'EFE', monto: 20000 }], 18000,
    [{ codigo: 'EFE', esEfectivo: true }, { codigo: 'QR' }]);
  assert.deepEqual(resumen.aplicados, [
    { formaPago: 'QR', monto: 5000, recibido: 5000 }, { formaPago: 'EFE', monto: 13000, recibido: 20000 },
  ]);
  await validarPagosActivos(tx, resumen.aplicados, { total: 18000 });
  assert.deepEqual(resumen.aplicados.map(datosPagoRecibido), [
    { formaPago: 'QR', monto: 5000, recibido: 5000, vuelto: 0 },
    { formaPago: 'EFE', monto: 13000, recibido: 20000, vuelto: 7000 },
  ]);
  assert.deepEqual(datosPagoRecibido({ formaPago: 'QR', monto: 30 }), { formaPago: 'QR', monto: 30, recibido: 30, vuelto: 0 });
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'QR', monto: 100, recibido: 150 }]), /Solo el efectivo/);
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'EFE', monto: 100, recibido: 50 }]), /menor/);
});

test('redondea el cobro en efectivo hacia abajo a $50 y registra la diferencia como ajuste al peso', async () => {
  const medios = [{ codigo: 'EFE', esEfectivo: true }, { codigo: 'DAT' }];
  const efectivo = resumirPagos([{ formaPago: 'EFE', monto: 20000 }], 15527, medios);
  assert.equal(efectivo.ajuste, 27);
  assert.equal(efectivo.vuelto, 4500);
  assert.equal(efectivo.valido, true);
  assert.deepEqual(efectivo.aplicados, [
    { formaPago: 'EFE', monto: 15500, recibido: 20000 }, { formaPago: 'AJP', monto: 27, recibido: 27 },
  ]);
  const mixto = resumirPagos([{ formaPago: 'DAT', monto: 10000 }, { formaPago: 'EFE', monto: 5500 }], 15547, medios);
  assert.deepEqual([mixto.ajuste, mixto.pendiente, mixto.valido], [47, 0, true]);
  assert.equal(resumirPagos([{ formaPago: 'DAT', monto: 15527 }], 15527, medios).ajuste, 0);
  assert.equal(resumirPagos([{ formaPago: 'DAT', monto: 15500 }, { formaPago: 'EFE', monto: 100 }], 15527, medios).ajuste, 0);

  const formas = [{ id: 'EFE', activo: true, formaPagoDian: '10' }, { id: 'DAT', activo: true }, { id: 'AJP', activo: true }];
  const tx = { $queryRaw: async (sql, codigos) => formas.filter((forma) => codigos.includes(forma.id)) };
  await validarPagosActivos(tx, efectivo.aplicados, { total: 15527 });
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'DAT', monto: 15500 }, { formaPago: 'AJP', monto: 27 }]), /ajuste al peso/);
  await assert.rejects(validarPagosActivos(tx, [{ formaPago: 'EFE', monto: 15450 }, { formaPago: 'AJP', monto: 77 }]), /ajuste al peso/);
});

test('reconoce efectivo por Cpto caja, DIAN configurado y registros historicos', () => {
  assert.equal(esMedioEfectivo('EFE'), true);
  assert.equal(esMedioEfectivo('EFECTIVO'), true);
  assert.equal(esMedioEfectivo('CAJ', [{ id: 'CAJ', formaPagoDian: '10-Efectivo' }]), true);
  assert.equal(esMedioEfectivo('QR'), false);
  assert.equal(efectivoDeFactura({ total: 18000, metodoPago: 'EFE $13.000 + QR $5.000' }), 13000);
  assert.equal(efectivoDeFactura({ total: 18000, metodoPago: 'EFE' }), 18000);
  assert.equal(efectivoDeFactura({ total: 18000, metodoPago: 'EFECTIVO' }), 18000);
  assert.equal(efectivoDeFactura({ total: 18000, metodoPago: 'CAJ1 $13.000 + QR $5.000' }, [{ id: 'CAJ1', formaPagoDian: '10-Efectivo' }]), 13000);
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'EFE $20.000 + QR $13.000' }), [
    { metodo: 'EFE', monto: 20000 }, { metodo: 'QR', monto: 13000 },
  ]);
});

test('los conceptos usan su parametro DIAN sin convertir datafonos ni transferencias en efectivo', () => {
  assert.equal(codigoPagoDian('EFE'), '10');
  assert.equal(codigoPagoDian('DTF'), '48');
  assert.equal(codigoPagoDian('QR'), '42');
  assert.equal(codigoPagoDian('DTF', [{ id: 'DTF', formaPagoDian: '49-Tarjeta Debito' }]), '49');
  assert.equal(codigoPagoDian('BON', [{ id: 'BON' }]), 'ZZZ');
  assert.equal(codigoPagoDian('DOM'), 'ZZZ');
  assert.equal(codigoPagoDian('TARJETA'), '48');
});

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
    assert.equal(separarValoresPago(centavos).valor2, 8000.75);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', codigo]);
});

test('separa cada medio de su importe numerico y deja los pares no usados en cero', () => {
  assert.deepEqual(separarValoresPago({
    metodoPago1: 'EFECTIVO $10.000', metodoPago2: 'TARJETA $10.000', metodoPago3: 'TRANSFERENCIA $17.400', metodoPago4: '0',
  }), {
    metodoPago1: 'EFECTIVO', valor1: 10000,
    metodoPago2: 'TARJETA', valor2: 10000,
    metodoPago3: '0', valor3: 0,
    metodoPago4: 'TRANSFERENCIA', valor4: 17400,
  });
});

test('los valores separados conservan centavos y reconocen el espacio monetario del cliente', () => {
  const resultado = separarValoresPago({ metodoPago1: `TARJETA $${String.fromCharCode(160)}25.000,75` });
  assert.equal(resultado.metodoPago2, 'TARJETA');
  assert.equal(resultado.valor2, 25000.75);
  assert.equal(typeof resultado.valor2, 'number');
  assert.equal(resultado.valor4, 0);
});

test('separa sin recalcular los importes historicos ni inventar valores ausentes', () => {
  assert.equal(separarValoresPago({ metodoPago1: 'EFECTIVO $10.000' }).valor1, 10000);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO' }), /importe verificable/);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO $0' }), /positivo/);
  assert.throws(() => separarValoresPago({ metodoPago1: 'EFECTIVO $10,123' }), /importe verificable/);
});

test('EFE, ambos datafonos y QR tienen posiciones fijas sin depender del orden', () => {
  for (const datafono of ['DAT', 'DTF']) {
    const resultado = separarValoresPago({ metodoPago1: `${datafono} $8.000`, metodoPago2: 'QR $9.400', metodoPago3: 'EFE $20.000' });
    assert.deepEqual(resultado, {
      metodoPago1: 'EFE', valor1: 20000, metodoPago2: datafono, valor2: 8000,
      metodoPago3: 'QR', valor3: 9400, metodoPago4: '0', valor4: 0,
    });
  }
  const soloQr = separarValoresPago({ metodoPago1: 'QR $1.000,25' });
  assert.equal(soloQr.metodoPago1, '0');
  assert.equal(soloQr.valor3, 1000.25);
});

test('conserva otros medios en cuarta y columnas libres y agrupa ambos datafonos', () => {
  const otros = separarValoresPago({ metodoPago1: 'PSE $100', metodoPago2: 'TRE $200', metodoPago3: 'QR $300', metodoPago4: 'TRH $400' });
  assert.equal(otros.metodoPago4, 'PSE');
  assert.equal(otros.metodoPago1, 'TRE');
  assert.equal(otros.metodoPago2, 'TRH');
  assert.equal(otros.metodoPago3, 'QR');
  const datafonos = separarValoresPago({ metodoPago1: 'DAT $5.000', metodoPago2: 'DTF $3.000', metodoPago3: 'EFE $2.000' });
  assert.equal(datafonos.metodoPago2, 'DAT/DTF');
  assert.equal(datafonos.valor2, 8000);
  assert.equal(datafonos.valor1, 2000);
});

test('PostgreSQL y la aplicacion fijan las mismas posiciones y no cambian al repetir', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFile } = await import('node:fs/promises');
  const { ubicarPagosFactura } = await import('../src/pagosFactura.js');
  const db = new PGlite();
  try {
    for (const tabla of ['Factura', 'FacturaVenta']) await db.exec(`CREATE TABLE "${tabla}" (id SERIAL PRIMARY KEY, metodopago1 TEXT DEFAULT '0', valor1 NUMERIC(18,2) DEFAULT 0, metodopago2 TEXT DEFAULT '0', valor2 NUMERIC(18,2) DEFAULT 0, metodopago3 TEXT DEFAULT '0', valor3 NUMERIC(18,2) DEFAULT 0, metodopago4 TEXT DEFAULT '0', valor4 NUMERIC(18,2) DEFAULT 0)`);
    const sql = await readFile(new URL('../prisma/migrations/20261110170000_posiciones_fijas_medios_pago/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const casos = [
      [{ metodo: 'DTF', monto: 8000 }, { metodo: 'EFE', monto: 20000 }, { metodo: 'QR', monto: 9400 }],
      [{ metodo: 'QR', monto: 1000.25 }],
      [{ metodo: 'DAT', monto: 5000 }, { metodo: 'DTF', monto: 3000 }, { metodo: 'EFE', monto: 2000 }],
      [{ metodo: 'PSE', monto: 100 }, { metodo: 'TRH', monto: 200 }, { metodo: 'TRE', monto: 300 }, { metodo: 'QR', monto: 400 }],
      [{ metodo: 'EFECTIVO', monto: 10000 }, { metodo: 'TARJETA', monto: 10000 }, { metodo: 'TRANSFERENCIA', monto: 17400 }],
    ];
    for (const tabla of ['Factura', 'FacturaVenta']) {
      for (const caso of casos) {
        const pagos = [...caso, ...Array.from({ length: 4 - caso.length }, () => ({ metodo: '0', monto: 0 }))];
        const esperado = ubicarPagosFactura(pagos);
        const repetido = ubicarPagosFactura([1, 2, 3, 4].map((indice) => ({ metodo: esperado[`metodoPago${indice}`], monto: esperado[`valor${indice}`] })));
        assert.deepEqual(repetido, esperado);
        const { rows: [fila] } = await db.query(`INSERT INTO "${tabla}" (metodopago1,valor1,metodopago2,valor2,metodopago3,valor3,metodopago4,valor4) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, pagos.flatMap((pago) => [pago.metodo, pago.monto]));
        for (const indice of [1, 2, 3, 4]) {
          assert.equal(fila[`metodopago${indice}`], esperado[`metodoPago${indice}`]);
          assert.equal(Number(fila[`valor${indice}`]), esperado[`valor${indice}`]);
        }
        await db.exec(sql);
        const { rows: [despues] } = await db.query(`SELECT * FROM "${tabla}" WHERE id=$1`, [fila.id]);
        assert.deepEqual(despues, fila);
      }
    }
  } finally { await db.close(); }
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
  const pagos = [{ formaPago: 'EFECTIVO', monto: 15000 }, { formaPago: 'TARJETA', monto: 10000.5 }];
  const metodoPago = etiquetaPagos(pagos, 25000.5);
  assert.deepEqual(desglosarFactura({ total: 25000.5, propina: 0, metodoPago }), [
    { metodo: 'EFECTIVO', monto: 15000 }, { metodo: 'TARJETA', monto: 10000.5 },
  ]);
});

test('solo una conversion historica explicita conserva importes que no cuadran', () => {
  const factura = { total: 36720, propina: 3400, metodoPago: 'EFECTIVO $10.000 + TARJETA $10.000 + TRANSFERENCIA $17.400' };
  assert.throws(() => separarMetodosPago(factura), /exactamente/);
  assert.deepEqual(separarMetodosPago(factura, [], { conservarImportesRegistrados: true }), {
    metodoPago1: 'EFECTIVO $10.000', metodoPago2: 'TARJETA $10.000', metodoPago3: 'TRANSFERENCIA $17.400', metodoPago4: '0',
  });
});

test('Factus recupera los pagos por factura cuando Prisma no incluyo la relacion', async () => {
  let filtro;
  const pagos = await cargarPagosFactura({ id: 'factura-1' }, async (where) => {
    filtro = where;
    return [{ formaPago: 'EFE', monto: 12000 }, { formaPago: 'QR', monto: 8000 }];
  });
  assert.deepEqual(filtro, { facturaId: 'factura-1' });
  assert.deepEqual(pagos, [{ formaPago: 'EFE', monto: 12000 }, { formaPago: 'QR', monto: 8000 }]);
  assert.deepEqual(await cargarPagosFactura({ pagos: [{ formaPago: 'DTF', monto: 1 }] }), [{ formaPago: 'DTF', monto: 1 }]);
  assert.deepEqual(await cargarPagosFactura({}), []);
});