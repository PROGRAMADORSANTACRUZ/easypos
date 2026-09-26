import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

const aEntero = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

const aDecimal = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// Arma los campos de credito segun la condicion de pago; a contado no aplican
const camposCredito = (condicionPago, creditoDias, creditoCupo) => {
  const cond = String(condicionPago || 'CONTADO').toUpperCase() === 'CREDITO' ? 'CREDITO' : 'CONTADO';
  return {
    condicionPago: cond,
    creditoDias: cond === 'CREDITO' ? aEntero(creditoDias) : null,
    creditoCupo: cond === 'CREDITO' ? aDecimal(creditoCupo) : null,
  };
};

// Combina nombres y apellidos en el nombre completo (usado en recibos y facturas)
const nombreCompleto = (nombres, apellidos, nombre, razonSocial) => {
  const combinado = [limpiar(nombres), limpiar(apellidos)].filter(Boolean).join(' ');
  return combinado || (nombre ? String(nombre).trim() : '') || limpiar(razonSocial) || '';
};

router.get('/', wrap(async (req, res) => {
  const { q } = req.query;
  const where = q
    ? {
        OR: [
          { nombre: { contains: String(q) } },
          { razonSocial: { contains: String(q) } },
          { documento: { contains: String(q) } },
          { numeroDocumento: { contains: String(q) } },
          { barrio: { contains: String(q) } },
          { email: { contains: String(q) } },
        ],
      }
    : undefined;
  const clientes = await prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' } });
  res.json(clientes);
}));

router.get('/:id', wrap(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: String(req.params.id) } });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(cliente);
}));

router.post('/', wrap(async (req, res) => {
  const { nombres, apellidos, nombre, razonSocial } = req.body;
  const nombreFull = nombreCompleto(nombres, apellidos, nombre, razonSocial);
  if (!nombreFull) {
    return res.status(400).json({ error: 'El nombre o razón social es obligatorio' });
  }
  try {
    const cliente = await prisma.cliente.create({
      data: {
        nombre: nombreFull,
        nombres: limpiar(nombres),
        apellidos: limpiar(apellidos),
        razonSocial: limpiar(razonSocial),
        tipoCliente: limpiar(req.body.tipoCliente) || 'NATURAL',
        tipoDocumento: limpiar(req.body.tipoDocumento),
        numeroDocumento: limpiar(req.body.numeroDocumento),
        documento: limpiar(req.body.documento) ?? limpiar(req.body.numeroDocumento),
        telefono: limpiar(req.body.telefono),
        direccion: limpiar(req.body.direccion),
        barrio: limpiar(req.body.barrio),
        ciudad: limpiar(req.body.ciudad),
        email: limpiar(req.body.email),
        municipioCodigo: limpiar(req.body.municipioCodigo),
        responsableIVA: aBool(req.body.responsableIVA),
        porcentajeEmpleado: aDecimal(req.body.porcentajeEmpleado),
        porcentajeCliente: aDecimal(req.body.porcentajeCliente),
        ...camposCredito(req.body.condicionPago, req.body.creditoDias, req.body.creditoCupo),
      },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'cliente', entidadId: cliente.id, detalle: cliente.nombre });
    res.status(201).json(cliente);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese NIT o cédula' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombres, apellidos, nombre, razonSocial, documento, tipoCliente, tipoDocumento, numeroDocumento, telefono, direccion, barrio, ciudad, email, municipioCodigo, responsableIVA, porcentajeEmpleado, porcentajeCliente, activo } = req.body;
  const tieneNombre = nombres !== undefined || apellidos !== undefined || nombre !== undefined || razonSocial !== undefined;
  const nombreFull = tieneNombre ? nombreCompleto(nombres, apellidos, nombre, razonSocial) : undefined;
  try {
    const cliente = await prisma.cliente.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombreFull !== undefined && nombreFull !== '' && { nombre: nombreFull }),
        ...(nombres !== undefined && { nombres: limpiar(nombres) }),
        ...(apellidos !== undefined && { apellidos: limpiar(apellidos) }),
        ...(razonSocial !== undefined && { razonSocial: limpiar(razonSocial) }),
        ...(tipoCliente !== undefined && { tipoCliente: limpiar(tipoCliente) || 'NATURAL' }),
        ...(tipoDocumento !== undefined && { tipoDocumento: limpiar(tipoDocumento) }),
        ...(numeroDocumento !== undefined && { numeroDocumento: limpiar(numeroDocumento) }),
        ...(documento !== undefined && { documento: limpiar(documento) }),
        ...(telefono !== undefined && { telefono: limpiar(telefono) }),
        ...(direccion !== undefined && { direccion: limpiar(direccion) }),
        ...(barrio !== undefined && { barrio: limpiar(barrio) }),
        ...(ciudad !== undefined && { ciudad: limpiar(ciudad) }),
        ...(email !== undefined && { email: limpiar(email) }),
        ...(municipioCodigo !== undefined && { municipioCodigo: limpiar(municipioCodigo) }),
        ...(responsableIVA !== undefined && { responsableIVA: aBool(responsableIVA) }),
        ...(porcentajeEmpleado !== undefined && { porcentajeEmpleado: aDecimal(porcentajeEmpleado) }),
        ...(porcentajeCliente !== undefined && { porcentajeCliente: aDecimal(porcentajeCliente) }),
        ...(req.body.condicionPago !== undefined && camposCredito(req.body.condicionPago, req.body.creditoDias, req.body.creditoCupo)),
        ...(activo !== undefined && { activo: Boolean(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'cliente', entidadId: cliente.id, detalle: cliente.nombre });
    res.json(cliente);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese NIT o cédula' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  await prisma.cliente.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'cliente', entidadId: id });
  res.status(204).end();
}));

export default router;
