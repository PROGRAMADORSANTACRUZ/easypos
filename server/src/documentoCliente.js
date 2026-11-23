// El numero de documento de un cliente es solo numerico (NIT o cedula sin puntos, guiones ni digito de
// verificacion): Siesa lo usa como codigo del tercero.
export const MAX_DOCUMENTO = 15;
export const MENSAJE_DOCUMENTO = `El número de documento debe tener solo números, sin puntos, guiones ni letras (máximo ${MAX_DOCUMENTO}).`;

// Devuelve el mensaje de error si el valor (ya recortado) no es un documento valido; vacio o ausente es valido.
export function errorDocumento(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  return new RegExp(`^\\d{1,${MAX_DOCUMENTO}}$`).test(String(valor).trim()) ? null : MENSAJE_DOCUMENTO;
}
