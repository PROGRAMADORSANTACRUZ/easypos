import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Prisma, PrismaClient } from '@prisma/client';
import { crearAdaptadorFacturas } from '../src/facturasPersistencia.js';
import { separarMetodosPago } from '../src/pagosFactura.js';

const migracion = await readFile(new URL('../prisma/migrations/20261104120000_facturas_cabeceras_clave_compuesta/migration.sql', import.meta.url), 'utf8');
const pausa = await readFile(new URL('../scripts/pausar-facturacion.sql', import.meta.url), 'utf8');
const migracionPagos = await readFile(new URL('../prisma/migrations/20261104130000_facturas_cuatro_metodos_pago/migration.sql', import.meta.url), 'utf8');
const retirarMetodoAnterior = await readFile(new URL('../prisma/migrations/20261104140000_facturas_retirar_metodo_pago_anterior/migration.sql', import.meta.url), 'utf8');
const usuario = '00000000-0000-4000-8000-000000000001';
const tipo = '00000000-0000-4000-8000-000000000002';
const facturaId = '00000000-0000-4000-8000-000000000003';
const columnas = [
  'CompaniaCodigo', 'CentroOperacionCodigo', 'TipoDocumento', 'fecha', 'numero',
  'NumeroDocumentoCliente', 'NombreCliente', 'SucursalCliente', 'TelefonoCliente',
  'DireccionCliente', 'BarrioCliente', 'CiudadCliente', 'EmailCliente', 'Subtotal',
  'impuestoPct', 'IVA', 'Total', 'Propina', 'metodoPago', 'credito', 'creditoDias',
  'vence', 'CUFE', 'NumeroFactus', 'XmlPath', 'PdfPath', 'EstadoDIAN', 'Usuario',
];

