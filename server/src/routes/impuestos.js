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
const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const CAMPOS_CUENTA = ['ctaCreditoVentas', 'cuentasBase', 'cuentasBaseDevoluciones', 'ctaDebitoVentas', 'ctaDebitoCompras', 'ctaCreditoCompras'];

function datosCuentas(body, { parcial = false } = {}) {
  const data = {};
  for (const campo of CAMPOS_CUENTA) {
    if (parcial && body[campo] === undefined) continue;
    data[campo] = limpiar(body[campo]);
  }
  return data;
}

async function validarAlcance({ impuestoId, companiaCodigo, centroOperacionCodigo }) {
  if (!impuestoId || !companiaCodigo || !centroOperacionCodigo) {
    return 'Selecciona impuesto, compañía y centro de operaciones';
  }
  if (!['004', '006'].includes(companiaCodigo)) return 'Solo se permiten las compañías 004 y 006';
  const [impuesto, centro] = await Promise.all([
    prisma.impuesto.findUnique({ where: { id: impuestoId }, select: { id: true } }),
    prisma.centroOperacion.findFirst({
      where: { codigo: centroOperacionCodigo, companiaCodigo, estado: 'Activo' },
      select: { codigo: true },
    }),
  ]);
  if (!impuesto) return 'El impuesto seleccionado no existe';
  if (!centro) return 'El centro debe estar activo y pertenecer a la compañía seleccionada';
  return null;
}

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.impuesto.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/cuentas-centro', wrap(async (req, res) => {
  const { companiaCodigo, centroOperacionCodigo } = req.query;
  res.json(await prisma.impuestoCuentaCentro.findMany({
    where: {
      ...(companiaCodigo && { companiaCodigo: String(companiaCodigo) }),
      ...(centroOperacionCodigo && { centroOperacionCodigo: String(centroOperacionCodigo) }),
    },
    include: {
      impuesto: { select: { id: true, nombre: true, tipo: true, porcentaje: true } },
      compania: { select: { codigo: true, razonSocial: true } },
      centroOperacion: { select: { codigo: true, descripcion: true } },
    },
    orderBy: [{ companiaCodigo: 'asc' }, { centroOperacionCodigo: 'asc' }, { impuesto: { nombre: 'asc' } }],
  }));
}));

router.get('/alcances', wrap(async (_req, res) => {
  const companias = await prisma.compania.findMany({
    where: { codigo: { in: ['004', '006'] } },
    include: {
      centrosOperacion: {
        where: { estado: 'Activo' },
        orderBy: { codigo: 'asc' },
        select: { codigo: true, descripcion: true, companiaCodigo: true },
      },
    },
    orderBy: { codigo: 'asc' },
  });
  res.json(companias);
}));

router.post('/cuentas-centro', wrap(async (req, res) => {
  const impuestoId = limpiar(req.body?.impuestoId);
  const companiaCodigo = limpiar(req.body?.companiaCodigo);
  const centroOperacionCodigo = limpiar(req.body?.centroOperacionCodigo);
  const errorAlcance = await validarAlcance({ impuestoId, companiaCodigo, centroOperacionCodigo });
  if (errorAlcance) return res.status(400).json({ error: errorAlcance });
  try {
    const configuracion = await prisma.impuestoCuentaCentro.create({
      data: { impuestoId, companiaCodigo, centroOperacionCodigo, ...datosCuentas(req.body) },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'impuesto_cuenta_centro', entidadId: configuracion.id, detalle: `${impuestoId} ${companiaCodigo}/${centroOperacionCodigo}` });
    res.status(201).json(configuracion);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe una configuración para este impuesto y centro' });
    throw error;
  }
}));

