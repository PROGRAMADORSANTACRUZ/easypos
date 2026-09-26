const camposTexto = new Set([
  'nombre', 'nombres', 'apellidos', 'nombreComercial', 'descripcion', 'observaciones', 'notas',
  'direccion', 'barrio', 'ciudad', 'razonSocial', 'primerNombre', 'segundoNombre',
  'primerApellido', 'segundoApellido', 'concepto', 'motivo', 'cliente',
]);

export function normalizarTexto(valor) {
  if (Array.isArray(valor)) return valor.map(normalizarTexto);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.entries(valor).map(([campo, dato]) => [
    campo,
    camposTexto.has(campo) && typeof dato === 'string' ? dato.toUpperCase() : normalizarTexto(dato),
  ]));
}

export function mayusculas(req, _res, next) {
  if (req.body) req.body = normalizarTexto(req.body);
  next();
}