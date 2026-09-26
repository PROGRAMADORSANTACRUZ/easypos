import { Router } from 'express';
import { probarConexionFactus } from '../factus.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Prueba las credenciales configuradas (FACTUS_*) contra el endpoint de autenticacion.
router.get('/estado', wrap(async (req, res) => {
  try {
    const info = await probarConexionFactus();
    res.json(info);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
}));

export default router;
