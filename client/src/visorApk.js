import { llamarNativo } from './movil.js';
import { impresoraDelCelular, impresoraPrefacturas, imprimirTirillaEnRed, sinImpresionDirecta } from './impresoraTirillas.js';
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

// Qué enviar y a dónde. La prefactura va siempre a la impresora de prefacturas del local. La tirilla del pedido
// se reparte por categoría y cada producto sale solo en su impresora; lo demás va a la impresora del celular.
async function planDeImpresion(html, { repartir, prefactura } = {}) {
  let impresoras = [];
  try { impresoras = (await obtenerImpresorasLocal()).impresoras || []; } catch { /* sin servidor: impresora fija o la del celular */ }
  if (prefactura) return { trabajos: [{ impresora: impresoraPrefacturas(impresoras), html }], sinImpresora: [], repartido: false };
  if (repartir && impresoras.length) return { ...(await repartir(impresoras)), repartido: true };
  const delCelular = impresoraDelCelular(impresoras);
  return { trabajos: delCelular ? [{ impresora: delCelular, html }] : [], sinImpresora: [], repartido: false };
}

async function enviar(trabajos) {
  const resultados = await Promise.allSettled(trabajos.map(({ impresora, html }) => imprimirTirillaEnRed(html, impresora)));
  return resultados.map((r, i) => ({ ...trabajos[i], error: r.status === 'rejected' ? r.reason : null })).filter((t) => t.error);
}

async function imprimir(html, marco, botonImprimir, opciones) {
  const textoOriginal = botonImprimir.textContent;
  const restaurar = () => { botonImprimir.textContent = textoOriginal; botonImprimir.disabled = false; };
  botonImprimir.disabled = true;
  botonImprimir.textContent = 'Imprimiendo…';
  const { trabajos, sinImpresora, repartido } = await planDeImpresion(html, opciones);
  if (!trabajos.length) {
    restaurar();
    if (repartido) {
      window.alert(`Ningún producto tiene impresora asignada (${sinImpresora.join(', ')}). Asigna sus categorías en el engranaje.`);
      return undefined;
    }
    return imprimirConAndroid(html, marco);
  }
  if (sinImpresora.length && !window.confirm(`Estos productos no tienen impresora y no se imprimirán: ${sinImpresora.join(', ')}.\n\n¿Imprimir el resto en su impresora?`)) {
    restaurar();
    return undefined;
  }
  let pendientes = trabajos;
  for (;;) {
    pendientes = await enviar(pendientes);
    if (!pendientes.length) break;
    // Una APK sin la impresión directa (versión vieja) no puede repartir: el resto de tirillas usa el diálogo de Android
    if (pendientes.some((t) => sinImpresionDirecta(t.error))) {
      restaurar();
      if (repartido) {
        window.alert('Actualiza la APK (versión 1.4.0 o superior) para imprimir cada producto en su impresora.');
        return undefined;
      }
      return imprimirConAndroid(html, marco);
    }
    const detalle = pendientes.map((t) => `• ${t.impresora.nombre}: ${t.error?.message || 'sin respuesta'}`).join('\n');
    // Solo se reintenta la impresora que falló, con sus productos: nunca la tirilla completa en otra impresora
    if (!window.confirm(`No se pudo imprimir en:\n${detalle}\n\n¿Reintentar solo en esa impresora?`)) {
      restaurar();
      return undefined;
    }
  }
  botonImprimir.textContent = trabajos.length > 1 ? `Impreso en ${trabajos.length} ✓` : 'Impreso ✓';
  setTimeout(restaurar, 1500);
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

// opciones.repartir(impresoras) -> { trabajos: [{ impresora, html }], sinImpresora: [nombres] } reparte la tirilla
// entre varias impresoras; opciones.prefactura la envia siempre a la impresora de prefacturas del local.
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
  botonImprimir.addEventListener('click', () => imprimir(html, marco, botonImprimir, opciones));
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
