// Cliente de Siesa UNO EE: registro 201 (version 14), portado de sc_clientes.py. En Siesa el registro 201 es
// "cliente + sucursal": cada sucursal del cliente del POS se envia como un 201 con su codigo (001, 002...).
// Se envia por el mismo servicio web que las ventas (ver siesaVentas.js). El tercero (registro 200) debe existir antes.
import { prisma } from './prisma.js';
import { diaColombia } from './fechaColombia.js';
import {
  SIESA_FIJOS, codigoSucursalSiesa, consecutivo, intentarEnvioSiesa, limpiarTexto, nitSiesa, numero, registrar, texto,
} from './siesaVentas.js';

// Valores fijos del POS para clientes.
export const SIESA_CLIENTE = Object.freeze({
  centroOperacion: '420',
  listaPrecio: '021',
  vendedor: '0001',
  calificacion: 'A',
  condicionCredito: (dias) => `${String(dias).padStart(2, '0')}D`,
});

function ubicacion(codigoMunicipio) {
  const codigo = String(codigoMunicipio ?? '');
  if (/^\d{8}$/.test(codigo)) return { pais: codigo.slice(0, 3), departamento: codigo.slice(3, 5), ciudad: codigo.slice(5, 8) };
  return { pais: SIESA_FIJOS.pais, departamento: SIESA_FIJOS.departamento, ciudad: SIESA_FIJOS.ciudad };
}

function condicionPago(cliente) {
  if (String(cliente.condicionPago).toUpperCase() !== 'CREDITO') return SIESA_FIJOS.condicionPago;
  const dias = Number(cliente.creditoDias);
  return Number.isInteger(dias) && dias > 0 && dias < 100 ? SIESA_CLIENTE.condicionCredito(dias) : SIESA_FIJOS.condicionPago;
}

// Sedes a enviar: cada sucursal activa con su codigo (por posicion entre todas las del cliente) o, si no hay,
// los datos del propio cliente como sucursal 001.
function sedesDeCliente(cliente) {
  const todas = cliente.sucursales || [];
  const activas = todas.filter((sucursal) => sucursal.activo !== false);
  const razon = cliente.razonSocial || cliente.nombre;
  if (!activas.length) {
    return [{
      codigo: SIESA_FIJOS.sucursal, razon, direccion: cliente.direccion, barrio: cliente.barrio,
      telefono: cliente.telefono, email: cliente.email, municipio: cliente.municipioSiesaCodigo,
    }];
  }
  return [...activas].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((sucursal) => ({
    codigo: codigoSucursalSiesa(todas, { id: sucursal.id }),
    razon: sucursal.nombre || razon,
    direccion: sucursal.direccion || cliente.direccion,
    barrio: sucursal.barrio || cliente.barrio,
    telefono: sucursal.telefono || cliente.telefono,
    email: sucursal.email || cliente.email,
    municipio: sucursal.municipioSiesaCodigo || cliente.municipioSiesaCodigo,
  }));
}

function registro201(cliente, sede, nit, cia, orden) {
  const u = ubicacion(sede.municipio);
  const esCredito = String(cliente.condicionPago).toUpperCase() === 'CREDITO';
  const contacto = cliente.razonSocial || cliente.nombre;
  const F = SIESA_FIJOS;
  const C = SIESA_CLIENTE;
  return [
    consecutivo(orden), '0201', '00', '14', cia, '1', texto(nit, 15), texto(sede.codigo, 3), '1',
    texto(sede.razon, 40), texto(F.moneda, 3), texto(C.vendedor, 4), texto(C.calificacion, 1), texto(condicionPago(cliente), 3),
    '001', numero(esCredito ? cliente.creditoCupo || 0 : 0, 21, 4), texto('', 15), texto('', 3), texto(F.tipoCliente, 4),
    texto('', 4), texto(C.listaPrecio, 3), '5', numero(50, 7, 2), numero(10, 7, 2), numero(99, 7, 2),
    '0', '0', '0', '0', texto(C.centroOperacion, 3), texto('', 255), texto(contacto, 50),
    texto(sede.direccion || F.direccionDefecto, 40), texto('', 40), texto('', 40), texto(u.pais, 3),
    texto(u.departamento, 2), texto(u.ciudad, 3), texto(sede.barrio, 40), texto(sede.telefono, 20), texto('', 20),
    texto('', 10), texto(sede.email, 255), diaColombia(new Date(cliente.createdAt)).replaceAll('-', ''),
    texto('', 3), texto('', 20), texto('', 4), texto('', 35), '20301231', numero(0, 7, 2), '31', texto('', 3),
    texto(C.vendedor, 4), '0', '0', texto(sede.telefono, 50), '0', texto('', 10), numero(0, 7), numero(0, 3), '2',
  ].join('');
}

