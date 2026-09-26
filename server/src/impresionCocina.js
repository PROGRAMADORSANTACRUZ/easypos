// Impresion de comandas de cocina via ESC/POS por red (TCP raw, puerto 9100 tipico).
// Cada categoria puede tener su propia impresora (estacion): asi la bebida sale en el
// bar y el sancocho en cocina, sin depender del navegador ni de un dialogo de impresion.
import { Socket } from 'node:net';

const ESC = '\x1b';
const GS = '\x1d';
const INIT = ESC + '@';
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const CENTRO = ESC + 'a' + '\x01';
const IZQUIERDA = ESC + 'a' + '\x00';
const DOBLE_ALTO = GS + '!' + '\x11';
const NORMAL = GS + '!' + '\x00';
const CORTE = GS + 'V' + '\x41' + '\x00';
const SALTO = '\n';

// Arma el texto plano (ESC/POS) de un ticket para una estacion con solo sus items.
function construirTicket({ estacion, mesa, mesera, pedidoId, items, notasGenerales, observaciones }) {
  const fecha = new Date().toLocaleString('es-CO');
  let t = INIT + CENTRO + DOBLE_ALTO + BOLD_ON + (estacion || 'COCINA') + BOLD_OFF + NORMAL + SALTO;
  t += IZQUIERDA + '--------------------------------' + SALTO;
  t += `Mesa: ${mesa ?? '-'}    Mesera: ${mesera ?? '-'}` + SALTO;
  t += `Pedido #${pedidoId}    ${fecha}` + SALTO;
  t += '--------------------------------' + SALTO;
  for (const it of items) {
    t += BOLD_ON + `${it.cantidad}x ${(it.nombre || '').toUpperCase()}` + BOLD_OFF + SALTO;
    if (it.notas) t += `  (${it.notas})` + SALTO;
  }
  t += '--------------------------------' + SALTO;
  if (observaciones) t += BOLD_ON + `Obs: ${observaciones}` + BOLD_OFF + SALTO;
  if (notasGenerales) t += `Cambios: ${notasGenerales}` + SALTO;
  t += SALTO + SALTO + SALTO + CORTE;
  return t;
}

// Envia el texto crudo a la impresora por TCP. No lanza si falla (la cocina no debe
// bloquear el pedido); solo registra el error en consola.
function enviarAImpresora(ip, puerto, contenido) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const terminar = (err) => {
      if (err) console.error(`[impresion] Error enviando a ${ip}:${puerto} ->`, err.message);
      socket.destroy();
      resolve();
    };
    socket.setTimeout(4000);
    socket.once('error', terminar);
    socket.once('timeout', () => terminar(new Error('timeout')));
    socket.connect(puerto, ip, () => {
      socket.write(Buffer.from(contenido, 'binary'), () => terminar());
    });
  });
}

// Agrupa los items del pedido por la impresora de su categoria y envia un ticket
// por cada estacion (cocina, bar, postres, etc). Items sin categoria/impresora se ignoran.
// pedido: { id, mesa, mesera, cambios }, items: [{ cantidad, notas, producto: { nombre, categoria } }]
export async function imprimirComandaPorEstacion(pedido, items) {
  const grupos = new Map(); // "ip:puerto|nombreCategoria" -> { ip, puerto, estacion, items: [] }
  for (const it of items) {
    const cat = it.producto?.categoria;
    if (!cat?.impresoraIp) continue;
    const puerto = cat.impresoraPuerto || 9100;
    const clave = `${cat.impresoraIp}:${puerto}`;
    if (!grupos.has(clave)) grupos.set(clave, { ip: cat.impresoraIp, puerto, estacion: cat.nombre, items: [] });
    grupos.get(clave).items.push({ cantidad: it.cantidad, notas: it.notas, nombre: it.producto?.nombre });
  }

  const envios = [];
  for (const grupo of grupos.values()) {
    const ticket = construirTicket({
      estacion: grupo.estacion,
      mesa: pedido.mesa?.numero ?? (pedido.tipo === 'DOMICILIO' ? 'DOMICILIO' : null),
      mesera: pedido.mesera?.nombre,
      pedidoId: pedido.id,
      items: grupo.items,
      notasGenerales: pedido.cambios,
      observaciones: pedido.observaciones,
    });
    envios.push(enviarAImpresora(grupo.ip, grupo.puerto, ticket));
  }
  await Promise.all(envios);
}
