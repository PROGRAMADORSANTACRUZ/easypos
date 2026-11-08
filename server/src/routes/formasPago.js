import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const permisosLectura = ['empresa.ver', 'facturas.ver', 'facturas.crear', 'factura_venta.ver', 'factura_venta.crear'];

router.use((req, res, next) => {
  const permisos = req.usuario?.permisos || [];
  if (['GET', 'HEAD'].includes(req.method) && permisosLectura.some((permiso) => permisos.includes(permiso))) return next();
  if (!['GET', 'HEAD'].includes(req.method) && permisos.includes('empresa.editar')) return next();
  return res.status(403).json({ error: 'No tienes permiso para consultar o editar formas de pago' });
});

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const aInt = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10));

export function codigoConcepto(valor) {
  const codigo = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{1,10}$/.test(codigo)) {
    throw Object.assign(new Error('Cpto. caja debe tener de 1 a 10 letras, números, guiones o guiones bajos'), { status: 400 });
  }
  return codigo;
}

export function datosDesdeBody(body, { parcial = false } = {}) {
  const textoRequerido = (campo, maximo) => {
    const valor = typeof body[campo] === 'string' ? body[campo].trim() : '';
    if (!valor || valor.length > maximo) throw Object.assign(new Error(`El campo ${campo} es obligatorio (máximo ${maximo} caracteres)`), { status: 400 });
    return valor;
  };
  const campos = {
    claseConcepto: () => {
      const clase = textoRequerido('claseConcepto', 10).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (!['ADICION', 'RECOGIDA'].includes(clase)) throw Object.assign(new Error('Clase cpto. inválida'), { status: 400 });
      return clase;
    },
    formaPago: () => textoRequerido('formaPago', 120),
    medioPago: () => codigoConcepto(body.medioPago),
    moneda: () => {
      const moneda = textoRequerido('moneda', 3).toUpperCase();
      if (!/^[A-Z]{3}$/.test(moneda)) throw Object.assign(new Error('Moneda debe tener tres letras, por ejemplo COP'), { status: 400 });
      return moneda;
    },
    manejaDocumento: () => aBool(body.manejaDocumento),
    cuenta: () => limpiar(body.cuenta),
    exportado: () => aBool(body.exportado),
    consignarEn: () => limpiar(body.consignarEn),
    tipoDatafono: () => limpiar(body.tipoDatafono),
    idBodega: () => aInt(body.idBodega) ?? 0,
    formaPagoDian: () => limpiar(body.formaPagoDian),
    activo: () => body.activo === undefined ? true : aBool(body.activo),
  };
  const data = {};
  for (const [k, fn] of Object.entries(campos)) {
    if (parcial && body[k] === undefined) continue;
    data[k] = fn();
  }
  return data;
}

router.get('/', wrap(async (_req, res) => {
  res.json(await prisma.formaPago.findMany({ orderBy: [{ claseConcepto: 'asc' }, { id: 'asc' }] }));
}));

router.get('/:id', wrap(async (req, res) => {
  const t = await prisma.formaPago.findUnique({ where: { id: codigoConcepto(req.params.id) } });
  if (!t) return res.status(404).json({ error: 'Forma de pago no encontrada' });
  res.json(t);
}));

router.post('/', wrap(async (req, res) => {
  try {
    const id = codigoConcepto(req.body.cptoCaja ?? req.body.id);
    const data = datosDesdeBody(req.body);
    const t = await prisma.formaPago.create({ data: { ...data, id } });
    await auditar({ req, accion: 'CREAR', entidad: 'formaPago', entidadId: t.id, detalle: t.formaPago });
    res.status(201).json(t);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe ese Cpto. caja' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  try {
    const id = codigoConcepto(req.params.id);
    for (const campo of ['id', 'cptoCaja']) {
      if (req.body[campo] !== undefined && codigoConcepto(req.body[campo]) !== id) {
        return res.status(409).json({ error: 'Cpto. caja es la clave primaria y no se puede cambiar' });
      }
    }
    const t = await prisma.formaPago.update({
      where: { id },
      data: datosDesdeBody(req.body, { parcial: true }),
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'formaPago', entidadId: t.id, detalle: t.formaPago });
    res.json(t);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Forma de pago no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.formaPago.delete({ where: { id: codigoConcepto(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'formaPago', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Forma de pago no encontrada' });
    throw e;
  }
}));

export default router;
