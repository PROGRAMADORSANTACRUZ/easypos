export function tipoDocumentoListo(tipos, clase) {
  const esElectronico = clase === 'FACTURA ELECTRONICA DE VENTA';
  return tipos.find((tipo) => tipo.clase === clase && tipo.esElectronico === esElectronico && tipo.activo
    && tipo.prefijo && tipo.consInicial != null && tipo.consFinal != null
    && (tipo.consProximo ?? tipo.consInicial) >= tipo.consInicial
    && (tipo.consProximo ?? tipo.consInicial) <= tipo.consFinal);
}