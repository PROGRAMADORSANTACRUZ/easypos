// "Para llevar" por producto: se guarda como prefijo "LLEVAR" en las notas del item, asi viaja con el
// pedido a cocina y a la comanda impresa sin cambiar la base de datos.
const MARCA = 'LLEVAR';
const PREFIJO = /^\s*LLEVAR\b\s*(·\s*)?/i;

export const esLlevar = (notas) => PREFIJO.test(String(notas || ''));

// Sin recortar al final: se usa como valor del campo de observacion mientras se escribe.
export const notasSinLlevar = (notas) => String(notas || '').replace(PREFIJO, '');

export const alternarLlevar = (notas) => (esLlevar(notas)
  ? notasSinLlevar(notas).trim()
  : [MARCA, notasSinLlevar(notas).trim()].filter(Boolean).join(' · '));
