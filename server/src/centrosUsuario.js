export function centroPermitido(centros, companiaCodigo, centroOperacionCodigo) {
  return Array.isArray(centros) && centros.some((centro) => (
    centro.estado === 'Activo'
    && centro.companiaCodigo === companiaCodigo
    && centro.codigo === centroOperacionCodigo
  ));
}

export function centrosUnicos(codigos) {
  return Array.isArray(codigos)
    ? [...new Set(codigos.filter((codigo) => codigo !== null && codigo !== undefined).map((codigo) => String(codigo).trim()).filter(Boolean))]
    : [];
}
