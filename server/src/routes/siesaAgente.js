// API del agente de Siesa: el PC con la VPN de AWS (server/scripts/siesa-agente.mjs) pide los documentos
// pendientes ya armados, los envia a Siesa y devuelve aqui el resultado, que queda en LogIntegracion.
// Se autentica con SIESA_AGENTE_TOKEN (sin token configurado la API responde 503).
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { configSiesa } from '../siesaProtocolo.js';
import { registrar } from '../siesaVentas.js';
import { listarPendientesSiesa } from '../siesaProgramador.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ESTADOS = new Set(['OK', 'ERROR', 'REINTENTAR', 'OMITIDO']);
const CLAVE = /^(VENTA|CLIENTE|RECIBO):[0-9A-Za-z-]{1,40}$/;

function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function autenticarAgente(req, res, next) {
  const esperado = process.env.SIESA_AGENTE_TOKEN;
  if (!esperado) return res.status(503).json({ error: 'El agente de Siesa no esta habilitado en el servidor' });
  const recibido = req.header('x-agente-token') || '';
  if (!recibido || !igual(recibido, esperado)) return res.status(401).json({ error: 'Token del agente invalido' });
  next();
}

router.use(autenticarAgente);

router.get('/pendientes', wrap(async (req, res) => {
  const desde = new Date(process.env.SIESA_ENVIO_DESDE || '');
  if (Number.isNaN(desde.getTime())) {
    return res.status(503).json({ error: 'Falta SIESA_ENVIO_DESDE en el servidor (ej. 2026-11-21T00:00:00-05:00)' });
  }
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 200);
  const items = await listarPendientesSiesa({ desde, cfg: configSiesa(), limite });
  res.json({ desde: desde.toISOString(), items });
}));

router.post('/resultado', wrap(async (req, res) => {
  const { clave, estado, mensaje, request, response } = req.body || {};
  if (!CLAVE.test(String(clave))) return res.status(400).json({ error: 'Clave de documento invalida' });
  if (!ESTADOS.has(estado)) return res.status(400).json({ error: 'Estado invalido' });
  await registrar(clave, estado, { request, response, mensaje });
  res.status(201).json({ ok: true });
}));

export default router;
