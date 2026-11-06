import sql from 'mssql';

const SIESA_SERVER = 'siesa-m6-sqlsw-carnessantacruz.cu94u26q0284.us-east-1.rds.amazonaws.com';
const SIESA_DATABASE = 'UnoEE_Carnesantacruz_Real';
const SIESA_TABLE = '[dbo].[t120_mc_items]';
const SIESA_CA_BUNDLE = 'https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem';
const SIESA_COMPANY_ID = 4;
const SIESA_BATCH_SIZE = 500;
const SIESA_FIELDS = [
  'f120_id_cia',
  'f120_id',
  'f120_rowid',
  'f120_referencia',
  'f120_descripcion',
  'f120_descripcion_corta',
  'f120_id_grupo_impositivo',
  'f120_id_tipo_inv_serv',
  'f120_id_unidad_inventario',
  'f120_id_unidad_orden',
  'f120_id_segmento_costo',
  'f120_usuario_actualizacion',
  'f120_ind_tipo_item',
  'f120_ind_compra',
  'f120_ind_venta',
  'f120_ind_manufactura',
];

function valorTexto(valor) {
  return valor == null ? null : String(valor).trim() || null;
}

function valorIndicador(valor) {
  if (valor == null || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function datosProductoSiesa(item) {
  const referencia = valorTexto(item.f120_referencia);
  const descripcion = valorTexto(item.f120_descripcion);
  const indicadorVenta = valorIndicador(item.f120_ind_venta);
  return {
    referencia,
    indicadorVenta,
    nombre: descripcion || referencia,
    siesaIdCia: valorTexto(item.f120_id_cia),
    siesaId: valorTexto(item.f120_id),
    siesaRowid: valorTexto(item.f120_rowid),
    siesaDescripcion: descripcion,
    siesaDescripcionCorta: valorTexto(item.f120_descripcion_corta),
    siesaIdGrupoImpositivo: valorTexto(item.f120_id_grupo_impositivo),
    siesaIdTipoInv: valorTexto(item.f120_id_tipo_inv_serv),
    siesaIdUnidadInventario: valorTexto(item.f120_id_unidad_inventario),
    siesaIdUnidadOrden: valorTexto(item.f120_id_unidad_orden),
    siesaIdSegmentoCosto: valorTexto(item.f120_id_segmento_costo),
    siesaUsuarioActualizacion: valorTexto(item.f120_usuario_actualizacion),
    siesaIndTipoItem: valorIndicador(item.f120_ind_tipo_item),
    siesaIndCompra: valorIndicador(item.f120_ind_compra),
    siesaIndVenta: indicadorVenta,
    siesaIndManufactura: valorIndicador(item.f120_ind_manufactura),
  };
}

export function referenciasExistentesSiesa(productos, inventarioItems) {
  return [...new Set([...productos, ...inventarioItems]
    .map((item) => valorTexto(item.codigo))
    .filter(Boolean))];
}

export async function actualizarReferenciasExistentesSiesa(prisma) {
  const [productos, inventarioItems] = await Promise.all([
    prisma.producto.findMany({ where: { codigo: { not: null } }, select: { codigo: true } }),
    prisma.inventarioItem.findMany({ where: { codigo: { not: null } }, select: { codigo: true } }),
  ]);
  const referencias = referenciasExistentesSiesa(productos, inventarioItems);
  if (!referencias.length) {
    return { referenciasLocales: 0, consultados: 0, productosActualizados: 0, inventarioActualizados: 0, omitidos: 0 };
  }

  const usuario = process.env.SIESA_SQL_USER || process.env.SIESA_LOCAL_SQL_USER;
  const password = process.env.SIESA_SQL_PASSWORD || process.env.SIESA_LOCAL_SQL_PASSWORD;
  if (!usuario || !password) throw new Error('Faltan SIESA_SQL_USER o SIESA_SQL_PASSWORD en el servidor');

  const caResponse = await fetch(SIESA_CA_BUNDLE);
  if (!caResponse.ok) throw new Error('No se pudo obtener el certificado oficial de Amazon RDS para Siesa');
  const ca = Buffer.from(await caResponse.arrayBuffer());
  const pool = new sql.ConnectionPool({
    server: SIESA_SERVER,
    port: 1433,
    database: SIESA_DATABASE,
    user: usuario,
    password,
    options: { encrypt: true, trustServerCertificate: false, cryptoCredentialsDetails: { ca } },
    connectionTimeout: 15000,
    requestTimeout: 120000,
  });

  const articulos = [];
  try {
    await pool.connect();
    for (let inicio = 0; inicio < referencias.length; inicio += SIESA_BATCH_SIZE) {
      const lote = referencias.slice(inicio, inicio + SIESA_BATCH_SIZE);
      const request = pool.request().input('companyId', sql.Int, SIESA_COMPANY_ID);
      const parametros = lote.map((referencia, indice) => {
        const nombre = `referencia${indice}`;
        request.input(nombre, sql.VarChar(100), referencia);
        return `@${nombre}`;
      });
      const columnas = SIESA_FIELDS.map((campo) => `[${campo}]`).join(', ');
      const resultado = await request.query(
        `SELECT ${columnas} FROM ${SIESA_TABLE} WHERE [f120_id_cia] = @companyId AND [f120_referencia] IN (${parametros.join(', ')})`,
      );
      articulos.push(...resultado.recordset);
    }
  } finally {
    await pool.close().catch(() => {});
  }

  const resultado = await sincronizarItemsSiesa(prisma, articulos);
  return { referenciasLocales: referencias.length, consultados: articulos.length, ...resultado };
}

export async function sincronizarItemsSiesa(prisma, items) {
  if (items.some((item) => valorTexto(item.f120_id_cia) !== '4')) {
    throw new Error('Solo se permite sincronizar artículos de la compañía Siesa 4');
  }
  const productos = items.map(datosProductoSiesa).filter((item) => item.referencia && item.nombre);
  const referencias = new Set();
  for (const item of productos) {
    if (referencias.has(item.referencia)) {
      throw new Error(`Siesa devolvió la referencia duplicada ${item.referencia}`);
    }
    referencias.add(item.referencia);
  }

  const resultado = { productosActualizados: 0, inventarioActualizados: 0, omitidos: items.length - productos.length };
  await prisma.$transaction(async (tx) => {
    for (const item of productos) {
      const { referencia, indicadorVenta, nombre, ...datosSiesa } = item;
      const [producto, inventario] = await Promise.all([
        tx.producto.findUnique({ where: { codigo: referencia }, select: { id: true } }),
        tx.inventarioItem.findUnique({ where: { codigo: referencia }, select: { id: true } }),
      ]);
      if (!producto && !inventario) {
        resultado.omitidos += 1;
        continue;
      }
      if (producto) {
        await tx.producto.update({
          where: { id: producto.id },
          data: {
            nombre,
            ...datosSiesa,
            ...(indicadorVenta == null ? {} : { activo: indicadorVenta === 1 }),
          },
        });
        resultado.productosActualizados += 1;
      }
      if (inventario) {
        await tx.inventarioItem.update({ where: { id: inventario.id }, data: datosSiesa });
        resultado.inventarioActualizados += 1;
      }
    }
  });
  return resultado;
}