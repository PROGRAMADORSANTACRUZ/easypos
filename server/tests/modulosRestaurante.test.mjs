import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULOS_RESTAURANTE_DEFAULT, restringirModuloRestaurante, validarModulosRestaurante } from '../src/modulosRestaurante.js';

function evaluar(path, modulos, { method = 'GET', query = {}, body = {} } = {}) {
  let siguiente = false;
  let status;
  let cuerpo;
  const req = { path, method, query, body, tenant: { modulos } };
  const res = {
    status(codigo) { status = codigo; return this; },
    json(datos) { cuerpo = datos; return this; },
  };
  restringirModuloRestaurante(req, res, () => { siguiente = true; });
  return { siguiente, status, cuerpo };
}

test('los permisos efectivos provienen de roles e ignoran submódulos guardados en usuario', async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-role-permissions';
  const { permisosEfectivos, puedeLeerCatalogoParaPedidos } = await import('../src/middleware/auth.js');
  assert.deepEqual(permisosEfectivos(['facturas.ver', 'pedidos.crear'], ['factura_venta', 'cortesias']), [
    'facturas.ver',
    'pedidos.crear',
  ]);
  assert.equal(puedeLeerCatalogoParaPedidos('GET', '/', ['pedidos.ver']), true);
  assert.equal(puedeLeerCatalogoParaPedidos('GET', '/categorias', ['pedidos.ver']), false);
  assert.equal(puedeLeerCatalogoParaPedidos('POST', '/', ['pedidos.ver']), false);
});

test('bloquea endpoints de grupos deshabilitados', () => {
  const resultado = evaluar('/api/mesas', ['inventario']);
  assert.equal(resultado.siguiente, false);
  assert.equal(resultado.status, 403);
  assert.match(resultado.cuerpo.error, /no está habilitado/i);
});

test('permite endpoints cuando el grupo está habilitado', () => {
  assert.equal(evaluar('/api/mesas', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/bajas', ['inventario']).siguiente, true);
  assert.equal(evaluar('/api/bajas/opciones', ['ventas']).status, 403);
});

test('permite consultar productos desde ventas, pero solo inventario puede modificarlos', () => {
  assert.equal(evaluar('/api/productos', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/productos', ['ventas'], { method: 'POST' }).status, 403);
  assert.equal(evaluar('/api/productos', ['inventario'], { method: 'POST' }).siguiente, true);
});

test('la plataforma de restaurantes queda fuera de los módulos del tenant', () => {
  assert.equal(evaluar('/api/plataforma/restaurantes/publico', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/plataforma/restaurantes', ['ventas']).siguiente, true);
});

test('mantiene disponibles login y sesión sin el módulo de administración', () => {
  assert.equal(evaluar('/api/usuarios/login', ['ventas']).siguiente, true);
  assert.equal(evaluar('/api/usuarios/sesion', ['ventas']).siguiente, true);
});

test('separa factura electrónica y factura de venta', () => {
  assert.equal(evaluar('/api/facturas', ['dian']).siguiente, true);
  assert.equal(evaluar('/api/facturas', ['ventas'], { query: { electronica: 'false' } }).siguiente, true);
  assert.equal(evaluar('/api/facturas', ['dian'], { query: { electronica: 'false' } }).status, 403);
  assert.equal(evaluar('/api/facturas/123/reenviar-dian', ['ventas'], { method: 'POST' }).status, 403);
});

test('conserva todos los módulos por defecto y rechaza configuraciones inválidas', () => {
  assert.equal(MODULOS_RESTAURANTE_DEFAULT.length, 7);
  assert.equal(validarModulosRestaurante(MODULOS_RESTAURANTE_DEFAULT), true);
  assert.equal(validarModulosRestaurante([]), false);
  assert.equal(validarModulosRestaurante(['ventas', 'ventas']), false);
  assert.equal(validarModulosRestaurante(['desconocido']), false);
});
