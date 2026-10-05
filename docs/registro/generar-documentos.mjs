import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
const origen = process.env.DOCS_POS_URL || 'http://127.0.0.1:5173';
const documentos = ['Descripcion-tecnica-SANTACRUZ-POS', 'Manual-de-usuario-SANTACRUZ-POS'];
const pantallas = [
  ['/', '01-acceso.png', 'Ingresar'],
  ['/caja', '02-caja.png', 'Caja abierta'],
  ['/mesas', '03-mesas.png', 'OCUPADA'],
  ['/mesas/1/pedido', '04-toma-pedido.png', 'Enviar pedido'],
  ['/productos', '05-productos.png', 'DEMO-001'],
  ['/inventario', '06-inventario.png', 'Insumo de demostracion A'],
  ['/facturas', '07-facturacion.png', 'Por facturar (1)'],
  ['/reportes', '08-reportes.png', 'Ventas totales'],
];

const categoria = { id: 'cat-demo', nombre: 'Platos principales' };
const productos = [
  { id: 'prod-demo-1', codigo: 'DEMO-001', nombre: 'Plato de demostracion', precio: 30000, costo: 15000, iva: 0, activo: true, categoria, kit: [], stockMinimo: 5 },
  { id: 'prod-demo-2', codigo: 'DEMO-002', nombre: 'Bebida de demostracion', precio: 8000, costo: 3000, iva: 0, activo: true, categoria: { id: 'cat-demo-2', nombre: 'Bebidas' }, kit: [], stockMinimo: 10 },
];
const personal = { id: 1, nombre: 'Personal de demostracion' };
const pedido = {
  id: 1001, mesaId: 2, meseraId: 1, mesa: { id: 2, numero: 2 }, mesera: personal, estado: 'ABIERTO', createdAt: '2026-10-05T14:00:00Z',
  items: [{ id: 101, productoId: productos[0].id, producto: productos[0], cantidad: 2, precioUnit: 30000 }],
  observaciones: 'Pedido ficticio para el manual', preparacion: { listo: false },
};
const apertura = { id: 'ap-demo', estado: 'ABIERTA', valorInicial: 100000, fechaApertura: '2026-10-05T12:00:00Z', usuario: { usuario: 'demo.documentacion' } };
const datos = {
  '/plataforma/restaurantes/publico': [],
  '/mesas': Array.from({ length: 8 }, (_, indice) => ({ id: indice + 1, numero: indice + 1, capacidad: 4, estado: indice === 1 ? 'OCUPADA' : 'LIBRE', pedidos: indice === 1 ? [pedido] : [] })),
  '/meseras': [personal], '/productos': productos,
  '/productos/categorias': [categoria, { id: 'cat-demo-2', nombre: 'Bebidas' }], '/pedidos': [pedido],
  '/cajas': [{ id: 'caja-demo', nombre: 'Caja principal' }], '/aperturas': [apertura], '/aperturas/activa': apertura,
  '/empresa': { nombre: 'Empresa de demostracion', razonSocial: 'Empresa de demostracion', propinaPct: 10 },
  '/inventario': [
    { id: 'ins-1', codigo: 'INS-DEMO-01', nombre: 'Insumo de demostracion A', unidad: 'unidad', stock: 40, stockMinimo: 10, costo: 3500 },
    { id: 'ins-2', codigo: 'INS-DEMO-02', nombre: 'Insumo de demostracion B', unidad: 'kg', stock: 3, stockMinimo: 5, costo: 12000 },
  ],
  '/tipos-documento': [{ id: 'td-demo', clase: 'FACTURA ELECTRONICA DE VENTA', esElectronico: true, activo: true, prefijo: 'DEMO', consInicial: 1, consFinal: 9999, consProximo: 1 }],
  '/reportes': {
    totales: { total: 152000, facturas: 4, unidades: 8, subtotal: 152000, impuesto: 0, notasCredito: 0, notasDebito: 0, retenciones: 0, totalNeto: 152000 },
    ventasPorDia: [{ clave: '2026-10-05', facturas: 4, total: 152000 }], ventasPorSemana: [], ventasPorMes: [],
    porCategoria: [], porMesera: [], porMesa: [], porFormaPago: [], productos: { dia: [], semana: [], mes: [] }, detalle: [], gastos: { porProducto: [], porInsumo: [] },
  },
  '/cuentas-contables': [], '/impuestos': [], '/unidades-medida': [], '/clientes': [], '/facturas': [],
  '/reportes/pedidos-mesa': [], '/reportes/cocina': [],
};

