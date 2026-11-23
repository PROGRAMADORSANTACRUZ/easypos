const { Socket } = require('node:net');

// Envio de comandas ESC/POS a impresoras de red del local (TCP, puerto 9100). El servidor esta en la nube y no
// alcanza estas IP privadas; la app de escritorio si, porque corre dentro del local.
const TIEMPO_ESPERA_MS = 5000;
const MAX_BYTES = 256 * 1024;

function esIpPrivada(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ''));
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

function validarComanda({ ip, puerto = 9100, datos } = {}) {
  if (!esIpPrivada(ip)) throw new Error('La impresora debe tener una IP de la red local');
  const p = Number(puerto);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Puerto de impresora inválido');
  const contenido = Buffer.from(String(datos || ''), 'base64');
  if (!contenido.length || contenido.length > MAX_BYTES) throw new Error('Comanda vacía o demasiado grande');
  return { ip, puerto: p, contenido };
}

async function enviarComandaRed(comanda, { crearSocket = () => new Socket() } = {}) {
  const { ip, puerto, contenido } = validarComanda(comanda);
  return new Promise((resolve, reject) => {
    const socket = crearSocket();
    let terminado = false;
    const terminar = (error) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      if (error) reject(new Error(`No se pudo conectar con la impresora ${ip}:${puerto}`));
      else resolve({ ok: true });
    };
    socket.setTimeout(TIEMPO_ESPERA_MS);
    socket.once('error', terminar);
    socket.once('timeout', () => terminar(new Error('timeout')));
    socket.connect(puerto, ip, () => socket.end(contenido, () => terminar()));
  });
}

module.exports = { enviarComandaRed, esIpPrivada, validarComanda };
