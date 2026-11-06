import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fuente = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const inicio = fuente.indexOf('const GRUPO_POR_MODULO =');
const fin = fuente.indexOf('// Sub-reportes', inicio);
assert.ok(inicio >= 0 && fin > inicio);
const rutaInicial = new Function(`${fuente.slice(inicio, fin)}\nreturn rutaInicial;`)();

test('MESERO inicia en Mesas aunque tambien pueda consultar pedidos', () => {
  assert.equal(rutaInicial({ roles: ['MESERO'], permisos: ['mesas.ver', 'pedidos.ver', 'pedidos.crear'] }), '/mesas');
});

test('el cajero conserva Caja como inicio', () => {
  assert.equal(rutaInicial({ roles: ['CAJERO'], permisos: ['mesas.ver', 'pedidos.ver', 'caja.abrir'] }), '/caja');
});

test('el rol MESERO no concede acceso a Mesas sin permiso ni con el modulo deshabilitado', () => {
  assert.equal(rutaInicial({ roles: ['MESERO'], permisos: ['pedidos.ver'] }), '/pedidos');
  assert.notEqual(rutaInicial({
    roles: ['MESERO'], permisos: ['mesas.ver', 'productos.ver'], restaurante: { modulos: ['inventario'] },
  }), '/mesas');
});

const fuentePedido = await readFile(new URL('../src/pages/TomarPedido.jsx', import.meta.url), 'utf8');
const inicioCancelar = fuentePedido.indexOf('  const confirmarCancelar = async (e) => {');
const finCancelar = fuentePedido.indexOf('\n  // Mueve el pedido', inicioCancelar);
assert.ok(inicioCancelar >= 0 && finCancelar > inicioCancelar);

async function cancelarPedido({ motivo = '', procesando = false, falla = false } = {}) {
  const llamadas = [];
  const contexto = {
    motivoCancelacion: motivo,
    procesando,
    pedido: { id: 12 },
    notify: (...args) => llamadas.push(['aviso', ...args]),
    setProcesando: (valor) => llamadas.push(['procesando', valor]),
    setConfirmandoCancelar: (valor) => llamadas.push(['dialogo', valor]),
    navigate: (ruta) => llamadas.push(['navegar', ruta]),
    api: {
      post: async (ruta, datos) => {
        llamadas.push(['enviar', ruta, datos]);
        if (falla) throw new Error('Error de prueba');
      },
    },
  };
  const ejecutar = new Function(...Object.keys(contexto), `${fuentePedido.slice(inicioCancelar, finCancelar)}\nreturn confirmarCancelar;`)(...Object.values(contexto));
  await ejecutar({ preventDefault() {} });
  return llamadas;
}

test('el formulario no cancela sin motivo ni duplica un envio en curso', async () => {
  assert.equal((await cancelarPedido({ motivo: '   ' })).some(([accion]) => accion === 'enviar'), false);
  assert.equal((await cancelarPedido({ motivo: 'Cliente se retira', procesando: true })).some(([accion]) => accion === 'enviar'), false);
});

test('la cancelacion envia el motivo y cierra el dialogo solo si el servidor confirma', async () => {
  const llamadas = await cancelarPedido({ motivo: '  Cliente se retira  ' });
  assert.deepEqual(llamadas.find(([accion]) => accion === 'enviar'), ['enviar', '/pedidos/12/cancelar', { motivo: 'Cliente se retira' }]);
  assert.ok(llamadas.some(([accion, valor]) => accion === 'dialogo' && valor === false));
  assert.ok(llamadas.some(([accion, valor]) => accion === 'navegar' && valor === '/mesas'));
});

test('un error al cancelar conserva el dialogo y no navega fuera del pedido', async () => {
  const llamadas = await cancelarPedido({ motivo: 'Cliente se retira', falla: true });
  assert.equal(llamadas.some(([accion]) => accion === 'dialogo' || accion === 'navegar'), false);
  assert.ok(llamadas.some(([accion, valor]) => accion === 'procesando' && valor === false));
});

const fuenteReportes = await readFile(new URL('../src/pages/Reportes.jsx', import.meta.url), 'utf8');
const inicioHistorial = fuenteReportes.indexOf('  const cargarHistorial = async');
const finHistorial = fuenteReportes.indexOf('\n  const cargar =', inicioHistorial);
assert.ok(inicioHistorial >= 0 && finHistorial > inicioHistorial);