async function comprobarFuentes() {
  for (const documento of documentos) {
    const texto = await readFile(path.join(carpeta, `${documento}.md`), 'utf8');
    for (const enlace of texto.matchAll(/\]\(([^)]+)\)/g)) {
      assert.ok((await stat(path.resolve(carpeta, enlace[1]))).isFile(), `Referencia invalida: ${enlace[1]}`);
    }
  }
  for (const [, archivo] of pantallas) {
    const buffer = await readFile(path.join(carpeta, 'capturas', archivo));
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
    assert.equal(buffer.readUInt32BE(16), 1440, `Ancho inesperado: ${archivo}`);
    assert.ok(buffer.readUInt32BE(20) >= 1000, `Alto inesperado: ${archivo}`);
  }
}

async function capturar(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: 'America/Bogota', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(origen).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const consulta = route.request().method() === 'GET';
    const ruta = url.pathname.replace(/^\/api/, '');
    assert.ok(!consulta || Object.hasOwn(datos, ruta), `Consulta sin ejemplo definido: ${ruta}`);
    await route.fulfill({ status: consulta ? 200 : 403, contentType: 'application/json', body: JSON.stringify(consulta ? datos[ruta] : { error: 'Demostracion de solo lectura' }) });
  });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', error => errores.push(error.message));
  await page.goto(origen);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(carpeta, 'capturas', '01-acceso.png'), fullPage: true });
  await context.addInitScript(() => {
    const modulos = ['mesas', 'cocina', 'facturas', 'factura_venta', 'cortesias', 'pedidos', 'cuentas', 'clientes', 'caja', 'productos', 'inventario', 'bodegas', 'movimientos', 'compras', 'proveedores', 'resoluciones', 'notas_credito', 'notas_debito', 'retenciones', 'empresa', 'usuarios', 'roles', 'auditoria', 'reportes'];
    localStorage.setItem('easypos_user', JSON.stringify({ id: 'demo-documentacion', nombre: 'Demostracion documental', usuario: 'demo.documentacion', roles: ['ADMIN'], permisos: [...modulos.flatMap(modulo => ['ver', 'crear', 'editar', 'eliminar'].map(accion => `${modulo}.${accion}`)), 'caja.abrir', 'caja.cerrar'], token: 'DEMO-NO-VALIDO' }));
    localStorage.setItem('easypos_tema', 'light');
  });
  for (const [ruta, archivo, texto] of pantallas.slice(1)) {
    await page.goto(`${origen}${ruta}`);
    await page.getByText(texto, { exact: true }).first().waitFor();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => innerWidth), 1440);
    assert.equal(await page.locator('img').evaluateAll(imagenes => imagenes.filter(imagen => !imagen.complete || imagen.naturalWidth === 0).length), 0, `Imagen ausente en ${ruta}`);
    await page.screenshot({ path: path.join(carpeta, 'capturas', archivo), fullPage: true });
    console.log(`Captura verificada: ${archivo}`);
  }
  assert.deepEqual(errores, [], 'Error de ejecucion en la interfaz');
  await context.close();
}

