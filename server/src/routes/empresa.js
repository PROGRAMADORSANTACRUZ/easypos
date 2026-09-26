import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const FORMATOS_VALIDOS = ['TICKET_80', 'TICKET_58', 'A5'];
const aFormato = (v) => (FORMATOS_VALIDOS.includes(v) ? v : 'TICKET_80');

// No expone el certificado binario ni las contrasenas; solo indica si estan cargados.
const aVista = (e) => {
  if (!e) return null;
  const { certificadoDigital, passwordCertificado, softwarePin, ...resto } = e;
  return {
    ...resto,
    tieneCertificado: certificadoDigital != null,
    tienePasswordCertificado: passwordCertificado != null,
    tieneSoftwarePin: softwarePin != null,
  };
};

// La empresa es un registro unico (configuracion del emisor).
async function obtenerEmpresa() {
  return prisma.empresa.findFirst({ orderBy: { createdAt: 'asc' } });
}

router.get('/', wrap(async (req, res) => {
  const empresa = await obtenerEmpresa();
  res.json(aVista(empresa));
}));

// Crea o actualiza la configuracion de la empresa (upsert del registro unico).
router.put('/', wrap(async (req, res) => {
  const {
    nit, razonSocial, nombreComercial, direccion, telefono, correo,
    certificadoDigital, passwordCertificado, softwareId, softwarePin, ambienteDIAN,
    formatoFactura, formatoFacturaVenta, formatoComanda, formatoCortesia, formatoPrefactura,
  } = req.body;

  const data = {
    ...(nit !== undefined && { nit: limpiar(nit) }),
    ...(razonSocial !== undefined && { razonSocial: limpiar(razonSocial) }),
    ...(nombreComercial !== undefined && { nombreComercial: limpiar(nombreComercial) }),
    ...(direccion !== undefined && { direccion: limpiar(direccion) }),
    ...(telefono !== undefined && { telefono: limpiar(telefono) }),
    ...(correo !== undefined && { correo: limpiar(correo) }),
    ...(softwareId !== undefined && { softwareId: limpiar(softwareId) }),
    ...(ambienteDIAN !== undefined && { ambienteDIAN: limpiar(ambienteDIAN) }),
    ...(formatoFactura !== undefined && { formatoFactura: aFormato(formatoFactura) }),
    ...(formatoFacturaVenta !== undefined && { formatoFacturaVenta: aFormato(formatoFacturaVenta) }),
    ...(formatoComanda !== undefined && { formatoComanda: aFormato(formatoComanda) }),
    ...(formatoCortesia !== undefined && { formatoCortesia: aFormato(formatoCortesia) }),
    ...(formatoPrefactura !== undefined && { formatoPrefactura: aFormato(formatoPrefactura) }),
    // Campos sensibles: solo se tocan si vienen con valor; cadena vacia los limpia.
    ...(passwordCertificado !== undefined && { passwordCertificado: limpiar(passwordCertificado) }),
    ...(softwarePin !== undefined && { softwarePin: limpiar(softwarePin) }),
    ...(certificadoDigital !== undefined && {
      certificadoDigital: certificadoDigital ? Buffer.from(String(certificadoDigital), 'base64') : null,
    }),
  };

  const existente = await obtenerEmpresa();
  const empresa = existente
    ? await prisma.empresa.update({ where: { id: existente.id }, data })
    : await prisma.empresa.create({ data });

  await auditar({
    req,
    accion: existente ? 'EDITAR' : 'CREAR',
    entidad: 'empresa',
    entidadId: empresa.id,
    detalle: empresa.razonSocial || empresa.nombreComercial || empresa.nit || '',
  });
  res.json(aVista(empresa));
}));

export default router;
