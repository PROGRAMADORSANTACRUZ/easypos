import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const serializar = ({ codigo, ...centro }) => ({ id: codigo, codigo, ...centro });

router.get('/', wrap(async (_req, res) => {
  const centros = await prisma.centroOperacion.findMany({
    include: { compania: true },
    orderBy: { codigo: 'asc' },
  });
  res.json(centros.map(serializar));
}));

// Codigo del C.O de Siesa: 1 a 3 digitos, guardado con ceros a la izquierda (ej. 7 -> 007)
const normalizarCodigo = (valor) => {
  const codigo = String(valor ?? '').trim();
  return /^\d{1,3}$/.test(codigo) ? codigo.padStart(3, '0') : null;
};

function datosCentro(body = {}) {
  const descripcion = String(body.descripcion ?? '').trim();
  const estado = String(body.estado ?? '').trim();
  const regional = String(body.regional ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const companiaCodigo = String(body.companiaCodigo ?? '').trim();
  if (!descripcion) return { error: 'La descripción es obligatoria' };
  if (!regional || !nombre || !companiaCodigo) return { error: 'Regional, nombre y compañía son obligatorios' };
  if (!['Activo', 'Inactivo'].includes(estado)) return { error: 'El estado debe ser Activo o Inactivo' };
  return { datos: { descripcion, estado, regional, nombre, companiaCodigo } };
}

router.post('/', wrap(async (req, res) => {
  const codigo = normalizarCodigo(req.body.codigo);
  if (!codigo) return res.status(400).json({ error: 'El código debe tener entre 1 y 3 dígitos' });
  const { datos, error } = datosCentro(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const centro = await prisma.centroOperacion.create({ data: { codigo, ...datos }, include: { compania: true } });
    await auditar({ req, accion: 'CREAR', entidad: 'centro_operacion', entidadId: codigo, detalle: datos.descripcion });
    res.status(201).json(serializar(centro));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: `Ya existe el centro de operaciones ${codigo}` });
    if (e.code === 'P2003') return res.status(400).json({ error: 'La compañía seleccionada no existe' });
    throw e;
  }
}));

router.put('/:codigo', wrap(async (req, res) => {
  const codigo = String(req.params.codigo ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'El código es obligatorio' });
  const { datos, error: invalido } = datosCentro(req.body);
  if (invalido) return res.status(400).json({ error: invalido });
  const { descripcion, estado, regional, nombre, companiaCodigo } = datos;
  try {
    const centro = await prisma.centroOperacion.update({
      where: { codigo },
      data: { descripcion, estado, regional, nombre, companiaCodigo },
      include: { compania: true },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'centro_operacion', entidadId: codigo, detalle: descripcion });
    res.json(serializar(centro));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Centro de operaciones no encontrado' });
    if (error.code === 'P2003') return res.status(400).json({ error: 'La compañía seleccionada no existe' });
    throw error;
  }
}));

export default router;