test('el reporte consulta fechas y motivo por el endpoint de reportes y guarda los filtros aplicados', async () => {
  const llamadas = [];
  const contexto = {
    desde: '2026-11-01', hasta: '2026-11-06', motivo: ' Cliente se retira ',
    consultaHistorial: { current: 0 }, URLSearchParams,
    setCargandoHistorial: (valor) => llamadas.push(['cargando', valor]),
    setErrorHistorial: (valor) => llamadas.push(['error', valor]),
    setHistorial: (valor) => llamadas.push(['datos', valor]),
    setFiltrosHistorial: (valor) => llamadas.push(['filtros', valor]),
    api: { get: async (ruta) => { llamadas.push(['consulta', ruta]); return [{ id: 1 }]; } },
  };
  const consultar = new Function(...Object.keys(contexto), `${fuenteReportes.slice(inicioHistorial, finHistorial)}\nreturn cargarHistorial;`)(...Object.values(contexto));
  await consultar();
  const url = new URL(llamadas.find(([accion]) => accion === 'consulta')[1], 'http://localhost');
  assert.equal(url.pathname, '/reportes/historial-pedidos');
  assert.equal(url.searchParams.get('desde'), '2026-11-01');
  assert.equal(url.searchParams.get('hasta'), '2026-11-06');
  assert.equal(url.searchParams.get('motivo'), 'Cliente se retira');
  assert.deepEqual(llamadas.find(([accion]) => accion === 'filtros')[1], {
    desde: '2026-11-01', hasta: '2026-11-06', motivo: 'Cliente se retira',
  });
});