export function construirPlanoCliente(cliente, idCia) {
  const nit = nitSiesa(cliente.numeroDocumento || cliente.documento);
  if (!nit) throw new Error('El cliente no tiene NIT o documento para enviar a Siesa');
  const cia = numero(Number(idCia), 3);
  const sedes = sedesDeCliente(cliente);
  return [
    `${consecutivo(1)}00000001${cia}`,
    ...sedes.map((sede, indice) => registro201(cliente, sede, nit, cia, indice + 2)),
    `${consecutivo(sedes.length + 2)}99990001${cia}`,
  ];
}

export async function prepararCliente(id, cfg) {
  const cliente = await prisma.cliente.findUnique({ where: { id }, include: { sucursales: true } });
  if (!cliente) return { noEncontrado: true };
  return { lineas: construirPlanoCliente(cliente, cfg.idCia), tercero: construirTerceroApi(cliente) };
}

const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

// Digito de verificacion del NIT (algoritmo modulo 11 de la DIAN).
export function digitoVerificacion(nit) {
  const digitos = String(nit).replace(/\D/g, '').split('').reverse();
  const suma = digitos.reduce((total, digito, indice) => total + Number(digito) * PESOS_DV[indice], 0);
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}

const TIPO_IDENTIFICACION = { NIT: 'N', CC: 'C', CE: 'E', PAS: 'P', PP: 'P', TI: 'T' };

const recortar = (valor, largo) => limpiarTexto(valor).toUpperCase().slice(0, largo);

// Cuerpo de un tercero para POST /crear/terceros de la API de consulta (que lo sube a Siesa).
export function construirTerceroApi(cliente) {
  const nit = nitSiesa(cliente.numeroDocumento || cliente.documento);
  if (!nit) throw new Error('El cliente no tiene NIT o documento para crear el tercero en Siesa');
  const esJuridica = String(cliente.tipoCliente).toUpperCase() === 'JURIDICA' || String(cliente.tipoDocumento).toUpperCase() === 'NIT';
  const sede = sedesDeCliente(cliente)[0];
  const u = ubicacion(sede.municipio);
  const apellidos = limpiarTexto(cliente.apellidos).split(/\s+/).filter(Boolean);
  // Si el formulario trae los apellidos por separado se respetan (apellidos compuestos como "DE LA HOZ").
  const primerApellido = cliente.primerApellido != null ? limpiarTexto(cliente.primerApellido) : apellidos[0];
  const segundoApellido = cliente.segundoApellido != null ? limpiarTexto(cliente.segundoApellido) : apellidos.slice(1).join(' ');
  const nombres = limpiarTexto(cliente.nombres);
  const razon = esJuridica
    ? limpiarTexto(cliente.razonSocial || cliente.nombre)
    : limpiarTexto([primerApellido, segundoApellido, cliente.nombres].filter(Boolean).join(' ') || cliente.nombre);
  return {
    nit,
    digito_verificacion: esJuridica ? digitoVerificacion(nit) : '',
    tipo_identificacion: esJuridica ? 'N' : (TIPO_IDENTIFICACION[String(cliente.tipoDocumento).toUpperCase()] || 'C'),
    sucursal: SIESA_FIJOS.sucursal,
    razon_social: recortar(razon, 50),
    ...(esJuridica ? {} : {
      primer_apellido: recortar(primerApellido, 15),
      segundo_apellido: recortar(segundoApellido, 15),
      nombres: recortar(nombres, 20),
    }),
    direccion: recortar(sede.direccion || SIESA_FIJOS.direccionDefecto, 40),
    departamento: u.departamento,
    ciudad: u.ciudad,
    telefono: limpiarTexto(sede.telefono).slice(0, 20),
    correo_electronico: limpiarTexto(sede.email).slice(0, 50),
  };
}

export function intentarEnvioClienteSiesa(id, opciones) {
  return intentarEnvioSiesa(`CLIENTE:${id}`, (cfg) => prepararCliente(id, cfg), opciones);
}

// Si el cliente ya se habia enviado a Siesa y se edita, se vuelve a enviar (el 201 con indicador 1 actualiza).
export async function marcarClienteParaReenvio(id) {
  const clave = `CLIENTE:${id}`;
  const previo = await prisma.logIntegracion.findFirst({ where: { sistema: 'SIESA', tipo: clave } });
  if (previo) await registrar(clave, 'REINICIADO', { mensaje: 'Datos del cliente editados; se reenvia a Siesa' });
}

// Sucursales del cliente que ya estaban cargadas en Siesa en el ultimo envio aceptado: no se pueden borrar,
// porque los codigos por posicion de las demas se correrian.
export async function sucursalesYaEnviadas(tx, clienteId, sucursales) {
  const ultimo = await tx.logIntegracion.findFirst({
    where: { sistema: 'SIESA', tipo: `CLIENTE:${clienteId}`, estado: 'OK' },
    orderBy: { fecha: 'desc' },
  });
  if (!ultimo) return [];
  return sucursales.filter((sucursal) => new Date(sucursal.createdAt) <= new Date(ultimo.fecha));
}
