// El numero de documento de un cliente es solo numerico (NIT o cedula sin puntos, guiones ni digito de
// verificacion): Siesa lo usa como codigo del tercero.
export const MAX_DOCUMENTO = 15;

export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, MAX_DOCUMENTO);
