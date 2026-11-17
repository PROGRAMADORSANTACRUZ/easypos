import { llamarNativo } from './movil.js';

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

async function imprimir(html, marco) {
  try {
    await llamarNativo('Impresion', 'imprimir', { html, nombre: 'POS Santacruz' });
  } catch {
    try { marco.contentWindow?.print(); } catch { /* Sin servicio de impresión disponible. */ }
  }
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
  botonImprimir.addEventListener('click', () => imprimir(html, marco));
  const botonCerrar = boton('Cerrar', '#EDDFCA', '#1E1B18');
  botonCerrar.addEventListener('click', () => {
    window.history.back();
    setTimeout(() => cerrar(visor), 300);
  });

  acciones.append(botonImprimir, botonCerrar);
  barra.append(titulo, acciones);
  raiz.append(barra, marco);
  document.body.append(raiz);
  pila.push(visor);
  window.history.pushState({ visorApk: true }, '');
  return visor;
}
