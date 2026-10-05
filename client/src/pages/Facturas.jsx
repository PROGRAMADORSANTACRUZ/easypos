import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { Logo, overlayCierre } from '../components/ui/index.jsx';
import { LOGO_RECIBO } from '../logoRecibo.js';
import { useAuth, useToast } from '../App.jsx';
import CierreCajaModal from '../components/CierreCajaModal.jsx';
import { formatoDe, estiloPagina, abrirVentanaVacia, escribirEImprimir, registrarEmpresa } from '../print.js';
import { tipoDocumentoListo } from '../tipoDocumentoListo.js';
import { diaColombia } from '../fechaComercial.js';

// Número visible de la factura: prefijo + consecutivo DIAN, o el ID corto si aún no tiene numeración.
function numeroDian(f) {
  if (f?.numeroFactura) return `${f.prefijo || ''}${f.numeroFactura}`;
  return `#${String(f?.id || '').slice(0, 8)}`;
}

// Datos del emisor (empresa) para el encabezado del recibo; se llenan al cargar la vista.
let empresaRecibo = null;
// Tipo de documento FACTURA activo (parametrizado en Parámetros > Tipos de documentos); da el Número de resolución del bloque legal.
let tipoFacturaRecibo = null;
const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Propina sugerida: 10% del total (editable por el cajero/cliente).
export const sugPropina = (total) => Math.round((total || 0) * 0.1);

// Permite a otras pantallas (ej. Cotizaciones/Factura de venta) compartir los datos
// del emisor y del Tipo de documento activo para poder imprimir el mismo ticket legal.
export function configurarRecibo(empresa, tipoDoc) {
  empresaRecibo = empresa;
  tipoFacturaRecibo = tipoDoc;
  registrarEmpresa(empresa);
}