router.put('/cuentas-centro/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    const actual = await prisma.impuestoCuentaCentro.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ error: 'Configuración por centro no encontrada' });
    const impuestoId = req.body?.impuestoId === undefined ? actual.impuestoId : limpiar(req.body.impuestoId);
    const companiaCodigo = req.body?.companiaCodigo === undefined ? actual.companiaCodigo : limpiar(req.body.companiaCodigo);
    const centroOperacionCodigo = req.body?.centroOperacionCodigo === undefined ? actual.centroOperacionCodigo : limpiar(req.body.centroOperacionCodigo);
    const errorAlcance = await validarAlcance({ impuestoId, companiaCodigo, centroOperacionCodigo });
    if (errorAlcance) return res.status(400).json({ error: errorAlcance });
    const configuracion = await prisma.impuestoCuentaCentro.update({
      where: { id },
      data: {
        impuestoId,
        companiaCodigo,
        centroOperacionCodigo,
        ...datosCuentas(req.body, { parcial: true }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'impuesto_cuenta_centro', entidadId: id, detalle: `${impuestoId} ${companiaCodigo}/${centroOperacionCodigo}` });
    res.json(configuracion);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe una configuración para este impuesto y centro' });
    if (error.code === 'P2025') return res.status(404).json({ error: 'Configuración por centro no encontrada' });
    throw error;
  }
}));

router.delete('/cuentas-centro/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.impuestoCuentaCentro.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'impuesto_cuenta_centro', entidadId: id });
    res.status(204).end();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Configuración por centro no encontrada' });
    throw error;
  }
}));

router.get('/:id', wrap(async (req, res) => {
  const i = await prisma.impuesto.findUnique({ where: { id: String(req.params.id) } });
  if (!i) return res.status(404).json({ error: 'Impuesto no encontrado' });
  res.json(i);
}));

router.post('/', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const i = await prisma.impuesto.create({
    data: {
      nombre: nombreLimpio,
      tipo: limpiar(tipo),
      porcentaje: toNum(porcentaje) ?? 0,
      codigoDIAN: limpiar(codigoDIAN),
      ctaCreditoVentas: limpiar(ctaCreditoVentas),
      cuentasBase: limpiar(cuentasBase),
      cuentasBaseDevoluciones: limpiar(cuentasBaseDevoluciones),
      ctaDebitoVentas: limpiar(ctaDebitoVentas),
      ctaDebitoCompras: limpiar(ctaDebitoCompras),
      ctaCreditoCompras: limpiar(ctaCreditoCompras),
      exportado: aBool(exportado),
      valorImpuesto: toNum(valorImpuesto) ?? 0,
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'impuesto', entidadId: i.id, detalle: `${i.nombre} ${i.porcentaje}%` });
  res.status(201).json(i);
}));

router.put('/:id', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  try {
    const i = await prisma.impuesto.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(porcentaje !== undefined && { porcentaje: toNum(porcentaje) ?? 0 }),
        ...(codigoDIAN !== undefined && { codigoDIAN: limpiar(codigoDIAN) }),
        ...(ctaCreditoVentas !== undefined && { ctaCreditoVentas: limpiar(ctaCreditoVentas) }),
        ...(cuentasBase !== undefined && { cuentasBase: limpiar(cuentasBase) }),
        ...(cuentasBaseDevoluciones !== undefined && { cuentasBaseDevoluciones: limpiar(cuentasBaseDevoluciones) }),
        ...(ctaDebitoVentas !== undefined && { ctaDebitoVentas: limpiar(ctaDebitoVentas) }),
        ...(ctaDebitoCompras !== undefined && { ctaDebitoCompras: limpiar(ctaDebitoCompras) }),
        ...(ctaCreditoCompras !== undefined && { ctaCreditoCompras: limpiar(ctaCreditoCompras) }),
        ...(exportado !== undefined && { exportado: aBool(exportado) }),
        ...(valorImpuesto !== undefined && { valorImpuesto: toNum(valorImpuesto) ?? 0 }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'impuesto', entidadId: i.id, detalle: i.nombre });
    res.json(i);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Impuesto no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.impuesto.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'impuesto', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Impuesto no encontrado' });
    throw e;
  }
}));

export default router;
