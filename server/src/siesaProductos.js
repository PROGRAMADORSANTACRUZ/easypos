const CAMPOS_SIESA = [
  'f120_id_cia',
  'f120_id',
  'f120_rowid',
  'f120_referencia',
  'f120_descripcion',
  'f120_descripcion_corta',
  'f120_id_grupo_impositivo',
  'f120_id_tipo_inv',
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

function nombreTablaConfigurada() {
  const tabla = process.env.SIESA_SQL_ITEMS_TABLE || 'dbo.t120_mc_items';
  if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) {
    throw new Error('SIESA_SQL_ITEMS_TABLE debe tener el formato esquema.tabla');
  }
  return tabla.split('.').map((parte) => `[${parte}]`).join('.');
}

export async function consultarItemsSiesa() {
  const { SIESA_SQL_SERVER, SIESA_SQL_DATABASE, SIESA_SQL_USER, SIESA_SQL_PASSWORD } = process.env;
  if (!SIESA_SQL_SERVER || !SIESA_SQL_DATABASE || !SIESA_SQL_USER || !SIESA_SQL_PASSWORD) {
    const error = new Error('Configura la conexión Siesa en las variables de entorno del servidor');
    error.status = 503;
    throw error;
  }

  const { default: sql } = await import('mssql');
  const pool = new sql.ConnectionPool({
    server: SIESA_SQL_SERVER,
    port: Number(process.env.SIESA_SQL_PORT) || 1433,
    database: SIESA_SQL_DATABASE,
    user: SIESA_SQL_USER,
    password: SIESA_SQL_PASSWORD,
    options: {
      encrypt: process.env.SIESA_SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SIESA_SQL_TRUST_CERT === 'true',
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });

  try {
    await pool.connect();
    const columnas = CAMPOS_SIESA.map((campo) => `[${campo}]`).join(', ');
    const resultado = await pool.request()
      .input('companyId', sql.VarChar(20), '4')
      .query(`SELECT ${columnas} FROM ${nombreTablaConfigurada()} WHERE [f120_id_cia] = @companyId`);
    return resultado.recordset;
  } finally {
    await pool.close().catch(() => {});
  }
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
    siesaIdTipoInv: valorTexto(item.f120_id_tipo_inv),
    siesaIndTipoItem: valorIndicador(item.f120_ind_tipo_item),
    siesaIndCompra: valorIndicador(item.f120_ind_compra),
    siesaIndVenta: indicadorVenta,
    siesaIndManufactura: valorIndicador(item.f120_ind_manufactura),
  };
}

export async function sincronizarItemsSiesa(prisma, items) {
  const productos = items.map(datosProductoSiesa).filter((item) => item.referencia && item.nombre);
  const referencias = new Set();
  for (const item of productos) {
    if (referencias.has(item.referencia)) {
      throw new Error(`Siesa devolvió la referencia duplicada ${item.referencia}`);
    }
    referencias.add(item.referencia);
  }

  const resultado = { creados: 0, actualizados: 0, omitidos: items.length - productos.length };
  await prisma.$transaction(async (tx) => {
    for (const item of productos) {
      const { referencia, indicadorVenta, nombre, ...datosSiesa } = item;
      const existente = await tx.producto.findUnique({ where: { codigo: referencia }, select: { id: true } });
      const datosBase = {
        codigo: referencia,
        nombre,
        ...datosSiesa,
        ...(indicadorVenta == null ? {} : { activo: indicadorVenta === 1 }),
      };

      if (existente) {
        await tx.producto.update({ where: { id: existente.id }, data: datosBase });
        resultado.actualizados += 1;
      } else {
        await tx.producto.create({
          data: { ...datosBase, precio: 0, costo: 0, iva: 0 },
        });
        resultado.creados += 1;
      }
    }
  });
  return resultado;
}