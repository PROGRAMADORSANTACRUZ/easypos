// Nucleo del agente de Siesa (PC con la VPN de AWS). Sin Prisma ni red propia: recibe las funciones de E/S
// para poder probarlo. Lo usa server/scripts/siesa-agente.mjs.
import { construirXmlImportar, interpretarRespuestaSiesa } from './siesaProtocolo.js';

// Envia en orden los documentos pendientes.
// - `existeEnSiesa(verificar)` (opcional) consulta t350 para no reenviar lo que ya esta cargado; si lanza (por
//   ejemplo, sin VPN) el ciclo se detiene sin informar nada.
// - `asegurarTercero(item)` (opcional) crea el tercero de un cliente con la API de consulta antes de enviar su
//   registro 201. Devuelve { ok, clienteExiste, mensaje, transitorio, response }.
// - `informar(resultado)` devuelve el resultado al POS.
// Se detiene ante la primera falla de red de Siesa.
export async function procesarPendientes(items, { cfg, existeEnSiesa, asegurarTercero, enviar, informar }) {
  const estados = new Map();
  const resumen = { OK: 0, ERROR: 0, REINTENTAR: 0, SALTADOS: 0, YA_EN_SIESA: 0 };
  const cerrar = async (item, estado, mensaje, extra = {}) => {
    await informar({ clave: item.clave, estado, mensaje, request: item.lineas.join('\n'), ...extra });
    estados.set(item.clave, estado);
  };
  for (const item of items) {
    if (item.depende && estados.get(item.depende) !== 'OK') {
      resumen.SALTADOS += 1;
      continue;
    }
    if (item.verificar && existeEnSiesa && await existeEnSiesa(item.verificar)) {
      await cerrar(item, 'OK', 'Ya existia en Siesa (t350); no se reenvio');
      resumen.YA_EN_SIESA += 1;
      continue;
    }
    if (item.tercero && asegurarTercero) {
      const tercero = await asegurarTercero(item);
      if (!tercero.ok) {
        const estado = tercero.transitorio ? 'REINTENTAR' : 'ERROR';
        await cerrar(item, estado, tercero.mensaje, { response: tercero.response });
        resumen[estado] += 1;
        if (tercero.transitorio) break;
        continue;
      }
      // Un cliente que ya existe en Siesa no se sobrescribe con los datos del POS, salvo reenvio pedido o edicion.
      if (tercero.clienteExiste && !item.actualizar) {
        await cerrar(item, 'OK', 'Ya existe como cliente en Siesa; no se modifica');
        resumen.YA_EN_SIESA += 1;
        continue;
      }
    }
    const { status, cuerpo } = await enviar(cfg, construirXmlImportar(item.lineas, cfg));
    const resultado = interpretarRespuestaSiesa(status, cuerpo);
    const estado = resultado.ok ? 'OK' : resultado.transitorio ? 'REINTENTAR' : 'ERROR';
    await cerrar(item, estado, resultado.mensaje, { response: cuerpo });
    resumen[estado] += 1;
    if (estado === 'REINTENTAR') break;
  }
  return resumen;
}

// Crea el tercero con la API de consulta si no existe y lo confirma con /verificar-cliente (resultado: 0 no existe,
// 1 solo tercero, 2 tercero y cliente). `api.verificar(nit)` -> numero; `api.crearTercero(payload)` -> { status, cuerpo }.
// Los errores de red son transitorios; cualquier otra falla se informa con el cuerpo de la respuesta.
export async function asegurarTerceroConApi(item, api) {
  const nit = item.tercero.nit;
  try {
    let existe = await api.verificar(nit);
    if (existe === 0) {
      const respuesta = await api.crearTercero(item.tercero);
      const cuerpo = String(respuesta.cuerpo ?? '').slice(0, 1500);
      if (respuesta.status < 200 || respuesta.status >= 300) {
        return { ok: false, transitorio: respuesta.status >= 500, mensaje: `La API no creo el tercero (HTTP ${respuesta.status}): ${cuerpo.slice(0, 300)}`, response: cuerpo };
      }
      existe = await api.verificar(nit);
      if (existe === 0) {
        return { ok: false, transitorio: false, mensaje: `La API respondio HTTP ${respuesta.status} pero el tercero ${nit} sigue sin existir en Siesa: ${cuerpo.slice(0, 300)}`, response: cuerpo };
      }
    }
    return { ok: true, clienteExiste: existe === 2 };
  } catch (error) {
    return { ok: false, transitorio: true, mensaje: `No se pudo hablar con la API de consulta: ${error.message}` };
  }
}