// Imprime el recibo como ticket con la misma estructura, más estética. `campoFormato` permite
// que otra pantalla (ej. Cotizaciones/Factura de venta) use su propio formato configurado.
export async function imprimirRecibo(f, efectivo, campoFormato = 'formatoFactura', ventana = abrirVentanaVacia()) {
  if (!f) return;
  const dt = new Date(f.createdAt);
  const fechaDia = dt.toLocaleDateString('es-CO');
  const horaDia = dt.toLocaleTimeString('es-CO');
  // Condición de pago: crédito con plazo o contado.
  const condPago = f.credito
    ? `CRÉDITO ${f.creditoDias || f.cliente?.creditoDias || ''} DÍAS`.trim()
    : 'CONTADO';
  const cli = f.cliente || null;
  const nombreCli = (cli?.nombre || f.pedido?.cliente || 'CONSUMIDOR FINAL').toUpperCase();
  const docCli = cli?.numeroDocumento || cli?.documento || '222222222222';
  // Bloque legal de autorizacion DIAN. Rango y vigencia salen del Tipo de documento FACTURA activo.
  const tipoDoc = tipoFacturaRecibo || {};
  const fFecha = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
  const mesesVig = (a, b) => { if (!a || !b) return ''; const x = new Date(a), y = new Date(b); if (isNaN(x) || isNaN(y)) return ''; const m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()); return m > 0 ? `${m} MESES` : ''; };
  const preF = tipoDoc.prefijo || '';
  const auth = {
    numero: tipoDoc.nroResolucion || '',
    estado: 'AUTORIZADA',
    rangoDesde: tipoDoc.consInicial != null ? `${preF}${tipoDoc.consInicial}` : '',
    rangoHasta: tipoDoc.consFinal != null ? `${preF}${tipoDoc.consFinal}` : '',
    vigDesde: fFecha(tipoDoc.fechaResolucion),
    vigHasta: fFecha(tipoDoc.fechaResolucionVcto),
    vigMeses: mesesVig(tipoDoc.fechaResolucion, tipoDoc.fechaResolucionVcto),
    elaboradoPor: (f.usuario?.nombre || '').toUpperCase(),
    software: 'Sistema POS GRUPO SANTACRUZ',
    fabricante: empresaRecibo?.razonSocial || '',
    fabricanteNit: empresaRecibo?.nit || '',
    proveedor: 'Factus',
    proveedorNit: '1000789002-2',
  };
  // CUFE, fecha de aceptacion y firma digital los entrega el proveedor tecnologico al conectar. Sin integracion quedan en blanco.
  // Si la factura no es electronica (Factura de venta, estadoDIAN='NO_APLICA') no debe mostrarse nada de CUFE/QR/bloque legal DIAN.
  const esElectronica = f.estadoDIAN !== 'NO_APLICA';
  const nombreEmisor = esElectronica
    ? empresaRecibo?.nombreComercial || empresaRecibo?.razonSocial || 'Asados Santacruz'
    : 'CRISTIAN FABIAN SERRANO MILLAN';
  const cufe = f.cufe || '';
  const fechaAceptacion = f.fechaAceptacion || '';
  const firmaDigital = f.firmaDigital || '';
  // QR de verificacion DIAN a partir del CUFE (dominio de habilitacion o produccion segun el ambiente configurado).
  const qrUrl = esElectronica && cufe
    ? `https://${empresaRecibo?.ambienteDIAN === 'PRODUCCION' ? 'catalogo-vpfe' : 'catalogo-vpfe-hab'}.dian.gov.co/document/searchqr?documentkey=${cufe}`
    : '';
  const qrImg = qrUrl
    ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}" width="120" height="120" alt="QR CUFE" />`
    : '';
  const filas = (f.pedido?.items || [])
    .map((it) => {
      const nombre = esc((it.producto?.nombre || '').toUpperCase());
      return `<tr><td class="c">${it.cantidad}×</td><td class="n">${nombre}</td><td class="p">${money(it.precioUnit * it.cantidad)}</td></tr>`;
    })
    .join('');

  // Forma(s) de pago: solo si es pago mixto se muestra el detalle por linea; la forma de pago simple ya va bajo el TOTAL.
  const pagoHtml = (f.metodoPago || '').includes(' + ')
    ? f.metodoPago.split(' + ').map((part) => {
        const i = part.indexOf('$');
        const label = (i >= 0 ? part.slice(0, i) : part).trim();
        const amount = i >= 0 ? part.slice(i).trim() : '';
        return `<div class="tot"><span>${label}</span><span>${amount}</span></div>`;
      }).join('')
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura ${numeroDian(f)}</title>
  <style>
    ${estiloPagina(await formatoDe(campoFormato))}
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; font-size: 12px; padding: 3mm 4mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .logo { display: block; width: 28mm; max-width: 55%; margin: 0 auto 2px; }
    .marca { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 2px; margin-top: 0; }
    .marca.venta { font-size: 14px; letter-spacing: 0; overflow-wrap: anywhere; }
    .sub { text-align: center; font-size: 10px; color: #333; margin-bottom: 2px; }
    .hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .meta { font-size: 11px; text-align: center; line-height: 1.4; }
    .meta b { font-weight: 700; }
    .info { font-size: 11px; text-align: left; line-height: 1.45; }
    .info div { margin: 1px 0; }
    .info b { font-weight: 700; }
    .doc { text-align: left; font-weight: 800; font-size: 11px; letter-spacing: .5px; margin: 4px 0; }
    .legal { font-size: 8px; text-align: left; line-height: 1.35; margin-top: 4px; word-break: break-all; }
    .legal .legal-tit { text-align: center; font-weight: 800; font-size: 9px; margin-bottom: 2px; }
    .legal div { margin: 1px 0; }
    .legal .legal-c { text-align: center; margin: 6px 0; }
    .legal .legal-b { text-align: left; margin-top: 3px; }
    .legal .legal-qr { text-align: center; margin: 6px 0; }
    .fpago { font-weight: 400; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #444; text-align: left; border-bottom: 1px dashed #000; padding-bottom: 2px; }
    thead th.p { text-align: right; }
    td { padding: 3px 0; vertical-align: top; font-size: 12px; }
    td.c { width: 24px; font-weight: 700; }
    td.n { text-transform: uppercase; line-height: 1.15; }
    td.p { text-align: right; white-space: nowrap; font-weight: 700; }
    .tot { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
    .tot.grand { font-weight: 900; font-size: 16px; border-top: 1px dashed #000; margin-top: 4px; padding-top: 6px; }
    .pie { text-align: center; margin-top: 10px; font-size: 10px; color: #333; }
    .pie .big { font-size: 12px; font-weight: 700; color: #000; }
  </style></head><body>
    ${esElectronica ? `<img class="logo" src="${LOGO_RECIBO}" alt="Asados Santacruz">` : ''}
    <div class="marca${esElectronica ? '' : ' venta'}">${esc(nombreEmisor)}</div>
    ${esElectronica ? `
      ${empresaRecibo?.nit ? `<div class="sub">NIT ${esc(empresaRecibo.nit)}</div>` : ''}
      <div class="sub">${esc(empresaRecibo?.direccion || 'KM 3 VIA ORIENTAL')}</div>
      <div class="sub">${esc(empresaRecibo?.ciudad || 'Malambo - Atlántico')}</div>
      <div class="sub">Cel ${esc(empresaRecibo?.telefono || '3005682955')}</div>
    ` : `
      <div class="sub">NIT 1045679622</div>
      <div class="sub">Centro Comercial Muelle del Río, local C 07</div>
      <div class="sub">Calle 118 # 42B-185 Barranquilla</div>
    `}
    <hr class="hr" />
    <div class="info">
      <div><b>Caja:</b> ${esc(f.apertura?.caja?.nombre || '1')}</div>
      <div><b>Cajero:</b> ${esc((f.usuario?.nombre || '').toUpperCase())}</div>
      <div><b>Fecha:</b> ${fechaDia} &nbsp; <b>Hora:</b> ${horaDia}</div>
    </div>
    <div class="doc">${esElectronica ? 'FACTURA ELECTRÓNICA DE VENTA' : 'FACTURA DE VENTA'} ${esc(numeroDian(f))}</div>
    <div class="info">
      <div><b>Vendedor:</b> ${esc((f.pedido?.mesera?.nombre || '').toUpperCase())}</div>
      <div><b>Condición de Pago:</b> ${esc(condPago)}</div>
      <div><b>Cliente:</b> ${esc(nombreCli)}</div>
      <div><b>Nit/C.C.:</b> ${esc(docCli)}</div>
      ${cli?.direccion ? `<div><b>Dirección:</b> ${esc(cli.direccion.toUpperCase())}</div>` : ''}
      ${cli?.telefono ? `<div><b>Teléfono:</b> ${esc(cli.telefono)}</div>` : ''}
      ${cli?.email ? `<div><b>Correo:</b> ${esc(cli.email)}</div>` : ''}
    </div>
    <hr class="hr" />
    <table>
      <thead><tr><th class="c">Cant</th><th class="n">Producto</th><th class="p">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <hr class="hr" />
    <div class="tot"><span>Subtotal</span><span>${money(f.subtotal)}</span></div>
    <div class="tot"><span>Impuesto (${f.impuestoPct}%)</span><span>${money(f.impuesto)}</span></div>
    <div class="tot grand"><span>TOTAL</span><span>${money(f.total)}</span></div>
    <hr class="hr" />
    <div class="tot fpago"><span>Forma de pago:</span><span>${esc(condPago)}</span></div>
    ${(!f.credito && f.metodoPago && !f.metodoPago.includes(' + '))
      ? `<div class="tot"><span>Medio de pago:</span><span>${esc(f.metodoPago)}</span></div>`
      : ''}
    ${f.propina
      ? `<div class="tot"><span>Propina</span><span>${money(f.propina)}</span></div>
         <div class="tot grand"><span>TOTAL A PAGAR</span><span>${money(f.total + f.propina)}</span></div>`
      : ''}
    ${((f.notasCredito?.length || f.notasDebito?.length || f.retenciones?.length)
      ? `<hr class="hr" />` +
        (f.notasCredito || []).map((n) => `<div class="tot"><span>${esc(n.numeroNota || 'NC')}${n.estadoDIAN ? ` · ${esc(n.estadoDIAN)}` : ''}</span><span>-${money(n.total || 0)}</span></div>`).join('') +
        (f.notasDebito || []).map((n) => `<div class="tot"><span>${esc(n.numeroNota || 'ND')}${n.estadoDIAN ? ` · ${esc(n.estadoDIAN)}` : ''}</span><span>+${money(n.total || 0)}</span></div>`).join('') +
        (f.retenciones || []).map((r) => `<div class="tot"><span>${esc(r.tipo || 'RET')}${r.porcentaje != null ? ` · ${r.porcentaje}%` : ''}</span><span>-${money(r.valor || 0)}</span></div>`).join('') +
        `<div class="tot grand"><span>NETO</span><span>${money(
          f.total
          + (f.notasDebito || []).reduce((s, n) => s + (n.total || 0), 0)
          - (f.notasCredito || []).reduce((s, n) => s + (n.total || 0), 0)
          - (f.retenciones || []).reduce((s, r) => s + (r.valor || 0), 0)
        )}</span></div>`
      : '')}
    ${esElectronica ? `<hr class="hr" />
    <div class="legal">
      <div class="legal-tit">AUTORIZACIÓN NUMERACIÓN DE FACTURACIÓN</div>
      <div>Numero: ${esc(auth.numero)}</div>
      <div>Numeracion: ${esc(auth.estado)}</div>
      <div>Rango: desde ${esc(auth.rangoDesde)} hasta ${esc(auth.rangoHasta)}</div>
      <div>Vigencia: desde ${esc(auth.vigDesde)} hasta ${esc(auth.vigHasta)}${auth.vigMeses ? ` - ${esc(auth.vigMeses)}` : ''}</div>
      <div class="legal-c">
        <div style="text-align:left">Elaborado. ${esc(auth.elaboradoPor)}</div>
        <div>Software ${esc(auth.software)}</div>
        ${auth.fabricante ? `<div>Fabricante del Software</div><div>${esc(auth.fabricante)}</div>` : ''}
        ${auth.fabricanteNit ? `<div>NIT: ${esc(auth.fabricanteNit)}</div>` : ''}
        <div>Proveedor Tecnologico: ${esc(auth.proveedor)}</div>
        <div>NIT: ${esc(auth.proveedorNit)}</div>
      </div>
      <div class="legal-b">${qrImg ? `<div class="legal-qr">${qrImg}</div>` : ''}</div>
      <div class="legal-b"><b>CUFE:</b>${esc(cufe)}</div>
      <div class="legal-b"><b>Fecha de aceptación:</b> ${esc(fechaAceptacion)}</div>
      <div class="legal-b"><b>Firma Digital:</b>${esc(firmaDigital)}</div>
    </div>` : ''}
    ${(f.metodoPago && f.metodoPago.includes(' + ')) ? `<div class="tot"><span>Medio de pago:</span><span></span></div>` : ''}
    ${pagoHtml}
    ${efectivo && efectivo.recibido !== '' && efectivo.recibido != null
      ? `<div class="tot"><span>Recibe</span><span>${money(Number(efectivo.recibido))}</span></div>
         <div class="tot"><span>Vuelto</span><span>${money(Math.max(0, Number(efectivo.recibido) - (f.total + (f.propina || 0))))}</span></div>`
      : ''}
    <div class="pie">
      <div class="big">¡Gracias por su compra!</div>
      <div>${esc(nombreEmisor)}</div>
    </div>
  </body></html>`;

  escribirEImprimir(ventana, html);
}

// Imprime la pre-cuenta (prefactura) de un pedido con la propina sugerida del 10%
async function imprimirPrefactura(pedido) {
  if (!pedido) return;
  const ventana = abrirVentanaVacia(); // debe abrirse ya (sincrono) para que el navegador no bloquee el popup
  const fecha = new Date().toLocaleString('es-CO');
  const items = pedido.items || [];
  const filas = items
    .map((it) => {
      const nombre = (it.producto?.nombre || '').toUpperCase();
      return `<tr><td class="c">${it.cantidad}</td><td class="n">${nombre}</td><td class="vu">${money(it.precioUnit)}</td><td class="p">${money(it.precioUnit * it.cantidad)}</td></tr>`;
    })
    .join('');
  const subtotal = items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  const propina = sugPropina(subtotal);
  const total = subtotal + propina;
  const esDomi = pedido.tipo === 'DOMICILIO';
  const cliente = pedido.clienteRel?.nombre || pedido.cliente || 'Consumidor Final';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pre-cuenta</title>
  <style>
    ${estiloPagina(await formatoDe('formatoPrefactura'))}
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; font-size: 12px; padding: 3mm 4mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .logo { display: block; width: 28mm; max-width: 55%; margin: 0 auto 2px; }
    .marca { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 2px; margin-top: 0; }
    .sub { text-align: center; font-size: 10px; color: #333; margin-bottom: 2px; }
    .hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .meta { font-size: 11px; text-align: center; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #444; text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px; }
    thead th.vu, thead th.p { text-align: right; }
    td { padding: 3px 0; vertical-align: top; font-size: 11px; }
    td.c { width: 20px; font-weight: 700; }
    td.n { text-transform: uppercase; line-height: 1.15; }
    td.vu { text-align: right; white-space: nowrap; padding-left: 4px; }
    td.p { text-align: right; white-space: nowrap; font-weight: 700; padding-left: 4px; }
    .detalle-titulo { font-weight: 800; font-size: 11px; text-transform: uppercase; margin: 6px 0 2px; }
    .metodos { text-align: center; font-size: 10px; color: #333; margin-top: 6px; line-height: 1.4; }
    .tot { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
    .tot.grand { font-weight: 900; font-size: 16px; border-top: 2px solid #000; margin-top: 4px; padding-top: 6px; }
    .nota { text-align: center; font-size: 10px; color: #333; margin-top: 6px; }
    .pie { text-align: center; margin-top: 10px; font-size: 10px; color: #333; }
    .pie .big { font-size: 12px; font-weight: 700; color: #000; }
  </style></head><body>
    <img class="logo" src="${LOGO_RECIBO}" alt="Asados Santacruz">
    ${empresaRecibo?.razonSocial || empresaRecibo?.nombreComercial
      ? `<div class="marca">${esc(empresaRecibo.nombreComercial || empresaRecibo.razonSocial)}</div>`
      : ''}
    ${empresaRecibo?.nit ? `<div class="sub">NIT ${esc(empresaRecibo.nit)}</div>` : ''}
    <div class="sub">Pre-cuenta (no válida como factura)</div>
    <hr class="hr" />
    <div class="meta">
      <div>${fecha}</div>
      <div>${esDomi
        ? `Domicilio · Pedido #${pedido.id}`
        : `Mesa ${pedido.mesa?.numero ?? ''} · Mesera ${pedido.mesera?.nombre ?? ''}`}</div>
      <div>Cliente: ${esc(cliente)}</div>
    </div>
    <hr class="hr" />
    <div class="detalle-titulo">Detalle de Consumo</div>
    <table>
      <thead><tr><th class="c">Cant.</th><th class="n">Descripción</th><th class="vu">V. Unit.</th><th class="p">Total</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <hr class="hr" />
    <div class="tot"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="tot"><span>Impuesto (si aplica)</span><span>${money(0)}</span></div>
    <div class="tot"><span>Servicio Voluntario (10%)</span><span>${money(propina)}</span></div>
    <div class="tot grand"><span>TOTAL A PAGAR</span><span>${money(total)}</span></div>
    <div class="nota">Esta es una precuenta informativa. Solicite su factura para efectos tributarios.</div>
    <div class="metodos"><b>Métodos de pago:</b> Efectivo • Tarjeta Débito • Tarjeta Crédito • Transferencia • QR</div>
    <div class="pie">
      <div class="big">¡Gracias por su visita!</div>
      <div>${esc(empresaRecibo?.nombreComercial || empresaRecibo?.razonSocial || '')}</div>
    </div>
  </body></html>`;

  escribirEImprimir(ventana, html);
}

// (solo el efectivo genera vuelto). En pago mixto se digita el valor de la otra
// forma (tarjeta/transferencia): debe ser > 0 y < total; el efectivo es el resto.
export function pagoOk(mixto, valorSimple, monto2, total) {
  if (mixto) {
    const m = Number(monto2);
    return monto2 !== '' && m > 0 && m < total;
  }
  const r = Number(valorSimple);
  return valorSimple !== '' && r >= total;
}

// Etiqueta de la forma de pago que se guarda en la factura.
export function labelPago(mixto, metodoSimple, metodo2, monto2, total) {
  if (mixto) {
    const m = Number(monto2) || 0;
    return `EFECTIVO ${money(Math.max(0, total - m))} + ${metodo2} ${money(m)}`;
  }
  return metodoSimple;
}

// Tipos de documento (DIAN) para el alta rápida de clientes.
const TIPOS_DOC = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'CDV', label: 'Cédula DV' },
  { value: 'IE', label: 'Definido para información exógena' },
  { value: 'NIT', label: 'Número de identificación tributaria (NIT)' },
  { value: 'OT', label: 'Otros' },
  { value: 'PPT', label: 'Permiso de protección temporal' },
  { value: 'TI', label: 'Tarjeta de identidad' },
];

// Selector de cliente con búsqueda. Muestra "Consumidor Final" por defecto.
// Permite crear un cliente nuevo desde una ventana flotante cuando no existe.
function ClientePicker({ clientes, value, onChange, onCreated }) {
  const notify = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const nuevoVacio = {
    tipoDocumento: 'CC',
    numeroDocumento: '',
    persona: 'NATURAL',
    razonSocial: '',
    primerNombre: '',
    segundoNombre: '',
    primerApellido: '',
    segundoApellido: '',
    direccion: '',
    barrio: '',
    telefono: '',
    email: '',
  };
  const [nuevo, setNuevo] = useState(nuevoVacio);

  const sel = clientes.find((c) => String(c.id) === String(value));
  const filtro = q.trim().toLowerCase();
  const lista = filtro
    ? clientes.filter(
        (c) =>
          c.nombre.toLowerCase().includes(filtro) ||
          (c.documento || '').toLowerCase().includes(filtro)
      )
    : clientes;

  const etiqueta = sel ? `${sel.nombre}${sel.documento ? ` · ${sel.documento}` : ''}` : 'Consumidor Final';

  // Abre la ventana flotante tomando como documento lo escrito en la búsqueda.
  const abrirCrear = () => {
    setNuevo({ ...nuevoVacio, numeroDocumento: q.trim().toUpperCase() });
    setCreando(true);
  };

  const guardarNuevo = async (e) => {
    e.preventDefault();
    const esJuridica = nuevo.persona === 'JURIDICA';
    const nombres = [nuevo.primerNombre, nuevo.segundoNombre].map((s) => s.trim()).filter(Boolean).join(' ');
    const apellidos = [nuevo.primerApellido, nuevo.segundoApellido].map((s) => s.trim()).filter(Boolean).join(' ');
    if (esJuridica && !nuevo.razonSocial.trim()) return notify('Indica la razón social', 'err');
    if (!esJuridica && !nombres && !apellidos) return notify('Indica nombres y apellidos', 'err');
    if (nuevo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo.email.trim())) return notify('Correo inválido', 'err');
    setGuardando(true);
    try {
      const creado = await api.post('/clientes', {
        tipoDocumento: nuevo.tipoDocumento,
        numeroDocumento: nuevo.numeroDocumento.trim() || undefined,
        documento: nuevo.numeroDocumento.trim() || undefined,
        razonSocial: esJuridica ? nuevo.razonSocial.trim() : undefined,
        nombres: esJuridica ? undefined : nombres,
        apellidos: esJuridica ? undefined : apellidos,
        direccion: nuevo.direccion.trim() || undefined,
        barrio: nuevo.barrio.trim() || undefined,
        telefono: nuevo.telefono.trim() || undefined,
        email: nuevo.email.trim() || undefined,
      });
      notify('Cliente creado');
      if (onCreated) await onCreated();
      onChange(String(creado.id));
      setCreando(false);
      setOpen(false);
      setQ('');
      setNuevo(nuevoVacio);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="cliente-picker">
      <button type="button" className="cliente-picker-btn" onClick={() => setOpen((o) => !o)}>
        <span className="cliente-picker-txt">{etiqueta}</span>
        <span className="nav-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="cliente-picker-pop">
            <input
              autoFocus
              className="cliente-picker-search"
              placeholder="Buscar por nombre o documento…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              {lista.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cliente-picker-item ${String(c.id) === String(value) ? 'activo' : ''}`}
                  onClick={() => { onChange(String(c.id)); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                  {c.documento && <span className="mini"> · {c.documento}</span>}
                </button>
              ))}
              {lista.length === 0 && <div className="empty" style={{ padding: 10 }}>Sin resultados</div>}
            </div>
            {q.trim().length >= 6 ? (
              <button type="button" className="cliente-picker-crear" onClick={abrirCrear}>
                <Icon name="add" size={15} /> Crear cliente
              </button>
            ) : (
              <div className="mini" style={{ padding: '8px 4px 2px', textAlign: 'center', opacity: .7 }}>
                Escribe al menos 6 caracteres para crear un cliente
              </div>
            )}
          </div>
        </>
      )}

      {creando && (
        <div className="modal-overlay" {...overlayCierre(() => !guardando && setCreando(false))}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="add" size={18} /> Nuevo cliente
              </h3>
              <button className="btn btn-sm" title="Cerrar" onClick={() => setCreando(false)}><Icon name="close" size={18} /></button>
            </div>
            <form onSubmit={guardarNuevo}>
              <div className="grid form-2col" style={{ gap: 12 }}>
                <div className="field">
                  <label>NIT o Cédula</label>
                  <input
                    value={nuevo.numeroDocumento}
                    onChange={(e) => setNuevo({ ...nuevo, numeroDocumento: e.target.value.toUpperCase() })}
                    style={{ textTransform: 'uppercase' }}
                    placeholder="Documento"
                  />
                </div>
                <div className="field">
                  <label>Tipo de ID</label>
                  <select value={nuevo.tipoDocumento} onChange={(e) => setNuevo({ ...nuevo, tipoDocumento: e.target.value })}>
                    {TIPOS_DOC.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginTop: 4 }}>
                <label>Tipo de persona</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                    <input type="radio" name="persona" checked={nuevo.persona === 'NATURAL'} onChange={() => setNuevo({ ...nuevo, persona: 'NATURAL' })} />
                    Persona natural
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                    <input type="radio" name="persona" checked={nuevo.persona === 'JURIDICA'} onChange={() => setNuevo({ ...nuevo, persona: 'JURIDICA' })} />
                    Persona jurídica
                  </label>
                </div>
              </div>

              {nuevo.persona === 'JURIDICA' ? (
                <div className="field">
                  <label>Razón social</label>
                  <input value={nuevo.razonSocial} onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Razón social" />
                </div>
              ) : (
                <>
                  <div className="grid form-2col" style={{ gap: 12 }}>
                    <div className="field">
                      <label>Primer nombre</label>
                      <input value={nuevo.primerNombre} onChange={(e) => setNuevo({ ...nuevo, primerNombre: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Primer nombre" />
                    </div>
                    <div className="field">
                      <label>Segundo nombre</label>
                      <input value={nuevo.segundoNombre} onChange={(e) => setNuevo({ ...nuevo, segundoNombre: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Segundo nombre" />
                    </div>
                  </div>
                  <div className="grid form-2col" style={{ gap: 12 }}>
                    <div className="field">
                      <label>Primer apellido</label>
                      <input value={nuevo.primerApellido} onChange={(e) => setNuevo({ ...nuevo, primerApellido: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Primer apellido" />
                    </div>
                    <div className="field">
                      <label>Segundo apellido</label>
                      <input value={nuevo.segundoApellido} onChange={(e) => setNuevo({ ...nuevo, segundoApellido: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Segundo apellido" />
                    </div>
                  </div>
                </>
              )}

              <div className="grid form-2col" style={{ gap: 12 }}>
                <div className="field">
                  <label>Dirección</label>
                  <input value={nuevo.direccion} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Dirección" />
                </div>
                <div className="field">
                  <label>Barrio</label>
                  <input value={nuevo.barrio} onChange={(e) => setNuevo({ ...nuevo, barrio: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="Barrio" />
                </div>
              </div>
              <div className="grid form-2col" style={{ gap: 12 }}>
                <div className="field">
                  <label>Correo (factura electrónica)</label>
                  <input type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} placeholder="CORREO@DOMINIO.COM" />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="Teléfono" />
                </div>
              </div>

              <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => setCreando(false)} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Facturas({ electronica = true }) {
  const claseDocumento = electronica ? 'FACTURA ELECTRONICA DE VENTA' : 'FACTURA DE VENTA (NO ELECTRONICA)';
  const formatoRecibo = electronica ? 'formatoFactura' : 'formatoFacturaVenta';
  const claveCongeladas = electronica ? 'easypos_congeladas' : 'easypos_congeladas_venta';
  const [facturas, setFacturas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [pagos, setPagos] = useState({}); // metodo de pago por pedidoId
  const [recibido, setRecibido] = useState({}); // efectivo recibido por pedidoId
  const [mixto, setMixto] = useState({}); // pago en 2 formas por pedidoId
  const [pago2, setPago2] = useState({}); // segunda forma de pago por pedidoId
  const [pago2Monto, setPago2Monto] = useState({}); // valor de la segunda forma por pedidoId
  const [propinas, setPropinas] = useState({}); // propina por pedidoId (undefined = sugerir 10%)
  const [propinaOn, setPropinaOn] = useState({}); // ¿se cobra propina? por pedidoId (undefined = sí)
  const [cobrando, setCobrando] = useState(null); // pedido en proceso de cobro (abre el modal POS)
  const [sel, setSel] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clientesSel, setClientesSel] = useState({}); // clienteId por pedidoId (mesa)
  const [directaAbierta, setDirectaAbierta] = useState(false);
  const [carrito, setCarrito] = useState([]); // items de la venta directa
  const [pagoDirecta, setPagoDirecta] = useState('EFECTIVO');
  const [cliente, setCliente] = useState(''); // clienteId seleccionado en venta directa
  const [pagoRecibidoDirecta, setPagoRecibidoDirecta] = useState(''); // efectivo recibido en venta directa
  const [mixtoDirecta, setMixtoDirecta] = useState(false); // pago en 2 formas en venta directa
  const [pago2Directa, setPago2Directa] = useState('TARJETA'); // segunda forma de pago en venta directa
  const [pago2MontoDirecta, setPago2MontoDirecta] = useState(''); // valor de la segunda forma en venta directa
  const [propinaDirecta, setPropinaDirecta] = useState(''); // propina en venta directa ('' = sugerir 10%)
  const [facturandoDirecta, setFacturandoDirecta] = useState(false);
  const [congeladas, setCongeladas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(claveCongeladas) || '[]'); } catch { return []; }
  });
  const [apertura, setApertura] = useState(null); // caja abierta actual (null = cerrada)
  const [tipoFactura, setTipoFactura] = useState(null);
  const [cerrandoCaja, setCerrandoCaja] = useState(false); // muestra el modal de cierre
  const [filtroCat, setFiltroCat] = useState(''); // categoría seleccionada en el menú directo ('' = todas)
  const [busquedaProd, setBusquedaProd] = useState(''); // buscador de producto en el menú directo
  const { user } = useAuth();
  const notify = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const puede = (codigo) => (user?.permisos || []).includes(codigo);

  const cargar = async () => {
    try {
      const [abiertos, facs, prods, clis, empresa, ap] = await Promise.all([
        electronica ? api.get('/pedidos?estado=ABIERTO') : api.get('/pedidos?estado=ABIERTO').catch(() => []),
        api.get(electronica ? '/facturas' : '/facturas?electronica=false'),
        api.get('/productos'),
        electronica ? api.get('/clientes') : api.get('/clientes').catch(() => []),
        api.get('/empresa').catch(() => null),
        api.get('/aperturas/activa').catch(() => null),
      ]);
      empresaRecibo = empresa;
      try {
        const tipos = await api.get('/tipos-documento');
        tipoFacturaRecibo = tipoDocumentoListo(tipos || [], 'FACTURA ELECTRONICA DE VENTA') || null;
        setTipoFactura(tipoDocumentoListo(tipos || [], claseDocumento) || null);
      } catch { tipoFacturaRecibo = null; setTipoFactura(null); }
      setPendientes(abiertos);
      setFacturas(facs);
      setProductos(prods.filter((p) => p.activo !== false && p.precio > 0));
      setClientes(clis);
      setApertura(ap);
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  useEffect(() => { cargar(); }, []);

  const [reenviando, setReenviando] = useState(null); // id de factura en proceso de reenvio a DIAN

  // La fecha del historial y el filtro usan siempre el dia comercial de Colombia.
  const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const hoy = diaColombia(new Date());
  const anioActual = hoy.slice(0, 4);
  const [periodoRapido, setPeriodoRapido] = useState('hoy');
  const rangoDeMes = (anio, mes) => ({
    desde: `${anio}-${String(mes).padStart(2, '0')}-01`,
    hasta: `${anio}-${String(mes).padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`,
  });
  const [filtroFecha, setFiltroFecha] = useState(() => ({ desde: hoy, hasta: hoy }));
  const aplicarRangoRapido = (valor) => {
    setPeriodoRapido(valor);
    if (valor === 'personalizado') return;
    if (valor === 'hoy') {
      setFiltroFecha({ desde: hoy, hasta: hoy });
      return;
    }
    if (valor === 'todas') {
      setFiltroFecha({ desde: '', hasta: '' });
    } else {
      // valor = "AAAA-MM" (mes elegido del año actual)
      const [anio, mes] = valor.split('-').map(Number);
      setFiltroFecha(rangoDeMes(anio, mes));
    }
  };
  const facturasFiltradas = facturas.filter((f) => {
    const d = diaColombia(f.createdAt);
    if (filtroFecha.desde && d < filtroFecha.desde) return false;
    if (filtroFecha.hasta && d > filtroFecha.hasta) return false;
    return true;
  });

  const exportarInterfaz = async () => {
    if (electronica) return;
    if (!facturasFiltradas.length) return notify('No hay facturas en el periodo seleccionado', 'err');

    const columnas = [
      'Compañía', 'Centro de operaciones', 'Tipo de documento', 'Número de documento',
      'Auxiliar de cuenta contable', 'Tercero', 'Centro de costo', 'Unidad de negocio',
      'Auxiliar de documento', 'Auxiliar de concepto', 'Valor débito', 'Valor crédito',
      'Valor base gravable', 'Tipo de documento referencia', 'Número de documento referencia',
      'Observaciones del movimiento', 'Factura de venta',
    ];
    const filas = [];
    const faltanCuentas = new Set();
    const nombresMes = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const redondearPeso = (valor) => Math.round(Math.abs(Number(valor) || 0) + Number.EPSILON);

    for (const factura of facturasFiltradas) {
      const grupos = new Map();
      for (const linea of factura.detalle || []) {
        const impuesto = linea.producto?.impuesto;
        const iva = Number(linea.iva) || 0;
        const base = (Number(linea.total) || 0) - iva;
        if (!iva && !base) continue;

        const devolucion = Number(factura.total) < 0 || base < 0 || iva < 0;
        const cuentaIva = devolucion ? impuesto?.ctaDebitoVentas : impuesto?.ctaCreditoVentas;
        const cuentaBase = devolucion ? impuesto?.cuentasBaseDevoluciones : impuesto?.cuentasBase;
        if (Math.abs(iva) > 0.005 && !cuentaIva) faltanCuentas.add(impuesto?.nombre || linea.producto?.nombre || 'impuesto sin configurar');
        if (Math.abs(base) > 0.005 && !cuentaBase) faltanCuentas.add(impuesto?.nombre || linea.producto?.nombre || 'cuenta base sin configurar');

        const llave = `${devolucion ? 'D' : 'C'}|${cuentaIva || ''}|${cuentaBase || ''}`;
        const grupo = grupos.get(llave) || { devolucion, cuentaIva, cuentaBase, iva: 0, base: 0 };
        grupo.iva += iva;
        grupo.base += base;
        grupos.set(llave, grupo);
      }

      const documentoTercero = factura.cliente?.documento || factura.cliente?.numeroDocumento || '222,222,222,222';
      const [, mes, dia] = diaColombia(factura.createdAt).split('-');
      const observacion = `VENTAS INTERFAZ ${dia} ${nombresMes[Number(mes) - 1]}`;
      const numeroFactura = numeroDian(factura);

      const esCredito = factura.credito === true || /^cr[eé]dito(?:\s+\d+\s+d[ií]as)?$/i.test(String(factura.metodoPago || '').trim());
      const totalCredito = redondearPeso(factura.total);
      if (esCredito && totalCredito > 0) {
        filas.push([
          factura.companiaCodigo || '', factura.centroOperacionCodigo || '', 'DVP', '263',
          '1305050101', documentoTercero, factura.centroOperacionCodigo || '', '001', '', '',
          Number(factura.total) < 0 ? 0 : totalCredito,
          Number(factura.total) < 0 ? totalCredito : 0,
          0, '', '', observacion, numeroFactura,
        ]);
      }

      for (const grupo of grupos.values()) {
        const iva = redondearPeso(grupo.iva);
        const base = redondearPeso(grupo.base);
        const debitoIva = grupo.devolucion ? iva : 0;
        const creditoIva = grupo.devolucion ? 0 : iva;
        const debitoBase = grupo.devolucion ? base : 0;
        const creditoBase = grupo.devolucion ? 0 : base;
        const comunes = [
          factura.companiaCodigo || '',
          factura.centroOperacionCodigo || '',
          'DVP',
          '263',
          null,
          documentoTercero,
          factura.centroOperacionCodigo || '',
          '001',
          '',
          '',
        ];

        if (iva > 0) {
          filas.push([
            ...comunes.slice(0, 4), grupo.cuentaIva || '', ...comunes.slice(5),
            debitoIva, creditoIva, base, '', '', observacion, numeroFactura,
          ]);
        }
        if (base > 0) {
          filas.push([
            ...comunes.slice(0, 4), grupo.cuentaBase || '', ...comunes.slice(5),
            debitoBase, creditoBase, 0, '', '', observacion, numeroFactura,
          ]);
        }
      }
    }

    if (faltanCuentas.size) {
      return notify(`Configura CUENTA IPOCONSUMO y CUENTA BASE para: ${[...faltanCuentas].join(', ')}`, 'err');
    }
    if (!filas.length) return notify('Las facturas seleccionadas no tienen líneas para exportar', 'err');

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Asados Santacruz';
    libro.created = new Date();
    const hoja = libro.addWorksheet('Interfaz factura venta', { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.addRow(columnas);
    filas.forEach((fila) => hoja.addRow(fila));
    hoja.autoFilter = { from: 'A1', to: `${hoja.getColumn(columnas.length).letter}1` };
    hoja.getRow(1).font = { bold: true };
    for (let fila = 2; fila <= filas.length + 1; fila++) {
      for (const columna of [11, 12, 13]) hoja.getCell(fila, columna).numFmt = '$ #,##0.00';
    }
    columnas.forEach((columna, i) => {
      const ancho = Math.max(columna.length, ...filas.map((fila) => String(fila[i] ?? '').length));
      hoja.getColumn(i + 1).width = Math.min(Math.max(ancho + 2, 12), 40);
    });

    const buffer = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `Interfaz_FacturaVenta_${filtroFecha.desde || 'todas'}_${filtroFecha.hasta || 'todas'}.xlsx`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const reenviarDian = async (f) => {
    setReenviando(f.id);
    try {
      const actualizada = await api.post(`/facturas/${f.id}/reenviar-dian`, {});
      setFacturas((fs) => fs.map((x) => (x.id === actualizada.id ? { ...x, ...actualizada } : x)));
      setSel((s) => (s && s.id === actualizada.id ? { ...s, ...actualizada } : s));
      notify(actualizada.estadoDIAN === 'ACEPTADA' ? 'Factura reportada a la DIAN' : 'La DIAN/Factus rechazó el envío, revisa los datos', actualizada.estadoDIAN === 'ACEPTADA' ? 'ok' : 'err');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setReenviando(null);
    }
  };

  // Cliente que se toma por defecto: el registrado como "Consumidor Final" (o null si no existe).
  const clienteDefault = clientes.find((c) => c.nombre.trim().toLowerCase() === 'consumidor final') || null;
  const idDefault = clienteDefault ? String(clienteDefault.id) : '';

  // Busca el cliente seleccionado. La condición crédito/contado se define en el módulo Clientes.
  const clienteDe = (id) => clientes.find((c) => String(c.id) === String(id)) || null;
  const etiquetaCredito = (cli) => `CRÉDITO${cli?.creditoDias ? ` ${cli.creditoDias} días` : ''}`;

  const fecha = (d) => new Date(d).toLocaleString('es-CO');
  const totalPedido = (p) => p.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);

  const imprimirGenerada = async (factura, efectivo, ventana) => {
    try {
      await imprimirRecibo(factura, efectivo, formatoRecibo, ventana);
      if (!ventana) notify('Factura creada. Permite ventanas emergentes o imprime desde el historial.', 'err');
    } catch (error) {
      ventana?.close();
      notify(`Factura creada, pero no se pudo imprimir: ${error.message}`, 'err');
    }
  };

  const facturar = async (pedido) => {
    if (!tipoFactura) return notify(`Configura el tipo de documento ${claseDocumento}.`, 'err');
    if (!apertura) return notify('Abre la caja antes de facturar', 'err');
    const total = totalPedido(pedido);
    const cliId = (clientesSel[pedido.id] ?? idDefault) || null;
    const cli = clienteDe(cliId);

    // Cliente a crédito: se cobra a crédito, sin exigir efectivo; valida el cupo máximo.
    if (cli?.condicionPago === 'CREDITO') {
      if (cli.creditoCupo != null && total > cli.creditoCupo) {
        return notify(`El total (${money(total)}) supera el cupo de crédito de ${cli.nombre} (${money(cli.creditoCupo)})`, 'err');
      }
      const ventana = abrirVentanaVacia();
      setProcesando(pedido.id);
      try {
        const factura = await api.post('/facturas', {
          pedidoId: pedido.id,
          electronica,
          metodoPago: etiquetaCredito(cli),
          clienteId: cliId,
          credito: true,
          creditoDias: cli.creditoDias ?? null,
        });
        notify(`Factura #${factura.id} a crédito: ${money(factura.total)}`);
        setSel({ ...factura, _recibido: null });
        setCobrando(null);
        await imprimirGenerada(factura, null, ventana);
        await cargar();
      } catch (e) {
        ventana?.close();
        notify(e.message, 'err');
      } finally {
        setProcesando(null);
      }
      return;
    }

    const metodo = pagos[pedido.id] || 'EFECTIVO';
    const esMixto = !!mixto[pedido.id];
    const recibidoVal = recibido[pedido.id] ?? '';
    const metodo2 = pago2[pedido.id] || 'TARJETA';
    const monto2 = pago2Monto[pedido.id] ?? '';
    const cobrarPropina = electronica && propinaOn[pedido.id] !== false;
    const prop = !cobrarPropina
      ? 0
      : (propinas[pedido.id] !== undefined ? Math.max(0, Number(propinas[pedido.id]) || 0) : sugPropina(total));
    const totalPagar = total + prop;
    if (esMixto) {
      if (monto2 === '' || Number(monto2) <= 0) return notify(`Digita el valor de ${metodo2.toLowerCase()}`, 'err');
      if (Number(monto2) >= total) return notify(`El valor de ${metodo2.toLowerCase()} debe ser menor al total`, 'err');
    } else {
      if (recibidoVal === '') return notify(metodo === 'EFECTIVO' ? 'Digita cuánto recibe en efectivo' : 'Digita el valor recibido', 'err');
      if (Number(recibidoVal) < totalPagar) return notify(metodo === 'EFECTIVO' ? 'El efectivo recibido no puede ser menor al total a pagar' : 'El valor no puede ser menor al total a pagar', 'err');
    }
    const ventana = abrirVentanaVacia();
    setProcesando(pedido.id);
    try {
      const factura = await api.post('/facturas', {
        pedidoId: pedido.id,
        electronica,
        metodoPago: labelPago(esMixto, metodo, metodo2, monto2, total),
        clienteId: cliId,
        propina: prop,
      });
      notify(`Factura #${factura.id} generada: ${money(factura.total)}`);
      const recFinal = !esMixto && metodo === 'EFECTIVO' ? recibidoVal : null;
      setSel({ ...factura, _recibido: recFinal });
      setCobrando(null);
      await imprimirGenerada(factura, recFinal != null ? { recibido: recFinal } : null, ventana);
      await cargar();
    } catch (e) {
      ventana?.close();
      notify(e.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  // Abre el modal POS de cobro para un pedido, precargando el método de pago del domicilio.
  const abrirCobro = (pedido) => {
    if (!tipoFactura) return notify(`Configura el tipo de documento ${claseDocumento}.`, 'err');
    if (!apertura) return notify('Abre la caja antes de facturar', 'err');
    if (pedido.tipo === 'DOMICILIO' && pedido.metodoPago && pagos[pedido.id] === undefined) {
      const m = pedido.metodoPago.toUpperCase();
      const conocido = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(m) ? m : 'EFECTIVO';
      setPagos((prev) => ({ ...prev, [pedido.id]: conocido }));
    }
    // Preselecciona el cliente registrado del domicilio para que la factura salga a su nombre
    if (pedido.clienteId && clientesSel[pedido.id] === undefined) {
      setClientesSel((prev) => ({ ...prev, [pedido.id]: pedido.clienteId }));
    }
    setCobrando(pedido);
  };

  // --- Factura directa (venta en caja para llevar) ---
  const abrirDirecta = () => {
    if (!tipoFactura) return notify(`Configura el tipo de documento ${claseDocumento}.`, 'err');
    if (!apertura) return notify('Abre la caja antes de facturar', 'err');
    setCarrito([]);
    setCliente(idDefault);
    setPagoDirecta('EFECTIVO');
    setPagoRecibidoDirecta('');
    setMixtoDirecta(false);
    setPago2Directa('TARJETA');
    setPago2MontoDirecta('');
    setPropinaDirecta('');
    setFiltroCat('');
    setBusquedaProd('');
    setDirectaAbierta(true);
  };

  // Abre la venta directa automáticamente cuando se llega con el acceso directo desde Mesas.
  useEffect(() => {
    if (location.state?.abrirDirecta) {
      abrirDirecta();
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, idDefault]);

  const agregarDirecta = (producto) => {
    if (producto.disponibles === 0) return notify(`${producto.nombre} sin inventario`, 'err');
    setCarrito((prev) => {
      const existe = prev.find((c) => c.producto.id === producto.id);
      if (existe) return prev.map((c) => (c.producto.id === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c));
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const cambiarDirecta = (id, delta) => {
    setCarrito((prev) =>
      prev
        .map((c) => (c.producto.id === id ? { ...c, cantidad: c.cantidad + delta } : c))
        .filter((c) => c.cantidad > 0)
    );
  };

  const subtotalDirecta = carrito.reduce((s, c) => s + c.producto.precio * c.cantidad, 0);

  // Categorías presentes en el menú y productos filtrados por categoría + búsqueda
  const categoriasMenu = [...new Set(productos.map((p) => p.categoria?.nombre || 'Sin categoría'))].sort();
  const productosMenu = productos.filter((p) => {
    const cat = p.categoria?.nombre || 'Sin categoría';
    const okCat = !filtroCat || cat === filtroCat;
    const okQ = !busquedaProd.trim() || p.nombre.toLowerCase().includes(busquedaProd.trim().toLowerCase());
    return okCat && okQ;
  });

  // Propina de la venta directa: sugerida al 10% mientras no se digite otra.
  const propDirecta = !electronica ? 0 : propinaDirecta !== '' ? Math.max(0, Number(propinaDirecta) || 0) : sugPropina(subtotalDirecta);
  const totalPagarDirecta = subtotalDirecta + propDirecta;

  // Condición del cliente seleccionado en la venta directa (crédito/contado según Clientes)
  const cliDirecta = clienteDe(cliente);
  const creditoDirecta = cliDirecta?.condicionPago === 'CREDITO';
  const cupoExcedidoDirecta = creditoDirecta && cliDirecta.creditoCupo != null && subtotalDirecta > cliDirecta.creditoCupo;

  // --- Ventas congeladas (se guardan sin facturar para atender a otro cliente) ---
  const guardarCongeladas = (lista) => {
    setCongeladas(lista);
    try { localStorage.setItem(claveCongeladas, JSON.stringify(lista)); } catch { /* ignorar */ }
  };

  const congelarDirecta = () => {
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    const nueva = {
      id: Date.now(),
      cliente,
      pago: pagoDirecta,
      items: carrito,
      createdAt: new Date().toISOString(),
    };
    guardarCongeladas([nueva, ...congeladas]);
    setDirectaAbierta(false);
    notify('Venta congelada');
  };

  const reanudarCongelada = (c) => {
    setCarrito(c.items);
    setCliente(c.cliente || idDefault);
    setPagoDirecta(c.pago || 'EFECTIVO');
    guardarCongeladas(congeladas.filter((x) => x.id !== c.id));
    setDirectaAbierta(true);
  };

  const eliminarCongelada = (c) => {
    if (!confirm('¿Eliminar esta venta congelada?')) return;
    guardarCongeladas(congeladas.filter((x) => x.id !== c.id));
  };

  const facturarDirecta = async () => {
    if (!tipoFactura) return notify(`Configura el tipo de documento ${claseDocumento}.`, 'err');
    if (!apertura) return notify('Abre la caja antes de facturar', 'err');
    if (carrito.length === 0) return notify('Agrega al menos un producto', 'err');
    const cli = clienteDe(cliente);

    // Cliente a crédito: se factura a crédito, sin exigir efectivo; valida el cupo máximo.
    if (cli?.condicionPago === 'CREDITO') {
      if (cli.creditoCupo != null && subtotalDirecta > cli.creditoCupo) {
        return notify(`El total (${money(subtotalDirecta)}) supera el cupo de crédito de ${cli.nombre} (${money(cli.creditoCupo)})`, 'err');
      }
      const ventana = abrirVentanaVacia();
      setFacturandoDirecta(true);
      try {
        const factura = await api.post('/facturas/directa', {
          items: carrito.map((c) => ({ productoId: c.producto.id, cantidad: c.cantidad })),
          electronica,
          metodoPago: etiquetaCredito(cli),
          clienteId: cliente || null,
          credito: true,
          creditoDias: cli.creditoDias ?? null,
        });
        notify(`Factura #${factura.id} a crédito: ${money(factura.total)}`);
        setSel({ ...factura, _recibido: null });
        setDirectaAbierta(false);
        await imprimirGenerada(factura, null, ventana);
        await cargar();
      } catch (e) {
        ventana?.close();
        notify(e.message, 'err');
      } finally {
        setFacturandoDirecta(false);
      }
      return;
    }

    if (mixtoDirecta) {
      if (pago2MontoDirecta === '' || Number(pago2MontoDirecta) <= 0) return notify(`Digita el valor de ${pago2Directa.toLowerCase()}`, 'err');
      if (Number(pago2MontoDirecta) >= subtotalDirecta) return notify(`El valor de ${pago2Directa.toLowerCase()} debe ser menor al total`, 'err');
    } else if (pagoDirecta === 'EFECTIVO') {
      if (pagoRecibidoDirecta === '') return notify('Digita cuánto recibe en efectivo', 'err');
      if (Number(pagoRecibidoDirecta) < totalPagarDirecta) return notify('El efectivo recibido no puede ser menor al total a pagar', 'err');
    } else {
      if (pagoRecibidoDirecta === '') return notify('Digita el valor recibido', 'err');
      if (Number(pagoRecibidoDirecta) < totalPagarDirecta) return notify('El valor no puede ser menor al total a pagar', 'err');
    }
    const ventana = abrirVentanaVacia();
    setFacturandoDirecta(true);
    try {
      const factura = await api.post('/facturas/directa', {
        items: carrito.map((c) => ({ productoId: c.producto.id, cantidad: c.cantidad })),
        electronica,
        metodoPago: labelPago(mixtoDirecta, pagoDirecta, pago2Directa, pago2MontoDirecta, subtotalDirecta),
        clienteId: (cliente ?? idDefault) || null,
        propina: propDirecta,
      });
      notify(`Factura #${factura.id} generada: ${money(factura.total)}`);
      const recDirecta = !mixtoDirecta && pagoDirecta === 'EFECTIVO' ? pagoRecibidoDirecta : null;
      setSel({ ...factura, _recibido: recDirecta });
      setDirectaAbierta(false);
      await imprimirGenerada(factura, recDirecta != null ? { recibido: recDirecta } : null, ventana);
      await cargar();
    } catch (e) {
      ventana?.close();
      notify(e.message, 'err');
    } finally {
      setFacturandoDirecta(false);
    }
  };

  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>{electronica ? 'Facturación' : 'Factura de venta'}</h1>
          <p className="subtitle">Cobra los pedidos abiertos y consulta el historial de ventas.</p>
        </div>
        <button className="btn btn-primary" disabled={!tipoFactura} title={tipoFactura ? 'Factura directa' : `Configura el tipo de documento ${claseDocumento}`} onClick={abrirDirecta}><Icon name="cart" size={16} /> Factura directa</button>
      </div>
      {!tipoFactura && <p className="mini" role="alert">Configura el tipo de documento {claseDocumento} y su rango antes de facturar.</p>}

      {/* Caja: para facturar debe haber una apertura con base (para dar vueltos) */}
      {apertura ? (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--green)' }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Icon name="cash" size={16} /> <b>Caja abierta</b>{apertura.caja?.nombre ? ` · ${apertura.caja.nombre}` : ''} — base <b>{money(apertura.valorInicial)}</b>
              <span className="mini" style={{ marginLeft: 8 }}>desde {fecha(apertura.fechaApertura)}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => navigate('/caja')}>Ir a Caja</button>
              {puede('caja.cerrar') && (
                <button className="btn btn-sm btn-primary" onClick={() => setCerrandoCaja(true)}>Cerrar caja</button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="lock" size={18} /> Caja cerrada</h3>
              <p className="subtitle" style={{ margin: '4px 0 0' }}>
                El primer paso del cajero es abrir la caja. Ve al módulo <b>Caja</b> y registra la base con la que inicias.
              </p>
            </div>
            {puede('caja.abrir')
              ? <button className="btn btn-primary" onClick={() => navigate('/caja')}><Icon name="cash" size={16} /> Ir a Caja para abrir</button>
              : <span className="login-error" style={{ margin: 0 }}>Pide a un cajero o administrador que abra la caja.</span>}
          </div>
        </div>
      )}

      {/* Modal de cierre de caja con cuadre */}
      {cerrandoCaja && apertura && (
        <CierreCajaModal
          apertura={apertura}
          onClose={() => setCerrandoCaja(false)}
          onCerrada={() => { setCerrandoCaja(false); setApertura(null); cargar(); }}
        />
      )}

      {/* Ventas congeladas (en espera de pago) */}
      {congeladas.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="freeze" size={18} /> Ventas congeladas ({congeladas.length})</h3>
          <div className="cards-grid">
            {congeladas.map((c) => {
              const total = c.items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
              const nombreCli = clientes.find((x) => String(x.id) === String(c.cliente))?.nombre || 'Consumidor Final';
              return (
                <div key={c.id} className="card" style={{ background: 'var(--panel-2)' }}>
                  <div className="row between">
                    <div style={{ fontWeight: 700 }}>{nombreCli}</div>
                    <span className="badge blue">{money(total)}</span>
                  </div>
                  <div className="mini" style={{ margin: '4px 0 8px' }}>{fecha(c.createdAt)}</div>
                  <div style={{ marginBottom: 10 }}>
                    {c.items.map((it) => (
                      <div key={it.producto.id} className="mini" style={{ textTransform: 'uppercase' }}>
                        {it.cantidad}× {it.producto.nombre}
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => reanudarCongelada(c)}>
                      Reanudar
                    </button>
                    <button className="btn btn-red btn-sm" title="Quitar" onClick={() => eliminarCongelada(c)}><Icon name="close" size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pedidos por facturar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Por facturar ({pendientes.length})</h3>
        {pendientes.length === 0 ? (
          <p className="empty">No hay pedidos abiertos.</p>
        ) : (
          <div className="cards-grid" style={{ alignItems: 'stretch' }}>
            {pendientes.map((p) => {
              const totalP = totalPedido(p);
              const esDomi = p.tipo === 'DOMICILIO';
              const nombreCli = p.clienteRel?.nombre || p.cliente || 'Consumidor Final';
              // Sin cliente asociado se muestra el NIT estándar DIAN del consumidor final.
              const cedulaCli = p.clienteRel?.documento || clienteDefault?.documento || '222222222222';
              const metodoDomi = (p.metodoPago || 'Efectivo');
              return (
              <div key={p.id} className="factura-card">
                {/* 1. Tipo de pedido / trazabilidad */}
                <div className="fc-trace">
                  {esDomi ? (
                    <>
                      <div><span className="fc-k">Entrada del día</span><strong>#{String(p.consecutivoDia || 0).padStart(3, '0')}</strong></div>
                      <div><span className="fc-k">N° Pedido</span><strong>#{p.id}</strong></div>
                    </>
                  ) : (
                    <>
                      <div><span className="fc-k">Mesa</span><strong>N° {p.mesa?.numero ?? '—'}</strong></div>
                      <div><span className="fc-k">Mesera</span><strong>{p.mesera?.nombre || '—'}</strong></div>
                    </>
                  )}
                </div>

                {/* 2. Información del cliente */}
                <div className="fc-sec">
                  <div className="fc-sec-title">Cliente</div>
                  <div className="fc-cli">{nombreCli}</div>
                  <div className="mini">CC/NIT: {cedulaCli || '—'}</div>
                  {esDomi && (p.clienteRel?.telefono || p.clienteRel?.direccion) && (
                    <div className="mini">{[p.clienteRel?.telefono, p.clienteRel?.direccion, p.clienteRel?.barrio].filter(Boolean).join(' · ')}</div>
                  )}
                </div>

                {/* 3. Detalle del pedido */}
                <div className="fc-sec fc-detalle">
                  <div className="fc-sec-title">Detalle del pedido</div>
                  {p.items.map((it) => (
                    <div key={it.id} className="fc-item">
                      <span className="fc-item-cant">{it.cantidad}×</span>
                      <span className="fc-item-nom">{it.producto?.nombre}</span>
                      <span className="fc-item-val">{money(it.precioUnit * it.cantidad)}</span>
                    </div>
                  ))}
                  {p.editado && (
                    <div className="fc-editado">
                      <span className="badge orange">EDITADO</span>
                      {p.cambios && <pre className="cambios-log">{p.cambios}</pre>}
                    </div>
                  )}
                </div>

                {/* 4. Método de pago */}
                <div className="fc-sec">
                  <div className="fc-sec-title">Método de pago</div>
                  <div className="fc-metodo">
                    <Icon name={esDomi && /TARJETA/i.test(metodoDomi) ? 'card' : 'cash'} size={15} />
                    {esDomi ? metodoDomi : 'Se define al cobrar'}
                  </div>
                </div>

                {/* Footer fijo */}
                <div className="fc-foot">
                  <div className="total-line grand"><span>Total</span><span>{money(totalP)}</span></div>
                  <div className="fc-acciones">
                    <button className="btn btn-green" onClick={() => imprimirPrefactura(p)}>
                      <Icon name="receipt" size={16} /> Prefactura
                    </button>
                    <button className="btn btn-primary" onClick={() => abrirCobro(p)}>
                      <Icon name="cash" size={17} /> Facturar
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal POS de cobro */}
      {cobrando && (() => {
        const p = cobrando;
        const esDomi = p.tipo === 'DOMICILIO';
        const totalP = totalPedido(p);
        const cliCred = clienteDe(clientesSel[p.id] ?? idDefault);
        const credito = cliCred?.condicionPago === 'CREDITO';
        const cupoExcedido = credito && cliCred.creditoCupo != null && totalP > cliCred.creditoCupo;
        const cobrarPropina = electronica && propinaOn[p.id] !== false;
        const propP = !cobrarPropina
          ? 0
          : (propinas[p.id] !== undefined ? Math.max(0, Number(propinas[p.id]) || 0) : sugPropina(totalP));
        const totalPagarP = totalP + propP;
        const nombreCli = p.clienteRel?.nombre || p.cliente || 'Consumidor Final';
        return (
          <div className="modal-overlay" {...overlayCierre(() => setCobrando(null))}>
            <div className="modal cobro-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="cash" size={20} /> Cobrar {esDomi
                    ? `Domicilio · Entrada #${String(p.consecutivoDia || 0).padStart(3, '0')}`
                    : `Mesa ${p.mesa?.numero}`}
                </h3>
                <button className="btn btn-sm" title="Cerrar" onClick={() => setCobrando(null)}><Icon name="close" size={18} /></button>
              </div>

              <div className="cobro-grid">
                {/* Resumen del pedido */}
                <div className="cobro-resumen">
                  <div className="fc-sec-title">Pedido</div>
                  <div className="mini" style={{ marginBottom: 6 }}>
                    {esDomi ? `Pedido #${p.id}` : `Mesera ${p.mesera?.nombre || '—'}`}
                  </div>
                  <div className="fc-cli">{nombreCli}</div>
                  <div className="cobro-items">
                    {p.items.map((it) => (
                      <div key={it.id} className="fc-item">
                        <span className="fc-item-cant">{it.cantidad}×</span>
                        <span className="fc-item-nom">{it.producto?.nombre}</span>
                        <span className="fc-item-val">{money(it.precioUnit * it.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="total-line"><span>Subtotal</span><span>{money(totalP)}</span></div>
                  {propP > 0 && <div className="total-line"><span>Propina</span><span>{money(propP)}</span></div>}
                  <div className="total-line grand"><span>Total a pagar</span><span>{money(totalPagarP)}</span></div>
                </div>

                {/* Panel de pago POS */}
                <div className="cobro-pago">
                  <div className="field">
                    <label>Cliente</label>
                    <ClientePicker
                      clientes={clientes}
                      value={clientesSel[p.id] ?? idDefault}
                      onChange={(id) => setClientesSel({ ...clientesSel, [p.id]: id })}
                      onCreated={cargar}
                    />
                  </div>
                  {credito ? (
                    <>
                      <div className="field">
                        <span className="badge blue">
                          A CRÉDITO{cliCred.creditoDias ? ` · ${cliCred.creditoDias} días` : ''}
                        </span>
                        {cliCred.creditoCupo != null && (
                          <div className="mini" style={{ marginTop: 6 }}>Cupo máximo: {money(cliCred.creditoCupo)}</div>
                        )}
                        {cupoExcedido && (
                          <div className="mini" style={{ color: 'var(--red)', marginTop: 4 }}>
                            El total supera el cupo de crédito del cliente.
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-green cobro-btn"
                        disabled={procesando === p.id || cupoExcedido}
                        onClick={() => facturar(p)}
                      >
                        <Icon name="receipt" size={16} /> Facturar a crédito {money(totalP)}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="pago-mixto-check">
                        <input
                          type="checkbox"
                          checked={!!mixto[p.id]}
                          onChange={(e) => setMixto({ ...mixto, [p.id]: e.target.checked })}
                        />
                        Pago en 2 formas
                      </label>
                      {!mixto[p.id] ? (
                        <>
                          <div className="field">
                            <label>Método de pago</label>
                            <select
                              value={pagos[p.id] || 'EFECTIVO'}
                              onChange={(e) => setPagos({ ...pagos, [p.id]: e.target.value })}
                            >
                              <option value="EFECTIVO">Efectivo</option>
                              <option value="TARJETA">Tarjeta</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>{(pagos[p.id] || 'EFECTIVO') === 'EFECTIVO' ? 'Recibe' : 'Valor'}</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={recibido[p.id] ?? ''}
                              onChange={(e) => setRecibido({ ...recibido, [p.id]: e.target.value })}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="field">
                            <label>Otra forma</label>
                            <select
                              value={pago2[p.id] || 'TARJETA'}
                              onChange={(e) => setPago2({ ...pago2, [p.id]: e.target.value })}
                            >
                              <option value="TARJETA">Tarjeta</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Valor {(pago2[p.id] || 'TARJETA').toLowerCase()}</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={pago2Monto[p.id] ?? ''}
                              onChange={(e) => setPago2Monto({ ...pago2Monto, [p.id]: e.target.value })}
                            />
                          </div>
                          <div className="total-line grand">
                            <span>Efectivo</span>
                            <span>{money(Math.max(0, totalP - Number(pago2Monto[p.id] || 0)))}</span>
                          </div>
                        </>
                      )}
                      {electronica && <label className="pago-mixto-check">
                        <input
                          type="checkbox"
                          checked={cobrarPropina}
                          onChange={(e) => setPropinaOn({ ...propinaOn, [p.id]: e.target.checked })}
                        />
                        Cobrar propina (10% sugerido)
                      </label>}
                      {cobrarPropina && (
                        <div className="field">
                          <label>Propina</label>
                          <input
                            type="number"
                            min="0"
                            placeholder={String(sugPropina(totalP))}
                            value={propinas[p.id] ?? String(sugPropina(totalP))}
                            onChange={(e) => setPropinas({ ...propinas, [p.id]: e.target.value })}
                          />
                        </div>
                      )}
                      <div className="total-line" style={{ marginBottom: 6 }}>
                        <span>Total a pagar</span><span>{money(totalPagarP)}</span>
                      </div>
                      {!mixto[p.id] && (pagos[p.id] || 'EFECTIVO') === 'EFECTIVO' && recibido[p.id] !== undefined && recibido[p.id] !== '' && (
                        <div className="total-line grand" style={{ marginBottom: 8 }}>
                          <span>Vuelto</span>
                          <span>{money(Math.max(0, Number(recibido[p.id]) - totalPagarP))}</span>
                        </div>
                      )}
                      <button
                        className="btn btn-green cobro-btn"
                        disabled={
                          procesando === p.id ||
                          !pagoOk(!!mixto[p.id], recibido[p.id] ?? '', pago2Monto[p.id] ?? '', mixto[p.id] ? totalP : totalPagarP)
                        }
                        onClick={() => facturar(p)}
                      >
                        <Icon name="cash" size={17} /> Facturar e imprimir {money(totalPagarP)}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-2">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Historial</h3>
            {!electronica && (
              <button className="btn btn-sm" type="button" onClick={exportarInterfaz} disabled={!facturasFiltradas.length} title="Descargar interfaz contable Excel">
                <Icon name="download" size={16} /> Descargar interfaz
              </button>
            )}
          </div>
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Periodo</label>
              <select value={periodoRapido} onChange={(e) => aplicarRangoRapido(e.target.value)}>
                <option value="hoy">Hoy</option>
                {NOMBRES_MES.map((nombre, i) => (
                  <option key={nombre} value={`${anioActual}-${i + 1}`}>{nombre}</option>
                ))}
                <option value="todas">Todas</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Fecha inicial</label>
              <input type="date" value={filtroFecha.desde} onChange={(e) => { setPeriodoRapido('personalizado'); setFiltroFecha((f) => ({ ...f, desde: e.target.value })); }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Fecha final</label>
              <input type="date" value={filtroFecha.hasta} onChange={(e) => { setPeriodoRapido('personalizado'); setFiltroFecha((f) => ({ ...f, hasta: e.target.value })); }} />
            </div>
          </div>
          <div className="facturas-historial-scroll">
            <table>
              <thead>
                <tr><th>N°</th><th>Mesa</th><th>Mesera</th><th>Total</th>{electronica && <th>DIAN</th>}<th>Fecha</th></tr>
              </thead>
              <tbody>
                {facturasFiltradas.map((f) => (
                  <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setSel(f)}>
                    <td>
                      {numeroDian(f)}
                      {f.notasCredito?.length > 0 && <span className="badge orange" style={{ marginLeft: 6 }} title="Con nota crédito">NC</span>}
                      {f.notasDebito?.length > 0 && <span className="badge" style={{ marginLeft: 6 }} title="Con nota débito">ND</span>}
                      {f.retenciones?.length > 0 && <span className="badge gray" style={{ marginLeft: 6 }} title="Con retención">RET</span>}
                    </td>
                    <td>{f.pedido?.mesa?.numero ?? <span className="badge orange">Directa</span>}</td>
                    <td>{f.pedido?.mesera?.nombre ?? (f.pedido?.cliente || '—')}</td>
                    <td style={{ fontWeight: 700 }}>{money(f.total)}</td>
                    {electronica && <td>
                      {f.estadoDIAN === 'ACEPTADA' && <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>Aceptada</span>}
                      {f.estadoDIAN === 'ERROR' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-red"
                          disabled={reenviando === f.id}
                          onClick={(e) => { e.stopPropagation(); reenviarDian(f); }}
                          title="Reintentar envío a la DIAN"
                        >
                          {reenviando === f.id ? 'Enviando…' : 'Reintentar'}
                        </button>
                      )}
                      {!f.estadoDIAN && <span className="mini" style={{ color: 'var(--muted)' }}>—</span>}
                    </td>}
                    <td className="mini">{new Date(f.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
                  </tr>
                ))}
                {facturasFiltradas.length === 0 && <tr><td colSpan={electronica ? 6 : 5} className="empty">No hay facturas en el rango seleccionado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recibo</h3>
          {!sel ? (
            <p className="empty">Selecciona una factura para ver el detalle.</p>
          ) : (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                {electronica
                  ? <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo height={38} /></div>
                  : <div style={{ fontWeight: 700, marginBottom: 6 }}>CRISTIAN FABIAN SERRANO MILLAN · NIT 1045679622</div>}
                <div className="mini">Factura {numeroDian(sel)} · {fecha(sel.createdAt)}</div>
                <div className="mini">
                  {sel.pedido?.mesa?.numero != null
                    ? `Mesa ${sel.pedido.mesa.numero} · Mesera ${sel.pedido?.mesera?.nombre}`
                    : 'Venta directa'} · {sel.metodoPago}
                </div>
                <div className="mini">Cliente: {sel.pedido?.cliente || 'Consumidor Final'}</div>
                {sel.cliente?.email && <div className="mini">Correo: {sel.cliente.email}</div>}
              </div>
              {electronica && <div style={{ marginBottom: 12, textAlign: 'center' }}>
                {sel.estadoDIAN === 'ACEPTADA' && (
                  <>
                    <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>Aceptada por la DIAN</span>
                    {sel.numeroFactus && <div className="mini" style={{ marginTop: 4 }}>N° DIAN: {sel.numeroFactus}</div>}
                    {sel.cufe && <div className="mini" style={{ wordBreak: 'break-all' }}>CUFE: {sel.cufe}</div>}
                    {sel.pdfPath && (
                      <a href={sel.pdfPath} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ marginTop: 6, display: 'inline-block' }}>
                        Ver factura DIAN (PDF)
                      </a>
                    )}
                  </>
                )}
                {sel.estadoDIAN === 'ERROR' && (
                  <>
                    <span className="badge" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>Error al reportar a la DIAN</span>
                    <div>
                      <button type="button" className="btn btn-sm btn-red" style={{ marginTop: 6 }} disabled={reenviando === sel.id} onClick={() => reenviarDian(sel)}>
                        {reenviando === sel.id ? 'Enviando…' : 'Reintentar envío a DIAN'}
                      </button>
                    </div>
                  </>
                )}
              </div>}
              <table>
                <tbody>
                  {sel.pedido?.items?.map((it) => (
                    <tr key={it.id}>
                      <td style={{ textTransform: 'uppercase' }}>{it.cantidad}× {it.producto?.nombre}</td>
                      <td style={{ textAlign: 'right' }}>{money(it.precioUnit * it.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <div className="total-line"><span>Subtotal</span><span>{money(sel.subtotal)}</span></div>
                <div className="total-line"><span>Impuesto ({sel.impuestoPct}%)</span><span>{money(sel.impuesto)}</span></div>
                <div className="total-line grand"><span>Total</span><span>{money(sel.total)}</span></div>
                {sel.propina > 0 && (
                  <>
                    <div className="total-line"><span>Propina</span><span>{money(sel.propina)}</span></div>
                    <div className="total-line grand"><span>Total a pagar</span><span>{money(sel.total + sel.propina)}</span></div>
                  </>
                )}
              </div>
              {sel.notasCredito?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>Notas crédito</div>
                  {sel.notasCredito.map((n) => (
                    <div key={n.id} className="total-line">
                      <span>{n.numeroNota || 'NC'}{n.estadoDIAN ? ` · ${n.estadoDIAN}` : ''}</span>
                      <span>−{money(n.total || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {sel.notasDebito?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>Notas débito</div>
                  {sel.notasDebito.map((n) => (
                    <div key={n.id} className="total-line">
                      <span>{n.numeroNota || 'ND'}{n.estadoDIAN ? ` · ${n.estadoDIAN}` : ''}</span>
                      <span>+{money(n.total || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {sel.retenciones?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>Retenciones</div>
                  {sel.retenciones.map((r) => (
                    <div key={r.id} className="total-line">
                      <span>{r.tipo || 'RET'}{r.porcentaje != null ? ` · ${r.porcentaje}%` : ''}</span>
                      <span>−{money(r.valor || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {(sel.notasCredito?.length > 0 || sel.notasDebito?.length > 0 || sel.retenciones?.length > 0) && (
                <div className="total-line grand" style={{ marginTop: 8 }}>
                  <span>Neto</span>
                  <span>{money(
                    sel.total
                    + (sel.notasDebito?.reduce((s, n) => s + (n.total || 0), 0) || 0)
                    - (sel.notasCredito?.reduce((s, n) => s + (n.total || 0), 0) || 0)
                    - (sel.retenciones?.reduce((s, r) => s + (r.valor || 0), 0) || 0)
                  )}</span>
                </div>
              )}
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => imprimirRecibo(sel, sel._recibido != null && sel._recibido !== '' ? { recibido: sel._recibido } : null, formatoRecibo)}>
                🖨️ Imprimir
              </button>
            </div>
          )}
        </div>
      </div>

      {directaAbierta && (
        <div className="modal-overlay" {...overlayCierre(() => setDirectaAbierta(false))}>
          <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="cart" size={18} /> Factura directa (para llevar)</h3>
              <button className="btn btn-sm" title="Cerrar" onClick={() => setDirectaAbierta(false)}><Icon name="close" size={16} /></button>
            </div>

            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              {/* Menú */}
              <div className="directa-menu">
                <input
                  className="cliente-picker-search"
                  placeholder="Buscar producto…"
                  value={busquedaProd}
                  onChange={(e) => setBusquedaProd(e.target.value)}
                />
                <div className="menu-cats">
                  <button
                    type="button"
                    className={`cat-chip ${filtroCat === '' ? 'active' : ''}`}
                    onClick={() => setFiltroCat('')}
                  >
                    Todas
                  </button>
                  {categoriasMenu.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`cat-chip ${filtroCat === c ? 'active' : ''}`}
                      onClick={() => setFiltroCat(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {productosMenu.length === 0 ? (
                  <p className="empty">Sin productos.</p>
                ) : (
                  <div className="menu-grid">
                    {productosMenu.map((p) => (
                      <button
                        key={p.id}
                        className={`producto-card ${p.disponibles === 0 ? 'agotado' : ''}`}
                        onClick={() => agregarDirecta(p)}
                        disabled={p.disponibles === 0}
                      >
                        {p.foto && <img src={p.foto} alt={p.nombre} className="pc-foto" />}
                        <div className="pc-cat">{p.categoria?.nombre || 'Sin categoría'}</div>
                        <div className="pc-nombre">{p.nombre}</div>
                        <div className="pc-precio">{money(p.precio)}</div>
                        {p.disponibles != null && (
                          <div className="pc-disp">{p.disponibles === 0 ? 'Agotado' : `Stock: ${p.disponibles}`}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cuenta */}
              <div>
                <div className="field">
                  <label>Cliente</label>
                  <ClientePicker clientes={clientes} value={cliente} onChange={setCliente} onCreated={cargar} />
                </div>
                {carrito.length === 0 ? (
                  <p className="empty">Agrega productos del menú.</p>
                ) : (
                  <div style={{ maxHeight: 168, overflowY: 'auto' }}>
                  <table>
                    <tbody>
                      {carrito.map((c) => (
                        <tr key={c.producto.id}>
                          <td>
                            <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{c.producto.nombre}</div>
                            <div className="mini">{money(c.producto.precio)} c/u</div>
                          </td>
                          <td>
                            <div className="qty">
                              <button className="btn btn-sm" onClick={() => cambiarDirecta(c.producto.id, -1)}>−</button>
                              <span className="qty-num">{c.cantidad}</span>
                              <button className="btn btn-sm" onClick={() => cambiarDirecta(c.producto.id, 1)}>+</button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.producto.precio * c.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}

                <div className="total-line grand" style={{ marginTop: 12 }}>
                  <span>Subtotal</span><span>{money(subtotalDirecta)}</span>
                </div>

                <label className="pago-mixto-check" style={{ marginTop: 12, display: creditoDirecta ? 'none' : undefined }}>
                  <input
                    type="checkbox"
                    checked={mixtoDirecta}
                    onChange={(e) => setMixtoDirecta(e.target.checked)}
                  />
                  Pago en 2 formas
                </label>

                {creditoDirecta ? (
                  <div className="field" style={{ marginTop: 12 }}>
                    <span className="badge blue">
                      A CRÉDITO{cliDirecta.creditoDias ? ` · ${cliDirecta.creditoDias} días` : ''}
                    </span>
                    {cliDirecta.creditoCupo != null && (
                      <div className="mini" style={{ marginTop: 6 }}>Cupo máximo: {money(cliDirecta.creditoCupo)}</div>
                    )}
                    {cupoExcedidoDirecta && (
                      <div className="mini" style={{ color: 'var(--red)', marginTop: 4 }}>
                        El total supera el cupo de crédito del cliente.
                      </div>
                    )}
                  </div>
                ) : !mixtoDirecta ? (
                  <>
                    <div className="field">
                      <label>Método de pago</label>
                      <select value={pagoDirecta} onChange={(e) => setPagoDirecta(e.target.value)}>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>{pagoDirecta === 'EFECTIVO' ? 'Recibe' : 'Valor'}</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={pagoRecibidoDirecta}
                        onChange={(e) => setPagoRecibidoDirecta(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Otra forma</label>
                      <select value={pago2Directa} onChange={(e) => setPago2Directa(e.target.value)}>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Valor {pago2Directa.toLowerCase()}</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={pago2MontoDirecta}
                        onChange={(e) => setPago2MontoDirecta(e.target.value)}
                      />
                    </div>
                    <div className="total-line grand">
                      <span>Efectivo</span>
                      <span>{money(Math.max(0, subtotalDirecta - Number(pago2MontoDirecta || 0)))}</span>
                    </div>
                  </>
                )}

                {!creditoDirecta && electronica && (
                  <>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Propina (10% sugerido)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder={String(sugPropina(subtotalDirecta))}
                        value={propinaDirecta !== '' ? propinaDirecta : String(sugPropina(subtotalDirecta))}
                        onChange={(e) => setPropinaDirecta(e.target.value)}
                      />
                    </div>
                    {propDirecta > 0 && (
                      <div className="total-line grand">
                        <span>Total a pagar</span><span>{money(totalPagarDirecta)}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button
                    className="btn"
                    style={{ flex: 1 }}
                    disabled={carrito.length === 0}
                    onClick={congelarDirecta}
                  >
                    <Icon name="freeze" size={16} /> Congelar
                  </button>
                  <button
                    className="btn btn-green"
                    style={{ flex: 2 }}
                    disabled={
                      facturandoDirecta ||
                      carrito.length === 0 ||
                      (creditoDirecta
                        ? cupoExcedidoDirecta
                        : !pagoOk(mixtoDirecta, pagoRecibidoDirecta, pago2MontoDirecta, mixtoDirecta ? subtotalDirecta : totalPagarDirecta))
                    }
                    onClick={facturarDirecta}
                  >
                    {creditoDirecta ? <><Icon name="receipt" size={16} /> Facturar a crédito</> : <><Icon name="cash" size={16} /> Facturar e imprimir</>} {money(creditoDirecta ? subtotalDirecta : totalPagarDirecta)}
                  </button>
                </div>
                {!creditoDirecta && !mixtoDirecta && pagoDirecta === 'EFECTIVO' && pagoRecibidoDirecta !== '' && (
                  <div className="total-line grand" style={{ marginTop: 8 }}>
                    <span>Vuelto</span>
                    <span>{money(Math.max(0, Number(pagoRecibidoDirecta) - totalPagarDirecta))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
