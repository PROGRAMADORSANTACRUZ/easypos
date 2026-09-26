import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const conRelaciones = { caja: true, usuario: true };

// Desglosa una factura en aportes por forma de pago -> [{ metodo, monto }].
// - Crédito: no entra dinero al turno, se marca aparte como CRÉDITO
// - Pago mixto "EFECTIVO $x + TARJETA $y": una entrada por cada parte
// - Pago simple: el total al método indicado
// La propina se recibe de contado: se suma al efectivo (o al método único si es
// tarjeta/transferencia sin efectivo).
function desglosarFactura(f) {
  const m = String(f.metodoPago || '').trim();
  const propina = f.propina || 0;
  if (f.credito) {
    const partes = [{ metodo: 'CRÉDITO', monto: f.total || 0 }];
    if (propina) partes.push({ metodo: 'EFECTIVO', monto: propina });
    return partes;
  }
  if (m.includes(' + ')) {
    const partes = [];
    for (const parte of m.split(' + ')) {
      const txt = parte.trim();
      const monto = Number(txt.replace(/[^0-9]/g, '')) || 0;
      const metodo = txt.replace(/\s*\$?\s*[0-9.,]+\s*$/, '').trim().toUpperCase() || 'OTRO';
      partes.push({ metodo, monto });
    }
    if (propina) {
      const ef = partes.find((p) => /^efectivo/i.test(p.metodo));
      if (ef) ef.monto += propina; else partes.push({ metodo: 'EFECTIVO', monto: propina });
    }
    return partes;
  }
  const metodo = (m || 'OTRO').toUpperCase();
  return [{ metodo, monto: (f.total || 0) + propina }];
}

// Efectivo que aporta una factura al cajon (para el cuadre).
function efectivoDeFactura(f) {
  return desglosarFactura(f)
    .filter((p) => /^efectivo/i.test(p.metodo))
    .reduce((s, p) => s + p.monto, 0);
}

// Calcula el cuadre de una apertura a partir de sus facturas.
async function calcularCuadre(apertura) {
  const facturas = await prisma.factura.findMany({
    where: { aperturaId: apertura.id },
    select: { total: true, propina: true, metodoPago: true, credito: true },
  });
  const totalVentas = facturas.reduce((s, f) => s + (f.total || 0), 0);
  const totalPropinas = facturas.reduce((s, f) => s + (f.propina || 0), 0);
  const totalEfectivo = facturas.reduce((s, f) => s + efectivoDeFactura(f), 0);
  const valorEsperado = (apertura.valorInicial || 0) + totalEfectivo;

  // Desglose por forma de pago para el cuadre.
  const acum = {};
  for (const f of facturas) {
    for (const p of desglosarFactura(f)) {
      acum[p.metodo] = (acum[p.metodo] || 0) + p.monto;
    }
  }
  const desglosePagos = Object.entries(acum)
    .map(([metodo, monto]) => ({ metodo, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => b.monto - a.monto);

  return {
    numFacturas: facturas.length,
    totalVentas: Math.round(totalVentas * 100) / 100,
    totalPropinas: Math.round(totalPropinas * 100) / 100,
    totalEfectivo: Math.round(totalEfectivo * 100) / 100,
    valorEsperado: Math.round(valorEsperado * 100) / 100,
    desglosePagos,
  };
}

// Listar aperturas (filtros opcionales ?cajaId= &usuarioId= &estado=)
router.get('/', wrap(async (req, res) => {
  const { cajaId, usuarioId, estado } = req.query;
  const where = {
    ...(cajaId && { cajaId: String(cajaId) }),
    ...(usuarioId && { usuarioId: String(usuarioId) }),
    ...(estado && { estado: String(estado) }),
  };
  const aperturas = await prisma.aperturaCaja.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
    orderBy: { fechaApertura: 'desc' },
  });
  res.json(aperturas);
}));

// Apertura de caja activa (ABIERTA). Prefiere la del usuario en sesion.
router.get('/activa', wrap(async (req, res) => {
  const uid = req.query.usuarioId || req.headers['x-usuario-id'];
  let ap = null;
  if (uid) {
    ap = await prisma.aperturaCaja.findFirst({
      where: { estado: 'ABIERTA', usuarioId: String(uid) },
      include: conRelaciones,
      orderBy: { fechaApertura: 'desc' },
    });
  }
  if (!ap) {
    ap = await prisma.aperturaCaja.findFirst({
      where: { estado: 'ABIERTA' },
      include: conRelaciones,
      orderBy: { fechaApertura: 'desc' },
    });
  }
  res.json(ap);
}));

