import { llamarNativo } from './movil.js';
import { guardarImpresora, imprimirTirillaEnRed, leerImpresora, quitarImpresora, sinImpresionDirecta, TIRILLA_PRUEBA } from './impresoraTirillas.js';

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

// Con una impresora de red configurada la tirilla sale directo; si falla se ofrece el diálogo de Android
async function imprimir(html, marco, botonImprimir) {
  const impresora = leerImpresora();
  if (!impresora) return imprimirConAndroid(html, marco);
  const textoOriginal = botonImprimir.textContent;
  botonImprimir.disabled = true;
  botonImprimir.textContent = 'Imprimiendo…';
  try {
    await imprimirTirillaEnRed(html, impresora);
    botonImprimir.textContent = 'Impreso ✓';
    setTimeout(() => { botonImprimir.textContent = textoOriginal; botonImprimir.disabled = false; }, 1500);
  } catch (error) {
    botonImprimir.textContent = textoOriginal;
    botonImprimir.disabled = false;
    // Una APK sin la impresión directa (versión vieja) usa el diálogo de Android sin preguntar
    if (sinImpresionDirecta(error) || window.confirm(`${error?.message || 'No se pudo imprimir'}.\n\n¿Imprimir con el diálogo de Android?`)) {
      imprimirConAndroid(html, marco);
    }
  }
}

function campo(etiqueta, control) {
  const fila = document.createElement('label');
  Object.assign(fila.style, { display: 'grid', gap: '4px', fontSize: '14px', fontWeight: '600' });
  fila.append(etiqueta, control);
  return fila;
}

function configurarImpresora() {
  const actual = leerImpresora() || { ip: '', puerto: 9100, papel: 58 };
  const fondo = document.createElement('div');
  Object.assign(fondo.style, {
    position: 'fixed', inset: '0', zIndex: '2100', background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  });
  const caja = document.createElement('div');
  Object.assign(caja.style, {
    background: '#1E1B18', color: '#EDDFCA', borderRadius: '12px', padding: '16px', width: '100%', maxWidth: '360px', display: 'grid', gap: '12px',
  });
  const titulo = document.createElement('strong');
  titulo.textContent = 'Impresora de tirillas (red)';
  const ayuda = document.createElement('div');
  ayuda.textContent = 'La APK imprime directo en esta impresora, sin RawBT. Quítala para volver al diálogo de Android.';
  Object.assign(ayuda.style, { fontSize: '13px', opacity: '.8' });
  const estilo = { padding: '10px', borderRadius: '8px', border: '1px solid #555', fontSize: '16px', background: '#141210', color: '#EDDFCA' };
  const ip = Object.assign(document.createElement('input'), { value: actual.ip, placeholder: '192.168.1.50', inputMode: 'decimal' });
  const puerto = Object.assign(document.createElement('input'), { value: String(actual.puerto), inputMode: 'numeric' });
  const papel = document.createElement('select');
  papel.append(new Option('58 mm', '58'), new Option('80 mm', '80'));
  papel.value = String(actual.papel);
  [ip, puerto, papel].forEach((control) => Object.assign(control.style, estilo));
  const mensaje = document.createElement('div');
  Object.assign(mensaje.style, { fontSize: '13px', minHeight: '18px' });
  const avisar = (texto, error = false) => { mensaje.textContent = texto; mensaje.style.color = error ? '#ff8a80' : '#9be7a3'; };
  const datos = () => ({ ip: ip.value, puerto: puerto.value, papel: papel.value });

  const cerrarConfig = () => fondo.remove();
  const guardar = boton('Guardar', '#E1362B', '#fff');
  guardar.addEventListener('click', () => {
    try { guardarImpresora(datos()); cerrarConfig(); } catch (error) { avisar(error.message, true); }
  });
  const probar = boton('Probar', '#EDDFCA', '#1E1B18');
  probar.addEventListener('click', async () => {
    try {
      const config = guardarImpresora(datos());
      avisar('Enviando prueba…');
      await imprimirTirillaEnRed(TIRILLA_PRUEBA, config);
      avisar('Prueba enviada. Si salió la tirilla, ya quedó configurada.');
    } catch (error) {
      avisar(sinImpresionDirecta(error) ? 'Actualiza la APK para imprimir directo.' : error.message, true);
    }
  });
  const quitar = boton('Quitar', 'transparent', '#EDDFCA');
  quitar.addEventListener('click', () => { quitarImpresora(); cerrarConfig(); });
  const cancelar = boton('Cancelar', 'transparent', '#EDDFCA');
  cancelar.addEventListener('click', cerrarConfig);
  const botones = document.createElement('div');
  Object.assign(botones.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' });
  botones.append(quitar, cancelar, probar, guardar);

  caja.append(titulo, ayuda, campo('IP de la impresora', ip), campo('Puerto', puerto), campo('Papel', papel), mensaje, botones);
  fondo.append(caja);
  fondo.addEventListener('click', (evento) => { if (evento.target === fondo) cerrarConfig(); });
  document.body.append(fondo);
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

export function mostrarVisorApk(html) {
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
  botonImprimir.addEventListener('click', () => imprimir(html, marco, botonImprimir));
  const botonImpresora = boton('⚙', '#2A2521', '#EDDFCA');
  botonImpresora.title = 'Configurar impresora';
  botonImpresora.setAttribute('aria-label', 'Configurar impresora');
  botonImpresora.addEventListener('click', configurarImpresora);
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
