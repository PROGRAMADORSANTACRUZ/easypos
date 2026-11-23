// Recibo de caja de Siesa UNO EE (anticipo/recaudo del cliente): registros 350 (encabezado) y 351 (debito a
// caja y credito al cliente), portado de rc.py. Se genera por cada abono registrado en el POS.
import { prisma } from './prisma.js';
import { diaColombia } from './fechaColombia.js';
import {
  SIESA_FIJOS, consecutivo, intentarEnvioSiesa, nitSiesa, numero, texto,
} from './siesaVentas.js';

// Valores fijos del POS para recibos de caja.
export const SIESA_RECIBO = Object.freeze({
  centroOperacion: '420',
  tipoDocumento: 'NI',
  claseDocumento: '30',
  cuentaCaja: '1110050401',
  cuentaAnticipo: '2805050501',
  flujoEfectivo: '1101',
});

const valor = (n) => `+${numero(n, 20, 4)}`;
const ceros = (cantidad) => Array.from({ length: cantidad }, () => valor(0)).join('');

function encabezado350(a, cia, orden) {
  const R = SIESA_RECIBO;
  return [
    consecutivo(orden), '0350', '00', '01', cia, '0', texto(R.centroOperacion, 3), texto(R.tipoDocumento, 3),
    numero(a.numero, 8), a.fecha, texto(a.tercero, 15), texto(R.claseDocumento, 5), '1', '0', texto(a.nota, 255),
  ].join('');
}

function debito351(a, cia, orden) {
  const R = SIESA_RECIBO;
  return [
    consecutivo(orden), '0351', '00', '04', cia, texto(R.centroOperacion, 3), texto(R.tipoDocumento, 3),
    numero(a.numero, 8), texto(R.cuentaCaja, 20), texto('', 15), texto(R.centroOperacion, 3),
    texto(SIESA_FIJOS.unidadNegocio, 20), texto('', 15), texto(R.flujoEfectivo, 10),
    valor(a.valor), valor(0), valor(0), valor(0), valor(0),
    valor(a.valor), ceros(4),
    valor(a.valor), ceros(4),
    ceros(3), 'CG', a.fecha, '0'.repeat(30), texto(a.nota, 255),
  ].join('');
}

function credito351(a, cia, orden) {
  const R = SIESA_RECIBO;
  return [
    consecutivo(orden), '0351', '01', '05', cia, texto(R.centroOperacion, 3), texto(R.tipoDocumento, 3),
    numero(a.numero, 8), texto(R.cuentaAnticipo, 20), texto(a.tercero, 15), texto(R.centroOperacion, 3),
    texto(SIESA_FIJOS.unidadNegocio, 20), texto('', 15),
    valor(0), valor(a.valor), valor(0), valor(0), valor(0), valor(a.valor), ceros(4),
    texto(a.nota, 255), texto(SIESA_FIJOS.sucursal, 3), texto(R.tipoDocumento, 3), numero(a.numero, 8), '001',
    a.fecha, a.fecha, ceros(7), texto(SIESA_FIJOS.vendedor, 15), a.fecha, a.fecha, texto('', 255),
  ].join('');
}

// abono: { id, monto, createdAt, nota }; tercero: NIT del cliente de la factura.
export function construirPlanoRecibo(abono, tercero, idCia) {
  const cia = numero(Number(idCia), 3);
  const datos = {
    numero: abono.id,
    valor: abono.monto,
    fecha: diaColombia(new Date(abono.createdAt)).replaceAll('-', ''),
    tercero: nitSiesa(tercero) || SIESA_FIJOS.clienteGenerico,
    nota: abono.nota || `Abono POS ${abono.id}`,
  };
  return [
    `${consecutivo(1)}00000001${cia}`,
    encabezado350(datos, cia, 2),
    debito351(datos, cia, 3),
    credito351(datos, cia, 4),
    `${consecutivo(5)}99990001${cia}`,
  ];
}

export async function prepararRecibo(id, cfg) {
  const abono = await prisma.abono.findUnique({
    where: { id: Number(id) },
    include: { factura: true, facturaVenta: true },
  });
  if (!abono) return { noEncontrado: true };
  const documento = abono.factura || abono.facturaVenta;
  return { lineas: construirPlanoRecibo(abono, documento?.numeroDocumentoCliente, cfg.idCia) };
}

export function intentarEnvioReciboSiesa(id, opciones) {
  return intentarEnvioSiesa(`RECIBO:${id}`, (cfg) => prepararRecibo(id, cfg), opciones);
}