router.get('/:id', wrap(async (req, res) => {
  const ap = await prisma.aperturaCaja.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!ap) return res.status(404).json({ error: 'Apertura no encontrada' });
  res.json(ap);
}));

// Preview del cuadre (base + efectivo del turno). No modifica nada.
router.get('/:id/cuadre', wrap(async (req, res) => {
  const ap = await prisma.aperturaCaja.findUnique({ where: { id: String(req.params.id) } });
  if (!ap) return res.status(404).json({ error: 'Apertura no encontrada' });
  const cuadre = await calcularCuadre(ap);
  res.json({ valorInicial: ap.valorInicial, ...cuadre });
}));

// Abrir caja (crea la apertura en estado ABIERTA)
router.post('/', wrap(async (req, res) => {
  const { cajaId, usuarioId, valorInicial } = req.body;
  const uid = usuarioId || req.headers['x-usuario-id'];
  const ap = await prisma.aperturaCaja.create({
    data: {
      cajaId: cajaId ? String(cajaId) : null,
      usuarioId: uid ? String(uid) : null,
      valorInicial: Number(valorInicial) || 0,
      estado: 'ABIERTA',
    },
    include: conRelaciones,
  });
  await auditar({ req, accion: 'CREAR', entidad: 'apertura_caja', entidadId: ap.id, detalle: `Apertura ${ap.caja?.nombre || 'caja'} con ${ap.valorInicial}` });
  res.status(201).json(ap);
}));

// Cerrar caja (marca fechaCierre y estado CERRADA)
router.post('/:id/cerrar', wrap(async (req, res) => {
  try {
    const actual = await prisma.aperturaCaja.findUnique({ where: { id: String(req.params.id) } });
    if (!actual) return res.status(404).json({ error: 'Apertura no encontrada' });
    if (actual.estado === 'CERRADA') return res.status(400).json({ error: 'La caja ya está cerrada' });

    const cuadre = await calcularCuadre(actual);
    const contadoRaw = req.body?.valorContado;
    const valorContado = contadoRaw === undefined || contadoRaw === null || contadoRaw === '' ? null : Number(contadoRaw);
    const diferencia = valorContado == null ? null : Math.round((valorContado - cuadre.valorEsperado) * 100) / 100;

    const ap = await prisma.aperturaCaja.update({
      where: { id: String(req.params.id) },
      data: {
        fechaCierre: new Date(),
        estado: 'CERRADA',
        totalVentas: cuadre.totalVentas,
        totalEfectivo: cuadre.totalEfectivo,
        valorEsperado: cuadre.valorEsperado,
        valorContado,
        diferencia,
        observacionCierre: req.body?.observacion ? String(req.body.observacion) : null,
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'CERRAR', entidad: 'apertura_caja', entidadId: ap.id, detalle: `Cierre ${ap.caja?.nombre || 'caja'} • esperado ${cuadre.valorEsperado}${valorContado != null ? ` • contado ${valorContado} • dif ${diferencia}` : ''}` });
    res.json(ap);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Apertura no encontrada' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { cajaId, usuarioId, valorInicial, fechaApertura, fechaCierre, estado } = req.body;
  try {
    const ap = await prisma.aperturaCaja.update({
      where: { id: String(req.params.id) },
      data: {
        ...(cajaId !== undefined && { cajaId: cajaId ? String(cajaId) : null }),
        ...(usuarioId !== undefined && { usuarioId: usuarioId ? String(usuarioId) : null }),
        ...(valorInicial !== undefined && { valorInicial: Number(valorInicial) || 0 }),
        ...(fechaApertura !== undefined && { fechaApertura: new Date(fechaApertura) }),
        ...(fechaCierre !== undefined && { fechaCierre: fechaCierre ? new Date(fechaCierre) : null }),
        ...(estado !== undefined && { estado: estado ? String(estado) : null }),
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'apertura_caja', entidadId: ap.id, detalle: `${ap.caja?.nombre || 'caja'} (${ap.estado})` });
    res.json(ap);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Apertura no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.aperturaCaja.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'apertura_caja', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Apertura no encontrada' });
    throw e;
  }
}));

export default router;
