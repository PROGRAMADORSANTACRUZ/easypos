// Nucleo del agente de Siesa (PC con la VPN de AWS). Sin Prisma ni red propia: recibe las funciones de E/S
// para poder probarlo. Lo usa server/scripts/siesa-agente.mjs.
import { construirXmlImportar, interpretarRespuestaSiesa } from './siesaProtocolo.js';

// Envia en orden los documentos pendientes. `existeEnSiesa(verificar)` (opcional) consulta t350 para no reenviar
// lo que ya esta cargado; si lanza (por ejemplo, sin VPN) el ciclo se detiene sin informar nada.
// `informar(resultado)` devuelve el resultado al POS. Se detiene ante la primera falla de red de Siesa.
export async function procesarPendientes(items, { cfg, existeEnSiesa, enviar, informar }) {
  const estados = new Map();
  const resumen = { OK: 0, ERROR: 0, REINTENTAR: 0, SALTADOS: 0, YA_EN_SIESA: 0 };
  for (const item of items) {
    if (item.depende && estados.get(item.depende) !== 'OK') {
      resumen.SALTADOS += 1;
      continue;
    }
    const request = item.lineas.join('\n');
    if (item.verificar && existeEnSiesa && await existeEnSiesa(item.verificar)) {
      await informar({ clave: item.clave, estado: 'OK', mensaje: 'Ya existia en Siesa (t350); no se reenvio', request });
      estados.set(item.clave, 'OK');
      resumen.YA_EN_SIESA += 1;
      continue;
    }
    const { status, cuerpo } = await enviar(cfg, construirXmlImportar(item.lineas, cfg));
    const resultado = interpretarRespuestaSiesa(status, cuerpo);
    const estado = resultado.ok ? 'OK' : resultado.transitorio ? 'REINTENTAR' : 'ERROR';
    await informar({ clave: item.clave, estado, mensaje: resultado.mensaje, request, response: cuerpo });
    estados.set(item.clave, estado);
    resumen[estado] += 1;
    if (estado === 'REINTENTAR') break;
  }
  return resumen;
}
