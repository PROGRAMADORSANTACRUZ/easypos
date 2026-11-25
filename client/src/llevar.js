// "Para llevar" por producto: se guarda como prefijo "LLEVAR" en las notas del item, asi viaja con el
// pedido a cocina y a la comanda impresa sin cambiar la base de datos.
const MARCA = 'LLEVAR';
const PREFIJO = /^LLEVAR\b\s*(·\s*)?/i;

export const esLlevar = (notas) => PREFIJO.test(String(notas || '').trim());

export const notasSinLlevar = (notas) => String(notas || '').trim().replace(PREFIJO, '').trim();

export const alternarLlevar = (notas) => (esLlevar(notas)
  ? notasSinLlevar(notas)
  : [MARCA, notasSinLlevar(notas)].filter(Boolean).join(' · '));