test('Hoy restablece fechas y motivo del historial sin cargar reportes de ventas', () => {
  const inicio = fuenteReportes.indexOf('  const limpiar = () => {');
  const fin = fuenteReportes.indexOf('\n  useEffect(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const llamadas = [];
  const contexto = {
    sel: 'historial-pedidos', hoy: '2026-11-06',
    setDesde: (valor) => llamadas.push(['desde', valor]), setHasta: (valor) => llamadas.push(['hasta', valor]),
    setMotivo: (valor) => llamadas.push(['motivo', valor]),
    cargarHistorial: (...args) => llamadas.push(['consulta', ...args]),
  };
  new Function(...Object.keys(contexto), `${fuenteReportes.slice(inicio, fin)}\nlimpiar();`)(...Object.values(contexto));
  assert.deepEqual(llamadas, [
    ['desde', '2026-11-06'], ['hasta', '2026-11-06'], ['motivo', ''], ['consulta', '2026-11-06', '2026-11-06', ''],
  ]);
});

test('la exportacion del historial conserva motivo, actor y los estados anterior y posterior', () => {
  const inicioHelpers = fuenteReportes.indexOf('const ACCIONES_HISTORIAL =');
  const finHelpers = fuenteReportes.indexOf('\nfunction EstadoHistorialPedido', inicioHelpers);
  const inicioDatos = fuenteReportes.indexOf('  const datosReporte = () => {');
  const finDatos = fuenteReportes.indexOf('\n  const rangoDesde', inicioDatos);
  assert.ok(inicioHelpers >= 0 && finHelpers > inicioHelpers && inicioDatos >= 0 && finDatos > inicioDatos);
  const historial = [{
    pedidoId: 7, fecha: '2026-11-06T15:00:00Z', usuarioCuenta: 'supervisor', usuarioNombre: 'Supervisor',
    accion: 'CANCELAR', estado: 'CANCELADO', motivo: 'Cliente se retira', antes: { mesaNumero: 3, estado: 'ABIERTO', items: [] },
    despues: { mesaNumero: 3, estado: 'CANCELADO', items: [] },
  }];
  const exportado = new Function('sel', 'historial', 'money', 'fechaHoraColombia',
    `${fuenteReportes.slice(inicioHelpers, finHelpers)}\n${fuenteReportes.slice(inicioDatos, finDatos)}\nreturn datosReporte();`)(
    'historial-pedidos', historial, String, (fecha) => fecha,
  );
  assert.equal(exportado.filas[0][3], 'supervisor');
  assert.equal(exportado.filas[0][6], 'Cliente se retira');
  assert.match(exportado.filas[0][8], /ABIERTO/);
  assert.match(exportado.filas[0][9], /CANCELADO/);
  assert.equal(exportado.columnas[10], 'Estado');
  assert.equal(exportado.filas[0][10], 'Cancelado');
});

const fuenteCocina = await readFile(new URL('../src/pages/Cocina.jsx', import.meta.url), 'utf8');

test('cocina solo muestra comandas pendientes y retira las listas sin esperar a la entrega', () => {
  const inicio = fuenteCocina.indexOf('  const pendientes =');
  const fin = fuenteCocina.indexOf('\n  const texto =', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const pedidos = [1, 2, 3, 4].map((id) => ({ id }));
  const preparaciones = {
    2: { listo: true, estadoCocina: 'LISTO' }, 3: { listo: true, estadoCocina: 'ENTREGADO' },
    4: { listo: false, estadoCocina: 'RECHAZADO' },
  };
  const pendientes = new Function('pedidos', 'preparaciones', `${fuenteCocina.slice(inicio, fin)}\nreturn pendientes;`)(pedidos, preparaciones);
  assert.deepEqual(pendientes.map((pedido) => pedido.id), [1]);
});

test('cada plato se marca por separado y la comanda se completa con la respuesta del servidor', async () => {
  const inicio = fuenteCocina.indexOf('  const marcarItemListo = async');
  const fin = fuenteCocina.indexOf('\n  const registrarResultado', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const llamadas = [];
  let preparaciones = {};
  const contexto = {
    cocineroId: '', setMarcando: () => {}, setItemMarcando: () => {}, notify: () => {}, cargar: async () => {}, cargarHistorial: () => {},
    setPreparaciones: (actualizar) => { preparaciones = actualizar(preparaciones); },
    api: { put: async (ruta, datos) => { llamadas.push([ruta, datos]); return { pedidoId: 7, listo: false, itemsListos: [{ pedidoItemId: 12 }] }; } },
  };
  await new Function(...Object.keys(contexto), `${fuenteCocina.slice(inicio, fin)}\nreturn marcarItemListo;`)(...Object.values(contexto))(
    { id: 7 }, { id: 12, producto: { nombre: 'Chuzo' } },
  );
  assert.deepEqual(llamadas, [['/preparacion-cocina/7/items/12/listo', { cocineroId: null }]]);
  assert.equal(preparaciones[7].listo, false);
  assert.equal(preparaciones[7].itemsListos[0].pedidoItemId, 12);
});

async function entregarEnMesa(estadoCocina, procesando = false) {
  const inicio = fuentePedido.indexOf('  const entregarPedido = async');
  const fin = fuentePedido.indexOf('\n  const cancelarEdicionObservaciones', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const llamadas = [];
  const contexto = {
    procesando, pedido: { id: 7 }, estadoEntrega: { estadoCocina },
    setProcesando: () => {}, notify: () => {},
    setEstadoEntrega: (datos) => llamadas.push(['estado', datos]),
    api: { post: async (ruta, datos) => {
      llamadas.push(['enviar', ruta, datos]);
      return { estadoCocina: 'ENTREGADO', entrega: { fecha: '2026-11-06T15:00:00Z' } };
    } },
  };
  await new Function(...Object.keys(contexto), `${fuentePedido.slice(inicio, fin)}\nreturn entregarPedido;`)(...Object.values(contexto))();
  return llamadas;
}

test('Entregar solo envia desde mesa cuando cocina esta lista y conserva la fecha del servidor', async () => {
  assert.deepEqual(await entregarEnMesa('PENDIENTE'), []);
  assert.deepEqual(await entregarEnMesa('ENTREGADO'), []);
  assert.deepEqual(await entregarEnMesa('LISTO', true), []);
  const llamadas = await entregarEnMesa('LISTO');
  assert.deepEqual(llamadas[0], ['enviar', '/pedidos/7/entregar', {}]);
  assert.equal(llamadas[1][1].estadoCocina, 'ENTREGADO');
  assert.equal(llamadas[1][1].entrega.fecha, '2026-11-06T15:00:00Z');
});