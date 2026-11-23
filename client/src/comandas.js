// Envio de comandas de cocina a las impresoras de red del local (ESC/POS por TCP, puerto 9100).
// El servidor esta en la nube y no alcanza las IP privadas del local: las envia el dispositivo que tomo el
// pedido, que si esta en esa red. La APK usa su plugin nativo Impresion.imprimirRed y la app de escritorio
// window.posDesktop.imprimirRed. En un navegador comun no hay forma de abrir un socket TCP.
import { esApk, llamarNativo } from './movil.js';

export const puedeImprimirEnRed = () => esApk() || typeof window !== 'undefined' && typeof window.posDesktop?.imprimirRed === 'function';

async function enviar({ ip, puerto, datos }) {
  if (esApk()) return llamarNativo('Impresion', 'imprimirRed', { ip, puerto, datos });
  if (typeof window.posDesktop?.imprimirRed === 'function') return window.posDesktop.imprimirRed({ ip, puerto, datos });
  throw new Error('Este dispositivo no puede imprimir comandas: usa la APK o la app de escritorio dentro del local');
}

// Envia cada comanda y devuelve [{ estacion, ip, ok, error }]. Nunca lanza.
export async function imprimirComandas(comandas = []) {
  const resultados = await Promise.allSettled(comandas.map((c) => enviar(c)));
  const lista = resultados.map((r, i) => ({
    estacion: comandas[i].estacion, ip: comandas[i].ip, ok: r.status === 'fulfilled', error: r.reason?.message,
  }));
  const fallidas = lista.filter((r) => !r.ok);
  if (fallidas.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos:comandas-fallidas', { detail: fallidas }));
  }
  return lista;
}
