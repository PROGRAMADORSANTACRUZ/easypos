// El numero de documento de un cliente es solo numerico (NIT o cedula sin puntos, guiones ni digito de
// verificacion): Siesa lo usa como codigo del tercero.
export const MAX_DOCUMENTO = 15;

export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, MAX_DOCUMENTO);

// Documentos del consumidor final: no se crean como tercero en Siesa.
export const DOCUMENTOS_GENERICOS = new Set(['222222222', '222222222222']);

const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

// Digito de verificacion del NIT (modulo 11 de la DIAN), el mismo que calcula el servidor para Siesa.
export function digitoVerificacion(nit) {
  const digitos = soloDigitos(nit).split('').reverse();
  const suma = digitos.reduce((total, digito, indice) => total + Number(digito) * PESOS_DV[indice], 0);
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}
