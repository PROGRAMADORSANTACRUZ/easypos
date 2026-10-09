export async function reservarNumeroDocumento(tx, clase, { companiaCodigo, centroOperacionCodigo } = {}) {
  if (!companiaCodigo || !centroOperacionCodigo) {
    throw Object.assign(new Error('Selecciona compañía y centro de operaciones antes de facturar.'), { status: 400 });
  }
  const esElectronico = clase === 'FACTURA ELECTRONICA DE VENTA';
  for (let intento = 0; intento < 3; intento++) {
    const tipo = await tx.tipoDocumento.findFirst({
      where: { clase, esElectronico, activo: true, companiaCodigo, centroOperacionCodigo },
      orderBy: { createdAt: 'asc' },
    });
    if (!tipo || !tipo.prefijo || tipo.consInicial == null || tipo.consFinal == null) {
      throw Object.assign(new Error(`La compañía ${companiaCodigo} y el centro ${centroOperacionCodigo} no tienen configurado el tipo de documento ${clase} con rango.`), { status: 409 });
    }
    const consecutivo = tipo.consProximo ?? tipo.consInicial;
    if (consecutivo < tipo.consInicial || consecutivo > tipo.consFinal) {
      throw Object.assign(new Error(`El consecutivo de ${clase} está fuera del rango configurado.`), { status: 409 });
    }
    const reserva = await tx.tipoDocumento.updateMany({
      where: { id: tipo.id, consProximo: tipo.consProximo },
      data: { consProximo: consecutivo + 1 },
    });
    if (reserva.count) {
      return {
        prefijo: tipo.prefijo,
        consecutivo,
        tipoDocumentoId: tipo.id,
        companiaCodigo: tipo.companiaCodigo,
        centroOperacionCodigo: tipo.centroOperacionCodigo,
      };
    }
  }
  throw Object.assign(new Error('No se pudo reservar el consecutivo. Intenta de nuevo.'), { status: 409 });
}