async function baseAnterior() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE "Compania" ("Codigo" varchar(3) PRIMARY KEY);
    CREATE TABLE "CentrosOperaciones" ("Codigo" varchar(10) PRIMARY KEY);
    CREATE TABLE "Usuarios" ("Id" uuid PRIMARY KEY, "Usuario" varchar(50));
    CREATE TABLE "TiposDocumento" ("Id" uuid PRIMARY KEY, "CompaniaCodigo" varchar(3), "CentroOperacionCodigo" varchar(10), "Prefijo" varchar(20));
    INSERT INTO "Compania" VALUES ('006');
    INSERT INTO "CentrosOperaciones" VALUES ('606');
    INSERT INTO "Usuarios" VALUES ('${usuario}', 'cajero606');
    INSERT INTO "TiposDocumento" VALUES ('${tipo}', '006', '606', 'DVP');
  `);
  for (const tabla of ['Factura', 'FacturaVenta']) {
    const venta = tabla === 'FacturaVenta';
    await db.exec(`
      CREATE TABLE "${tabla}" (
        "Id" uuid PRIMARY KEY, "CompaniaCodigo" varchar(3), "CentroOperacionCodigo" varchar(10),
        "${venta ? 'Numero' : 'NumeroFactura'}" varchar(50), "Prefijo" varchar(20),
        "TipoDocumentoId" uuid, "UsuarioId" uuid, "${venta ? 'PedidoId' : 'pedidoId'}" integer NOT NULL,
        "ClienteId" uuid, "AperturaId" uuid, "DivisionCuentaId" uuid,
        "Fecha" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "NumeroDocumentoCliente" text, "NombreCliente" text, "SucursalCliente" varchar(200),
        "TelefonoCliente" varchar(50), "DireccionCliente" text, "BarrioCliente" text,
        "CiudadCliente" text, "EmailCliente" varchar(150),
        "Subtotal" double precision NOT NULL, "${venta ? 'ImpuestoPct' : 'impuestoPct'}" double precision NOT NULL,
        "IVA" double precision NOT NULL, "Total" double precision NOT NULL,
        "Propina" double precision NOT NULL DEFAULT 0,
        "${venta ? 'MetodoPago' : 'metodoPago'}" text NOT NULL DEFAULT 'EFECTIVO',
        "${venta ? 'Credito' : 'credito'}" boolean NOT NULL DEFAULT false,
        "${venta ? 'CreditoDias' : 'creditoDias'}" integer, "${venta ? 'Vence' : 'vence'}" timestamp(3),
        "CUFE" varchar(200), "NumeroFactus" varchar(50), "XmlPath" text, "PdfPath" text, "EstadoDIAN" varchar(50),
        ${venta ? '"Consecutivo" integer, "Estado" varchar(20) DEFAULT \'FACTURADA\', "Observaciones" text, "ValidezDias" integer,' : ''}
        CONSTRAINT "${tabla}_CompaniaCodigo_fkey" FOREIGN KEY ("CompaniaCodigo") REFERENCES "Compania"("Codigo") ON DELETE SET NULL,
        CONSTRAINT "${tabla}_CentroOperacionCodigo_fkey" FOREIGN KEY ("CentroOperacionCodigo") REFERENCES "CentrosOperaciones"("Codigo") ON DELETE SET NULL
      );
      CREATE INDEX "${tabla}_pedido_idx" ON "${tabla}" ("${venta ? 'PedidoId' : 'pedidoId'}");
      INSERT INTO "${tabla}" ("Id", "CompaniaCodigo", "CentroOperacionCodigo", "${venta ? 'Numero' : 'NumeroFactura'}", "Prefijo",
        "TipoDocumentoId", "UsuarioId", "${venta ? 'PedidoId' : 'pedidoId'}", "NombreCliente", "Subtotal", "${venta ? 'ImpuestoPct' : 'impuestoPct'}", "IVA", "Total", "Fecha")
      VALUES ('${facturaId}', '006', '606', '184', 'DVP', '${tipo}', '${usuario}', 8, 'Cliente historico', 100, 19, 19, 119, '2026-09-01 14:15:16.123');
      UPDATE "${tabla}" SET "NumeroDocumentoCliente" = '12345678', "SucursalCliente" = 'Principal',
        "TelefonoCliente" = '3000000000', "DireccionCliente" = 'Calle 1', "BarrioCliente" = 'Centro',
        "CiudadCliente" = 'Cali', "EmailCliente" = 'cliente@example.test', "Propina" = 12.5,
        "${venta ? 'MetodoPago' : 'metodoPago'}" = 'TRANSFERENCIA', "${venta ? 'Credito' : 'credito'}" = true,
        "${venta ? 'CreditoDias' : 'creditoDias'}" = 30, "${venta ? 'Vence' : 'vence'}" = '2026-10-01 14:15:16.123',
        "CUFE" = 'cufe-historico', "NumeroFactus" = 'FE184', "XmlPath" = '/facturas/184.xml',
        "PdfPath" = '/facturas/184.pdf', "EstadoDIAN" = '${venta ? 'NO_APLICA' : 'ACEPTADA'}';
    `);
  }
  await db.exec(`
    CREATE TABLE "FacturaDetalle" (id integer PRIMARY KEY, "FacturaId" uuid REFERENCES "Factura"("Id") ON DELETE CASCADE);
    CREATE TABLE "Pagos" (id integer PRIMARY KEY, "FacturaVentaId" uuid REFERENCES "FacturaVenta"("Id") ON DELETE SET NULL);
    INSERT INTO "FacturaDetalle" VALUES (1, '${facturaId}');
    INSERT INTO "Pagos" VALUES (1, '${facturaId}');
  `);
  return db;
}

test('migra ambas cabeceras con columnas exactas, conserva valores y mantiene vinculos', async () => {
  const db = await baseAnterior();
  try {
    await db.exec(migracion);
    for (const tabla of ['Factura', 'FacturaVenta']) {
      const estructura = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [tabla]);
      assert.deepEqual(estructura.rows.map((fila) => fila.column_name), columnas);
      const { rows: [cabecera] } = await db.query(`SELECT * FROM "${tabla}"`);
      assert.equal(cabecera.numero, 184);
      assert.equal(cabecera.TipoDocumento, 'DVP');
      assert.equal(cabecera.Usuario, 'cajero606');
      assert.equal(cabecera.Total, 119);
      assert.equal(cabecera.metodoPago, 'TRANSFERENCIA');
      assert.equal(cabecera.credito, true);
      assert.equal(cabecera.creditoDias, 30);
      assert.equal(cabecera.Propina, 12.5);
      assert.equal(cabecera.NumeroDocumentoCliente, '12345678');
      assert.equal(cabecera.CUFE, 'cufe-historico');
      assert.equal(cabecera.XmlPath, '/facturas/184.xml');
      const fecha = await db.query(`SELECT to_char(fecha, 'YYYY-MM-DD HH24:MI:SS.MS') AS valor FROM "${tabla}"`);
      assert.equal(fecha.rows[0].valor, '2026-09-01 14:15:16.123');
      const { rows: [operacion] } = await db.query(`SELECT * FROM "${tabla}Operacion"`);
      assert.equal(operacion.Id, facturaId);
      assert.equal(operacion.Total, undefined);
      assert.equal(operacion.numero, 184);
      const respaldo = await db.query(`SELECT "Total" FROM respaldo_facturas_20261104."${tabla}"`);
      assert.equal(respaldo.rows[0].Total, 119);
    }
    assert.equal((await db.query('SELECT count(*)::int AS cantidad FROM "FacturaDetalle" d JOIN "FacturaOperacion" f ON f."Id" = d."FacturaId"')).rows[0].cantidad, 1);
    assert.equal((await db.query('SELECT count(*)::int AS cantidad FROM "Pagos" p JOIN "FacturaVentaOperacion" f ON f."Id" = p."FacturaVentaId"')).rows[0].cantidad, 1);
    await assert.rejects(db.exec(`INSERT INTO "Factura" SELECT * FROM "Factura"`), /duplicate key/);
    await db.exec('DELETE FROM "Factura"');
    assert.equal((await db.query('SELECT count(*)::int AS cantidad FROM "FacturaDetalle"')).rows[0].cantidad, 0);
  } finally { await db.close(); }
});

for (const [nombre, preparar, mensaje] of [
  ['numero con prefijo', `UPDATE "Factura" SET "NumeroFactura" = 'DVP184'`, /sin clave/],
  ['numero fuera del rango entero', `UPDATE "Factura" SET "NumeroFactura" = '2147483648'`, /sin clave/],
  ['usuario ausente', `UPDATE "FacturaVenta" SET "UsuarioId" = NULL`, /sin clave/],
  ['tipo de otro centro', `UPDATE "Factura" SET "CentroOperacionCodigo" = NULL; UPDATE "TiposDocumento" SET "CentroOperacionCodigo" = '607'`, /sin clave/],
  ['consecutivos contradictorios', `UPDATE "FacturaVenta" SET "Consecutivo" = 185`, /diferentes/],
  ['clave duplicada', `INSERT INTO "Factura" SELECT '00000000-0000-4000-8000-000000000004'::uuid, "CompaniaCodigo", "CentroOperacionCodigo", '0184', "Prefijo", "TipoDocumentoId", "UsuarioId", "pedidoId", "ClienteId", "AperturaId", "DivisionCuentaId", "Fecha", "NumeroDocumentoCliente", "NombreCliente", "SucursalCliente", "TelefonoCliente", "DireccionCliente", "BarrioCliente", "CiudadCliente", "EmailCliente", "Subtotal", "impuestoPct", "IVA", "Total", "Propina", "metodoPago", credito, "creditoDias", vence, "CUFE", "NumeroFactus", "XmlPath", "PdfPath", "EstadoDIAN" FROM "Factura"`, /duplicadas/],
]) {
  test(`cancela sin alterar tablas ante ${nombre}`, async () => {
    const db = await baseAnterior();
    try {
      await db.exec(preparar);
      await assert.rejects(db.exec(migracion), mensaje);
      await db.exec('ROLLBACK');
      assert.equal((await db.query(`SELECT count(*)::int AS cantidad FROM "Factura"`)).rows[0].cantidad, nombre === 'clave duplicada' ? 2 : 1);
      assert.equal((await db.query(`SELECT to_regclass('"FacturaOperacion"') AS tabla`)).rows[0].tabla, null);
      assert.equal((await db.query(`SELECT to_regnamespace('respaldo_facturas_20261104') AS esquema`)).rows[0].esquema, null);
    } finally { await db.close(); }
  });
}

for (const coincide of [true, false]) {
  test(`la desvinculacion autorizada ${coincide ? 'conserva la cabecera historica' : 'rechaza un documento diferente'}`, async () => {
    const db = await baseAnterior();
    const tipoIncorrecto = '00000000-0000-4000-8000-000000000088';
    try {
      await db.exec(`INSERT INTO "TiposDocumento" VALUES ('${tipoIncorrecto}', '004', '420', 'FEV');
        UPDATE "Factura" SET "TipoDocumentoId" = '${tipoIncorrecto}'`);
      await db.query('SELECT set_config($1,$2,false)', ['pos.facturas_desvincular_tipo', JSON.stringify([{
        tabla: 'Factura', id: facturaId, compania: '006', centro: '606', tipo: 'DVP',
        numero: coincide ? '184' : '185', tipo_id: tipoIncorrecto,
      }])]);
      if (!coincide) {
        await assert.rejects(db.exec(migracion), /no coincide exactamente/);
        await db.exec('ROLLBACK');
        assert.equal((await db.query('SELECT "TipoDocumentoId" FROM "Factura"')).rows[0].TipoDocumentoId, tipoIncorrecto);
        return;
      }
      await db.exec(migracion);
      const { rows: [cabecera] } = await db.query('SELECT * FROM "Factura"');
      assert.equal(cabecera.CompaniaCodigo, '006');
      assert.equal(cabecera.CentroOperacionCodigo, '606');
      assert.equal(cabecera.TipoDocumento, 'DVP');
      assert.equal(cabecera.numero, 184);
      assert.equal(cabecera.Total, 119);
      assert.equal(cabecera.CUFE, 'cufe-historico');
      assert.equal((await db.query('SELECT "TipoDocumentoId" FROM "FacturaOperacion"')).rows[0].TipoDocumentoId, null);
      assert.equal((await db.query('SELECT "TipoDocumentoId" FROM respaldo_facturas_20261104."Factura"')).rows[0].TipoDocumentoId, tipoIncorrecto);
      assert.equal((await db.query('SELECT "TipoDocumentoId" FROM "FacturaVentaOperacion"')).rows[0].TipoDocumentoId, tipo);
    } finally { await db.close(); }
  });
}

test('la pausa bloquea escrituras ordinarias pero permite la sesion de migracion', async () => {
  const db = await baseAnterior();
  try {
    await db.exec(pausa);
    await assert.rejects(db.exec('UPDATE "Factura" SET "Total" = "Total"'), { code: '55000' });
    await assert.rejects(db.exec('UPDATE "FacturaVenta" SET "Total" = "Total"'), { code: '55000' });
    await db.query('SELECT set_config($1,$2,false)', ['pos.migracion_facturas', '20261104']);
    await db.exec(migracion);
    await db.query('SELECT set_config($1,$2,false)', ['pos.migracion_facturas', '']);
    await assert.rejects(db.exec('UPDATE "FacturaOperacion" SET "pedidoId" = "pedidoId"'), { code: '55000' });
    assert.equal((await db.query('SELECT count(*)::int AS cantidad FROM "Factura"')).rows[0].cantidad, 1);
    await db.exec('DROP TRIGGER _pos_facturas_mantenimiento_20261104 ON "FacturaOperacion"; DROP TRIGGER _pos_facturas_mantenimiento_20261104 ON "FacturaVentaOperacion"; DROP FUNCTION public._pos_facturas_mantenimiento_20261104()');
    await db.exec('UPDATE "FacturaOperacion" SET "pedidoId" = "pedidoId"');
  } finally { await db.close(); }
});

test('el cliente Prisma nuevo lee y actualiza las dos tablas migradas', async () => {
  const db = await baseAnterior();
  const socket = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  let cliente;
  try {
    await db.exec(migracion);
    await db.exec(migracionPagos);
    await db.exec(retirarMetodoAnterior);
    await socket.start();
    cliente = new PrismaClient({ datasources: { db: {
      url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
    } } });
    const prisma = crearAdaptadorFacturas(Prisma.dmmf.datamodel.models)(cliente);
    for (const modelo of ['factura', 'facturaVenta']) {
      const factura = await prisma[modelo].findUnique({ where: { id: facturaId } });
      assert.equal(factura.total, 119);
      assert.equal(factura.usuarioNombre, 'cajero606');
      assert.equal(factura.sucursalCliente, 'Principal');
      const actualizada = await prisma[modelo].update({ where: { id: facturaId }, data: { pdfPath: '/nuevo.pdf' } });
      assert.equal(actualizada.pdfPath, '/nuevo.pdf');
      assert.equal(actualizada.total, 119);
    }
  } finally {
    if (cliente) await cliente.$disconnect();
    await socket.stop();
    await db.close();
  }
});

test('Prisma real crea, consulta, actualiza y revierte facturas con el esquema completo', async () => {
  const db = await PGlite.create();
  const socket = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  let cliente;
  try {
    const sql = execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel',
      fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)), '--script',
    ], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test' } });
    const valorSucursal = Prisma.dmmf.datamodel.models.find((modelo) => modelo.name === 'ClienteSucursal')
      .fields.find((campo) => campo.name === 'id').default.args[0];
    await db.exec(sql.replace(valorSucursal, 'NULL'));
    await socket.start();
    const conexion = new URL(`postgresql://postgres:postgres@${socket.getServerConn()}/postgres`);
    conexion.searchParams.set('connection_limit', '1');
    conexion.searchParams.set('sslmode', 'disable');
    cliente = new PrismaClient({ datasources: { db: { url: conexion.toString() } } });
    const prisma = crearAdaptadorFacturas(Prisma.dmmf.datamodel.models)(cliente);
    await prisma.compania.create({ data: { codigo: '006', nit: '123456789', razonSocial: 'Prueba' } });
    await prisma.centroOperacion.create({ data: {
      codigo: '606', companiaCodigo: '006', descripcion: 'Prueba', nombre: 'Alameda', regional: '01',
    } });
    const usuarioFactura = await prisma.usuario.create({ data: { usuario: 'cajero606', nombre: 'Cajero', passwordHash: 'no-utilizable' } });
    const tipoFactura = await prisma.tipoDocumento.create({ data: {
      clase: 'FACTURA DE VENTA (NO ELECTRONICA)', esElectronico: false,
      codigo: '606', prefijo: 'DVP', companiaCodigo: '006', centroOperacionCodigo: '606',
    } });
    const pedido = await prisma.pedido.create({ data: {} });
    const datos = {
      companiaCodigo: '006', centroOperacionCodigo: '606', prefijo: 'DVP', numeroFactura: '184',
      tipoDocumentoId: tipoFactura.id, usuarioId: usuarioFactura.id, pedidoId: pedido.id,
      subtotal: 100, impuestoPct: 19, impuesto: 19, total: 119, credito: true, estadoDIAN: 'NO_APLICA',
      detalle: { create: [{ productoNombre: 'Producto historico', cantidad: 1, total: 119 }] },
    };
    const factura = await prisma.$transaction((tx) => tx.facturaVenta.create({ data: datos, include: { detalle: true, usuario: true } }));
    assert.equal(factura.total, 119);
    assert.equal(factura.detalle.length, 1);
    assert.equal(factura.usuarioNombre, 'cajero606');
    assert.equal(factura.usuario.usuario, 'cajero606');
    assert.equal(factura.numeroFactura, '184');
    assert.equal(factura.consecutivo, 184);
    assert.equal(factura.metodoPago1, '0');
    assert.equal(factura.metodoPago4, '0');
    const tipoElectronico = await prisma.tipoDocumento.create({ data: {
      clase: 'FACTURA ELECTRONICA DE VENTA', esElectronico: true,
      codigo: '606', prefijo: 'FE', companiaCodigo: '006', centroOperacionCodigo: '606',
    } });
    const electronica = await prisma.factura.create({ data: {
      ...datos, prefijo: 'FE', tipoDocumentoId: tipoElectronico.id, estadoDIAN: null,
    }, include: { detalle: true, notasCredito: true, notasDebito: true, retenciones: true } });
    assert.equal(electronica.prefijo, 'FE');
    assert.equal(electronica.total, 119);
    assert.equal(electronica.detalle.length, 1);
    const emitida = await prisma.factura.update({ where: { id: electronica.id }, data: { estadoDIAN: 'ACEPTADA', numeroFactus: 'FE184' } });
    assert.equal(emitida.numeroFactus, 'FE184');
    assert.equal(emitida.estadoDIAN, 'ACEPTADA');
    const listado = await prisma.facturaVenta.findMany({
      where: { credito: true, OR: [{ estadoDIAN: 'NO_APLICA' }, { estadoDIAN: null }] },
      select: { id: true, total: true, createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    assert.equal(listado.length, 1);
    assert.deepEqual(Object.keys(listado[0]).sort(), ['createdAt', 'id', 'total']);
    const pedidoConFacturas = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: { facturasVenta: true } });
    assert.equal(pedidoConFacturas.facturasVenta[0].total, 119);
    const actualizada = await prisma.facturaVenta.update({ where: { id: factura.id }, data: { estadoDIAN: 'ERROR', cufe: 'CUFE-prueba' } });
    assert.equal(actualizada.cufe, 'CUFE-prueba');
    assert.equal(actualizada.estadoDIAN, 'ERROR');
    const tipoConConteo = await prisma.tipoDocumento.findUnique({ where: { id: tipoFactura.id }, include: { _count: { select: { facturasVenta: true } } } });
    assert.equal(tipoConConteo._count.facturasVenta, 1);
    assert.equal(await prisma.facturaVenta.count({ where: { credito: true } }), 1);
    await assert.rejects(prisma.facturaVenta.create({ data: {
      ...datos, numeroFactura: '185', detalle: { create: [{ productoId: '00000000-0000-4000-8000-000000000099' }] },
    } }), /Foreign key constraint/);
    assert.equal(await cliente.facturaVentaCabecera.count(), 1);
    await assert.rejects(prisma.facturaVenta.create({ data: datos }), /Unique constraint/);
    assert.equal(await cliente.facturaVentaCabecera.count(), 1);
    const mixta = await prisma.facturaVenta.create({ data: {
      ...datos, numeroFactura: '186', credito: false, propina: 3, metodoPago: 'TARJETA + TRANSFERENCIA',
      pagos: { create: [{ formaPago: 'TARJETA', monto: 100 }, { formaPago: 'TRANSFERENCIA', monto: 22 }] },
    }, include: { pagos: true } });
    assert.equal(mixta.metodoPago1, 'TARJETA $100');
    assert.equal(mixta.metodoPago2, 'TRANSFERENCIA $22');
    assert.equal(mixta.metodoPago3, '0');
    assert.equal(mixta.metodoPago4, '0');
    assert.equal(mixta.metodoPago, 'TARJETA $100 + TRANSFERENCIA $22');
    assert.equal(mixta.pagos.reduce((suma, pago) => suma + pago.monto, 0), 122);
    const pagoActualizado = await prisma.facturaVenta.update({ where: { id: mixta.id }, data: { metodoPago: 'EFECTIVO' } });
    assert.equal(pagoActualizado.metodoPago1, 'EFECTIVO $122');
    assert.equal(pagoActualizado.metodoPago2, '0');
  } finally {
    if (cliente) await cliente.$disconnect();
    await socket.stop();
    await db.close();
  }
});

