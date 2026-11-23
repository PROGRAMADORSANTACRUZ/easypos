// Cliente de Siesa UNO EE: registro 201 (version 14), portado de sc_clientes.py. Se envia por el mismo servicio
// web que las ventas (ver siesaVentas.js). El tercero (registro 200) debe existir antes en Siesa.
import { prisma } from './prisma.js';
import { diaColombia } from './fechaColombia.js';
import {
  SIESA_FIJOS, consecutivo, intentarEnvioSiesa, nitSiesa, numero, texto,
} from './siesaVentas.js';

// Valores fijos del POS para clientes.
export const SIESA_CLIENTE = Object.freeze({
  centroOperacion: '420',
  listaPrecio: '021',
  vendedor: '0001',
  calificacion: 'A',
  condicionCredito: (dias) => `${String(dias).padStart(2, '0')}D`,
});

function ubicacion(cliente) {
  const codigo = String(cliente.municipioSiesaCodigo ?? '');
  if (/^\d{8}$/.test(codigo)) return { pais: codigo.slice(0, 3), departamento: codigo.slice(3, 5), ciudad: codigo.slice(5, 8) };
  return { pais: SIESA_FIJOS.pais, departamento: SIESA_FIJOS.departamento, ciudad: SIESA_FIJOS.ciudad };
}

function condicionPago(cliente) {
  if (String(cliente.condicionPago).toUpperCase() !== 'CREDITO') return SIESA_FIJOS.condicionPago;
  const dias = Number(cliente.creditoDias);
  return Number.isInteger(dias) && dias > 0 && dias < 100 ? SIESA_CLIENTE.condicionCredito(dias) : SIESA_FIJOS.condicionPago;
}

function registro201(cliente, cia, orden) {
  const nit = nitSiesa(cliente.numeroDocumento || cliente.documento);
  if (!nit) throw new Error('El cliente no tiene NIT o documento para enviar a Siesa');
  const razon = cliente.razonSocial || cliente.nombre;
  const u = ubicacion(cliente);
  const esCredito = String(cliente.condicionPago).toUpperCase() === 'CREDITO';
  const F = SIESA_FIJOS;
  const C = SIESA_CLIENTE;
  return [
    consecutivo(orden), '0201', '00', '14', cia, '1', texto(nit, 15), texto(F.sucursal, 3), '1',
    texto(razon, 40), texto(F.moneda, 3), texto(C.vendedor, 4), texto(C.calificacion, 1), texto(condicionPago(cliente), 3),
    '001', numero(esCredito ? cliente.creditoCupo || 0 : 0, 21, 4), texto('', 15), texto('', 3), texto(F.tipoCliente, 4),
    texto('', 4), texto(C.listaPrecio, 3), '5', numero(50, 7, 2), numero(10, 7, 2), numero(99, 7, 2),
    '0', '0', '0', '0', texto(C.centroOperacion, 3), texto('', 255), texto(razon, 50),
    texto(cliente.direccion || F.direccionDefecto, 40), texto('', 40), texto('', 40), texto(u.pais, 3),
    texto(u.departamento, 2), texto(u.ciudad, 3), texto(cliente.barrio, 40), texto(cliente.telefono, 20), texto('', 20),
    texto('', 10), texto(cliente.email, 255), diaColombia(new Date(cliente.createdAt)).replaceAll('-', ''),
    texto('', 3), texto('', 20), texto('', 4), texto('', 35), '20301231', numero(0, 7, 2), '31', texto('', 3),
    texto(C.vendedor, 4), '0', '0', texto(cliente.telefono, 50), '0', texto('', 10), numero(0, 7), numero(0, 3), '2',
  ].join('');
}

export function construirPlanoCliente(cliente, idCia) {
  const cia = numero(Number(idCia), 3);
  return [`${consecutivo(1)}00000001${cia}`, registro201(cliente, cia, 2), `${consecutivo(3)}99990001${cia}`];
}

export function intentarEnvioClienteSiesa(id, opciones) {
  return intentarEnvioSiesa(`CLIENTE:${id}`, (cfg) => prepararCliente(id, cfg), opciones);
}

export async function prepararCliente(id, cfg) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) return { noEncontrado: true };
  return { lineas: construirPlanoCliente(cliente, cfg.idCia) };
}
