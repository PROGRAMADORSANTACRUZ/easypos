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
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const aInt = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10));
const aFecha = (v) => {
  const s = limpiar(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Construye el objeto de datos a partir del body (para create/update).
function datosDesdeBody(body, { parcial } = { parcial: false }) {
  const campos = {
    clase: () => limpiar(body.clase),
    esElectronico: () => (body.esElectronico === undefined ? true : aBool(body.esElectronico)),
    codigo: () => limpiar(body.codigo),
    automatico: () => aBool(body.automatico),
    consInicial: () => aInt(body.consInicial),
    consFinal: () => aInt(body.consFinal),
    consProximo: () => aInt(body.consProximo),
    nroResolucion: () => limpiar(body.nroResolucion),
    fechaResolucion: () => aFecha(body.fechaResolucion),
    nroMaxItems: () => aInt(body.nroMaxItems),
    prefijo: () => limpiar(body.prefijo),
    consFormato: () => limpiar(body.consFormato),
    fechaResolucionVcto: () => aFecha(body.fechaResolucionVcto),
    diasAvisoVcto: () => aInt(body.diasAvisoVcto),
    tipoIdentificacion: () => limpiar(body.tipoIdentificacion),
    companiaCodigo: () => limpiar(body.companiaCodigo),
    centroOperacionCodigo: () => limpiar(body.centroOperacionCodigo),
    activo: () => aBool(body.activo),
  };
  const data = {};
  for (const [k, fn] of Object.entries(campos)) {
    if (parcial && body[k] === undefined) continue;
    data[k] = fn();
  }
  return data;
}

async function validarAsociacion({ companiaCodigo, centroOperacionCodigo }) {
  if (!companiaCodigo && !centroOperacionCodigo) return null;
  if (!companiaCodigo || !centroOperacionCodigo) return 'Selecciona una compañía y su centro de operaciones';
  const centro = await prisma.centroOperacion.findFirst({
    where: { codigo: centroOperacionCodigo, companiaCodigo },
    select: { codigo: true },
  });
  return centro ? null : 'El centro de operaciones no pertenece a la compañía seleccionada';
}

router.get('/', wrap(async (_req, res) => {
  res.json(await prisma.tipoDocumento.findMany({
    include: { _count: { select: { facturas: true, facturasVenta: true } } },
    orderBy: [{ clase: 'asc' }, { codigo: 'asc' }],
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const t = await prisma.tipoDocumento.findUnique({ where: { id: String(req.params.id) } });
  if (!t) return res.status(404).json({ error: 'Tipo de documento no encontrado' });
  res.json(t);
}));

router.post('/', wrap(async (req, res) => {
  const data = datosDesdeBody(req.body);
  if (!data.clase) return res.status(400).json({ error: 'La clase es obligatoria' });
  if (!data.codigo) return res.status(400).json({ error: 'El código (C.O) es obligatorio' });
  const errorAsociacion = await validarAsociacion(data);
  if (errorAsociacion) return res.status(400).json({ error: errorAsociacion });
  const t = await prisma.tipoDocumento.create({ data });
  await auditar({ req, accion: 'CREAR', entidad: 'tipoDocumento', entidadId: t.id, detalle: `${t.codigo} ${t.prefijo || ''}`.trim() });
  res.status(201).json(t);
}));

router.put('/:id', wrap(async (req, res) => {
  try {
    const actual = await prisma.tipoDocumento.findUnique({ where: { id: String(req.params.id) } });
    if (!actual) return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    const data = datosDesdeBody(req.body, { parcial: true });
    const errorAsociacion = await validarAsociacion({ ...actual, ...data });
    if (errorAsociacion) return res.status(400).json({ error: errorAsociacion });
    const cambiaAsociacion = (data.companiaCodigo !== undefined && data.companiaCodigo !== actual.companiaCodigo)
      || (data.centroOperacionCodigo !== undefined && data.centroOperacionCodigo !== actual.centroOperacionCodigo);
    if (cambiaAsociacion) {
      const [facturas, facturasVenta] = await Promise.all([
        prisma.factura.count({ where: { tipoDocumentoId: actual.id } }),
        prisma.facturaVenta.count({ where: { tipoDocumentoId: actual.id } }),
      ]);
      if (facturas + facturasVenta > 0) {
        return res.status(409).json({ error: 'No puedes cambiar compañía o centro: este tipo de documento ya tiene facturas asociadas' });
      }
    }
    const t = await prisma.tipoDocumento.update({
      where: { id: String(req.params.id) },
      data,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'tipoDocumento', entidadId: t.id, detalle: `${t.codigo} ${t.prefijo || ''}`.trim() });
    res.json(t);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.tipoDocumento.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'tipoDocumento', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    throw e;
  }
}));

export default router;
