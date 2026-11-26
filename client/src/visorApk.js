import { llamarNativo } from './movil.js';
import { impresoraDelCelular, imprimirTirillaEnRed, sinImpresionDirecta } from './impresoraTirillas.js';
import { obtenerImpresorasLocal } from './impresorasLocal.js';
import { abrirConfigImpresoras } from './configImpresoras.js';

// Visor de tirillas dentro de la APK. Android WebView no abre ventanas emergentes de impresión:
// aquí la tirilla se muestra en una capa propia y el botón Atrás de Android solo la cierra.
const pila = [];

function cerrar(visor) {
  const indice = pila.indexOf(visor);
  if (indice === -1) return;
  pila.splice(indice, 1);
  visor.raiz.remove();
}

window.addEventListener('popstate', () => {
  const arriba = pila[pila.length - 1];
  if (arriba) cerrar(arriba);
});

async function imprimirConAndroid(html, marco) {
  try {
    await llamarNativo('Impresion', 'imprimir', { html, nombre: 'POS Santacruz' });
  } catch {
    try { marco.contentWindow?.print(); } catch { /* Sin servicio de impresión disponible. */ }
  }
}

// Qué enviar y a dónde: la tirilla del pedido se reparte por categoría; el resto va a la impresora del celular
async function planDeImpresion(html, repartir) {
  let impresoras = [];
  try { impresoras = (await obtenerImpresorasLocal()).impresoras || []; } catch { /* sin servidor: solo la del celular */ }
  const delCelular = impresoraDelCelular(impresoras);
  if (repartir) {
    const plan = await repartir(impresoras, delCelular);
    if (plan?.trabajos?.length || plan?.sinImpresora?.length) return plan;
  }
  return { trabajos: delCelular ? [{ impresora: delCelular, html }] : [], sinImpresora: [] };
}

async function imprimir(html, marco, botonImprimir, repartir) {
  const textoOriginal = botonImprimir.textContent;
  const restaurar = () => { botonImprimir.textContent = textoOriginal; botonImprimir.disabled = false; };
  botonImprimir.disabled = true;
  botonImprimir.textContent = 'Imprimiendo…';
  const { trabajos, sinImpresora } = await planDeImpresion(html, repartir);
  if (!trabajos.length) {
    restaurar();
    if (sinImpresora.length) window.alert(`Ningún producto tiene impresora asignada (${sinImpresora.join(', ')}). Configúralas en el engranaje.`);
    return imprimirConAndroid(html, marco);
  }
  if (sinImpresora.length && !window.confirm(`Sin impresora asignada: ${sinImpresora.join(', ')}.\n\n¿Imprimir el resto?`)) {
    restaurar();
    return undefined;
  }
  const resultados = await Promise.allSettled(trabajos.map(({ impresora, html: tirilla }) => imprimirTirillaEnRed(tirilla, impresora)));
  const fallidos = resultados.map((r, i) => ({ ...r, impresora: trabajos[i].impresora })).filter((r) => r.status === 'rejected');
  if (!fallidos.length) {
    botonImprimir.textContent = trabajos.length > 1 ? `Impreso en ${trabajos.length} ✓` : 'Impreso ✓';
    setTimeout(restaurar, 1500);
    return undefined;
  }
  restaurar();
  // Una APK sin la impresión directa (versión vieja) usa el diálogo de Android sin preguntar
  if (fallidos.some((f) => sinImpresionDirecta(f.reason))) return imprimirConAndroid(html, marco);
  const detalle = fallidos.map((f) => `• ${f.impresora.nombre}: ${f.reason?.message || 'sin respuesta'}`).join('\n');
  if (window.confirm(`No se pudo imprimir en:\n${detalle}\n\n¿Imprimir la tirilla completa con el diálogo de Android?`)) {
    imprimirConAndroid(html, marco);
  }
  return undefined;
}
function boton(texto, fondo, color) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = texto;
  Object.assign(el.style, {
    padding: '8px 14px', border: '1px solid #555', borderRadius: '8px', fontWeight: '700',
    fontSize: '15px', background: fondo, color,
  });
  return el;
}

// opciones.repartir(impresoras, delCelular) -> { trabajos: [{ impresora, html }], sinImpresora: [nombres] }
// permite que una tirilla (ej. el pedido) salga repartida en varias impresoras.
export function mostrarVisorApk(html, opciones = {}) {
  const raiz = document.createElement('div');
  raiz.setAttribute('role', 'dialog');
  Object.assign(raiz.style, {
    position: 'fixed', inset: '0', zIndex: '2000', display: 'flex', flexDirection: 'column', background: '#e9e6e1',
  });

  const barra = document.createElement('div');
  Object.assign(barra.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    padding: '10px 12px', background: '#1E1B18', color: '#EDDFCA',
  });
  const titulo = document.createElement('strong');
  titulo.textContent = 'Tirilla';
  const acciones = document.createElement('div');
  Object.assign(acciones.style, { display: 'flex', gap: '8px' });

  const marco = document.createElement('iframe');
  marco.srcdoc = html;
  Object.assign(marco.style, { flex: '1', width: '100%', border: '0', background: '#fff' });

  const visor = { raiz };
  const botonImprimir = boton('Imprimir', '#E1362B', '#fff');
  botonImprimir.addEventListener('click', () => imprimir(html, marco, botonImprimir, opciones.repartir));
  const botonImpresora = boton('⚙', '#2A2521', '#EDDFCA');
  botonImpresora.title = 'Impresoras del local';
  botonImpresora.setAttribute('aria-label', 'Impresoras del local');
  botonImpresora.addEventListener('click', abrirConfigImpresoras);
  const botonCerrar = boton('Cerrar', '#EDDFCA', '#1E1B18');
  botonCerrar.addEventListener('click', () => {
    window.history.back();
    setTimeout(() => cerrar(visor), 300);
  });

  acciones.append(botonImpresora, botonImprimir, botonCerrar);
  barra.append(titulo, acciones);
  raiz.append(barra, marco);
  document.body.append(raiz);
  pila.push(visor);
  window.history.pushState({ visorApk: true }, '');
  return visor;
}
