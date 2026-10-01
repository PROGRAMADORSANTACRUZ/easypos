import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const normalizarCodigo = (value) => {
  const codigo = String(value ?? '').trim();
  return /^\d{1,3}$/.test(codigo) ? codigo.padStart(3, '0') : null;
};
const serializar = ({ codigo, ...compania }) => ({ id: codigo, codigo, ...compania });

router.get('/', wrap(async (_req, res) => {
  const companias = await prisma.compania.findMany({ orderBy: { codigo: 'asc' } });
  res.json(companias.map(serializar));
}));

router.get('/:codigo', wrap(async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'El código debe tener entre 1 y 3 dígitos' });
  const compania = await prisma.compania.findUnique({ where: { codigo } });
  if (!compania) return res.status(404).json({ error: 'Compañía no encontrada' });
  res.json(serializar(compania));
}));

router.post('/', wrap(async (req, res) => {
  const codigo = normalizarCodigo(req.body.codigo);
  const nit = String(req.body.nit ?? '').trim();
  const razonSocial = String(req.body.razonSocial ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'El código debe tener entre 1 y 3 dígitos' });
  if (!nit || !razonSocial) return res.status(400).json({ error: 'NIT y razón social son obligatorios' });
  try {
    const compania = await prisma.compania.create({ data: { codigo, nit, razonSocial } });
    await auditar({ req, accion: 'CREAR', entidad: 'compania', entidadId: compania.codigo, detalle: compania.razonSocial });
    res.status(201).json(serializar(compania));
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'El código o NIT ya está registrado' });
    throw error;
  }
}));

router.put('/:codigo', wrap(async (req, res) => {
  const codigoActual = normalizarCodigo(req.params.codigo);
  const codigoNuevo = req.body.codigo === undefined ? codigoActual : normalizarCodigo(req.body.codigo);
  if (!codigoActual || !codigoNuevo) return res.status(400).json({ error: 'El código debe tener entre 1 y 3 dígitos' });
  const nit = req.body.nit === undefined ? undefined : String(req.body.nit ?? '').trim();
  const razonSocial = req.body.razonSocial === undefined ? undefined : String(req.body.razonSocial ?? '').trim();
  try {
    const compania = await prisma.compania.update({
      where: { codigo: codigoActual },
      data: {
        codigo: codigoNuevo,
        ...(nit !== undefined && { nit }),
        ...(razonSocial !== undefined && { razonSocial }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'compania', entidadId: compania.codigo, detalle: compania.razonSocial });
    res.json(serializar(compania));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Compañía no encontrada' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'El código o NIT ya está registrado' });
    throw error;
  }
}));

router.delete('/:codigo', wrap(async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'El código debe tener entre 1 y 3 dígitos' });
  try {
    await prisma.compania.delete({ where: { codigo } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'compania', entidadId: codigo });
    res.status(204).end();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Compañía no encontrada' });
    throw error;
  }
}));

export default router;
