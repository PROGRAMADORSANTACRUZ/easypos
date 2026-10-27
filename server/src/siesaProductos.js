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

  const resultado = { actualizados: 0, omitidos: items.length - productos.length };
  await prisma.$transaction(async (tx) => {
    for (const item of productos) {
      const { referencia, indicadorVenta, nombre, ...datosSiesa } = item;
      const existente = await tx.producto.findUnique({ where: { codigo: referencia }, select: { id: true } });
      if (!existente) {
        resultado.omitidos += 1;
        continue;
      }
      const datosBase = {
        nombre,
        ...datosSiesa,
        ...(indicadorVenta == null ? {} : { activo: indicadorVenta === 1 }),
      };

      await tx.producto.update({ where: { id: existente.id }, data: datosBase });
      resultado.actualizados += 1;
    }
  });
  return resultado;
}