const estilos = `
@page { size: A4; margin: 17mm 16mm 20mm; }
* { box-sizing: border-box; }
body { color: #252525; background: #fff; font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.45; margin: 0; }
main { max-width: 820px; margin: 32px auto; padding: 0 24px; }
header { border-bottom: 3px solid #cf3029; padding-bottom: 14px; display: flex; align-items: center; gap: 18px; font-family: 'Trebuchet MS', sans-serif; }
header img { width: 105px; height: auto; }
header p { margin: 0; font-size: 10pt; color: #575757; }
h1, h2, h3 { font-family: 'Trebuchet MS', sans-serif; line-height: 1.2; break-after: avoid; letter-spacing: 0; }
h1 { font-size: 25pt; margin-bottom: 8px; }
h2 { font-size: 17pt; margin-top: 0; color: #a52723; }
h3 { font-size: 13pt; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
p, li { orphans: 3; widows: 3; }
li { margin-bottom: 5px; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 14px 0; }
thead { display: table-header-group; }
th { background: #f0f0f0; text-align: left; }
th, td { padding: 7px; border: 1px solid #ccc; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
code { font-size: 9pt; overflow-wrap: anywhere; }
a { color: #8f2925; }
figure { margin: 20px 0; break-inside: avoid; }
figure img { display: block; width: 100%; height: auto; max-height: 155mm; object-fit: contain; border: 1px solid #ccc; }
figcaption { font-size: 9pt; color: #555; margin-top: 6px; }
footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9pt; color: #555; }
@media (max-width: 640px) { main { padding: 0 14px; } header { flex-wrap: wrap; } h1 { font-size: 22pt; } table { font-size: 8pt; } }
@media print { main { max-width: none; margin: 0; padding: 0; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

async function generar(browser) {
  const logo = (await readFile(path.resolve(carpeta, '../../client/public/logo-oscuro.png'))).toString('base64');
  const page = await browser.newPage();
  for (const documento of documentos) {
    const markdown = await readFile(path.join(carpeta, `${documento}.md`), 'utf8');
    let cuerpo = await marked.parse(markdown);
    for (const imagen of [...cuerpo.matchAll(/<img src="([^"]+)" alt="([^"]*)">/g)]) {
      const buffer = await readFile(path.resolve(carpeta, imagen[1]));
      cuerpo = cuerpo.replace(imagen[0], `<img src="data:image/png;base64,${buffer.toString('base64')}" alt="${imagen[2]}">`);
    }
    cuerpo = cuerpo.replace(/<p>(<img [\s\S]*?)<\/p>\s*<p>(Figura [\s\S]*?)<\/p>/g, '<figure>$1<figcaption>$2</figcaption></figure>');
    const titulo = documento.startsWith('Manual') ? 'Manual de usuario' : 'Descripcion tecnica';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SANTACRUZ POS | ${titulo}</title><style>${estilos}</style></head><body><main><header><img src="data:image/png;base64,${logo}" alt="Marca visible en el software"><p>Documentacion para registro de software<br>Edicion documental: 5 de octubre de 2026</p></header>${cuerpo}<footer>SANTACRUZ POS | ${titulo} | Confirmar autor, titular y version antes de presentar.</footer></main></body></html>`;
    const destino = path.join(carpeta, `${documento}.html`);
    await writeFile(destino, html);
    await page.goto(pathToFileURL(destino).href);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('img').evaluateAll(imagenes => imagenes.filter(imagen => !imagen.complete || imagen.naturalWidth === 0).length), 0);
    await page.pdf({ path: path.join(carpeta, `${documento}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#666">SANTACRUZ POS | <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    for (const ancho of [1440, 390]) {
      await page.setViewportSize({ width: ancho, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Desbordamiento a ${ancho}px en ${documento}`);
    }
    console.log(`HTML y PDF generados: ${documento}`);
  }
  await page.close();
}

async function registrarIntegridad() {
  const archivos = [...documentos.flatMap(documento => ['md', 'html', 'pdf'].map(extension => `${documento}.${extension}`)), ...pantallas.map(([, archivo]) => `capturas/${archivo}`)];
  const registro = [];
  for (const archivo of archivos) {
    const buffer = await readFile(path.join(carpeta, archivo));
    registro.push({ archivo, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: carpeta, encoding: 'utf8' }).trim();
  await writeFile(path.join(carpeta, 'Integridad-documental.json'), `${JSON.stringify({ generadoEn: new Date().toISOString(), revisionCodigoConsultado: revision, modalidad: 'Interfaz real con sesion y respuestas ficticias; sin API, base de datos ni emision DIAN', advertencia: 'Los hashes permiten comprobar integridad; no acreditan autoria ni fecha de creacion de la obra.', archivos: registro }, null, 2)}\n`);
}

async function verificar() {
  await comprobarFuentes();
  const manifiesto = JSON.parse(await readFile(path.join(carpeta, 'Integridad-documental.json'), 'utf8'));
  assert.equal(manifiesto.archivos.length, 14);
  for (const entrada of manifiesto.archivos) {
    const buffer = await readFile(path.join(carpeta, entrada.archivo));
    assert.equal(buffer.length, entrada.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), entrada.sha256, `Integridad invalida: ${entrada.archivo}`);
    if (entrada.archivo.endsWith('.pdf')) assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  }
  const manual = await readFile(path.join(carpeta, `${documentos[1]}.html`), 'utf8');
  assert.equal((manual.match(/<figure>/g) || []).length, 8);
  console.log('Verificacion correcta: referencias, 8 PNG, 8 figuras, 2 PDF y 14 hashes SHA-256.');
}

if (process.argv.includes('--check')) {
  await verificar();
} else {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origen).hostname), 'Solo se permiten interfaces locales para documentacion');
  for (const documento of documentos) {
    const archivo = path.join(carpeta, `${documento}.md`);
    const texto = await readFile(archivo, 'utf8');
    const normalizado = texto.replace(/\r\n/g, '\n');
    if (texto !== normalizado) await writeFile(archivo, normalizado);
  }
  await mkdir(path.join(carpeta, 'capturas'), { recursive: true });
  const browser = await chromium.launch({ channel: process.env.DOCS_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    await capturar(browser);
    await comprobarFuentes();
    await generar(browser);
    await registrarIntegridad();
    await verificar();
  } finally {
    await browser.close();
  }
}