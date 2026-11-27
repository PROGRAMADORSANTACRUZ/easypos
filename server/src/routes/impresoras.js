// Impresoras termicas de red del local (Impresora 1, 2, 3...), compartidas por todos los celulares.
// Cada impresora tiene las categorias que le tocan: la APK reparte la tirilla del pedido entre ellas.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const MAX_IMPRESORAS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 400 });

export function esIpPrivada(ip) {
  const partes = String(ip || '').split('.');
  if (partes.length !== 4 || partes.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = partes.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Normaliza y valida la lista completa que envia el engranaje de la APK. Cada categoria pertenece a una sola
// impresora: asi un producto nunca sale en la estacion equivocada.
export function validarImpresoras(lista, categorias) {
  if (!Array.isArray(lista)) throw fallo('Envía la lista de impresoras');
  if (lista.length > MAX_IMPRESORAS) throw fallo(`Máximo ${MAX_IMPRESORAS} impresoras`);
  const nombreCategoria = new Map(categorias.map((c) => (typeof c === 'string' ? [c, c] : [c.id, c.nombre])));
  const duenaDeCategoria = new Map();
  if (lista.filter((impresora) => impresora?.tirillas === true).length > 1) {
    throw fallo('Solo una impresora puede ser la de prefacturas y facturas');
  }
  return lista.map((impresora, indice) => {
    const nombre = String(impresora?.nombre || '').trim() || `Impresora ${indice + 1}`;
    if (nombre.length > 60) throw fallo(`${nombre.slice(0, 20)}…: el nombre es muy largo`);
    const ip = String(impresora?.ip || '').trim();
    if (!esIpPrivada(ip)) throw fallo(`${nombre}: escribe la IP de la impresora en la red del local (ej. 192.168.0.95)`);
    const puerto = impresora?.puerto === undefined || impresora?.puerto === '' ? 9100 : Number(impresora.puerto);
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw fallo(`${nombre}: puerto inválido`);
    const papel = Number(impresora?.papel || 80);
    if (![58, 80].includes(papel)) throw fallo(`${nombre}: el papel debe ser de 58 u 80 mm`);
    const categoriaIds = [...new Set((impresora?.categoriaIds || []).map(String))];
    if (categoriaIds.some((id) => !nombreCategoria.has(id))) throw fallo(`${nombre}: tiene una categoría que ya no existe`);
    for (const id of categoriaIds) {
      if (duenaDeCategoria.has(id)) {
        throw fallo(`La categoría ${nombreCategoria.get(id)} está en ${duenaDeCategoria.get(id)} y en ${nombre}: déjala solo en una`);
      }
      duenaDeCategoria.set(id, nombre);
    }
    const id = UUID.test(String(impresora?.id || '')) ? String(impresora.id) : undefined;
    return { id, nombre, ip, puerto, papel, orden: indice, categoriaIds, tirillas: impresora?.tirillas === true };
  });
}

// Sin la migracion aplicada falta la tabla (P2021) o una columna nueva (P2022): los celulares siguen funcionando.
const tablaFaltante = (error) => ['P2021', 'P2022'].includes(error?.code);

router.get('/', wrap(async (req, res) => {
  const categorias = await prisma.categoria.findMany({ orderBy: { codigo: 'asc' }, select: { id: true, nombre: true } });
  let impresoras = [];
  try {
    impresoras = await prisma.impresora.findMany({ orderBy: { orden: 'asc' } });
  } catch (error) {
    if (!tablaFaltante(error)) throw error;
  }
  res.json({ impresoras, categorias, puedeEditar: (req.usuario?.permisos || []).includes('empresa.editar') });
}));

router.put('/', wrap(async (req, res) => {
  if (!(req.usuario?.permisos || []).includes('empresa.editar')) {
    return res.status(403).json({ error: 'Solo un administrador puede cambiar las impresoras del local' });
  }
  const categorias = await prisma.categoria.findMany({ select: { id: true, nombre: true } });
  let lista;
  try {
    lista = validarImpresoras(req.body?.impresoras, categorias);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const conservar = lista.map((i) => i.id).filter(Boolean);
      await tx.impresora.deleteMany({ where: { id: { notIn: conservar } } });
      for (const { id, ...datos } of lista) {
        if (id) await tx.impresora.upsert({ where: { id }, create: { id, ...datos }, update: datos });
        else await tx.impresora.create({ data: datos });
      }
    });
  } catch (error) {
    if (tablaFaltante(error)) return res.status(503).json({ error: 'Falta aplicar la migración de impresoras en el servidor' });
    throw error;
  }
  await auditar({ req, accion: 'EDITAR', entidad: 'impresoras', entidadId: null, detalle: lista.map((i) => `${i.nombre} ${i.ip}`).join(', ') });
  res.json({ impresoras: await prisma.impresora.findMany({ orderBy: { orden: 'asc' } }) });
}));

export default router;