test('migra pagos simples y mixtos con propina sin cambiar importes ni etiquetas compatibles', async () => {
  const db = await baseAnterior();
  try {
    await db.exec(migracion);
    await db.exec(`UPDATE "Factura" SET "metodoPago" = 'EFECTIVO $${String.fromCharCode(160)}10.000 + TARJETA $${String.fromCharCode(160)}10.000 + TRANSFERENCIA $${String.fromCharCode(160)}17.400',
      "Total" = 34000, "Propina" = 3400, credito = false;
      UPDATE "FacturaVenta" SET "metodoPago" = 'CRÉDITO 30 días', credito = true, "Propina" = 0`);
    await db.exec(migracionPagos);
    await db.exec(retirarMetodoAnterior);
    for (const tabla of ['Factura', 'FacturaVenta']) {
      const { rows: [cabecera] } = await db.query(`SELECT * FROM "${tabla}"`);
      assert.equal(Object.keys(cabecera).length, 31);
      assert.equal(cabecera.metodoPago, undefined);
      const original = (await db.query(`SELECT * FROM respaldo_pagos_20261104."${tabla}"`)).rows[0];
      const esperados = separarMetodosPago({ total: original.Total, propina: original.Propina, credito: original.credito, metodoPago: original.metodoPago });
      for (let indice = 1; indice <= 4; indice++) assert.equal(cabecera[`metodopago${indice}`], esperados[`metodoPago${indice}`]);
      assert.equal(cabecera.Total, original.Total);
      assert.equal(cabecera.CUFE, original.CUFE);
      assert.equal((await db.query(`SELECT "metodoPago" FROM "${tabla}Operacion"`)).rows[0].metodoPago, original.metodoPago);
    }
  } finally { await db.close(); }
});

test('cancela la migracion de pagos si un mixto no tiene importes verificables', async () => {
  const db = await baseAnterior();
  try {
    await db.exec(migracion);
    await db.exec(`UPDATE "Factura" SET "metodoPago" = 'EFECTIVO + TARJETA', credito = false`);
    await assert.rejects(db.exec(migracionPagos), /sin medio e importe verificables/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query(`SELECT to_regnamespace('respaldo_pagos_20261104') AS esquema`)).rows[0].esquema, null);
    assert.equal((await db.query('SELECT "metodoPago" FROM "Factura"')).rows[0].metodoPago, 'EFECTIVO + TARJETA');
  } finally { await db.close(); }
});

for (const coincide of [true, false]) {
  test(`la excepcion de pagos ${coincide ? 'preserva los importes historicos exactos' : 'rechaza otra factura'}`, async () => {
    const db = await baseAnterior();
    const metodo = 'EFECTIVO $10.000 + TARJETA $10.000 + TRANSFERENCIA $17.400';
    try {
      await db.exec(migracion);
      await db.query('UPDATE "Factura" SET "metodoPago"=$1,"Total"=36720,"Propina"=3400,credito=false', [metodo]);
      await db.query('SELECT set_config($1,$2,false)', ['pos.pagos_conservar_diferencia', JSON.stringify([{
        tabla: 'Factura', compania: '006', centro: '606', tipo: 'DVP', numero: coincide ? 184 : 185,
        total: 36720, propina: 3400, metodo,
      }])]);
      if (!coincide) {
        await assert.rejects(db.exec(migracionPagos), /no coincide exactamente/);
        await db.exec('ROLLBACK');
        assert.equal((await db.query('SELECT "metodoPago" FROM "Factura"')).rows[0].metodoPago, metodo);
        return;
      }
      await db.exec(migracionPagos);
      await db.exec(retirarMetodoAnterior);
      const { rows: [factura] } = await db.query('SELECT * FROM "Factura"');
      assert.equal(factura.metodopago1, 'EFECTIVO $10.000');
      assert.equal(factura.metodopago2, 'TARJETA $10.000');
      assert.equal(factura.metodopago3, 'TRANSFERENCIA $17.400');
      assert.equal(factura.metodopago4, '0');
      assert.equal(factura.Total, 36720);
      assert.equal(factura.Propina, 3400);
      assert.equal(factura.CUFE, 'cufe-historico');
    } finally { await db.close(); }
  });
}