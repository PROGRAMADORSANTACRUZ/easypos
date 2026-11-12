import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { api, money } from '../api.js';
import { diaColombia } from '../fechaComercial.js';
import { useToast } from '../App.jsx';
import { LoadingState } from '../components/ui/index.jsx';
import { fechaHoraColombia, notaMovimientos, columnasMovimientos, filaMovimiento } from '../reporteMovimientosCaja.js';

const ACCIONES_HISTORIAL = {
  CREAR: 'Pedido creado', AGREGAR_PRODUCTO: 'Producto agregado', CAMBIAR_CANTIDAD: 'Cantidad modificada',
  QUITAR_PRODUCTO: 'Producto retirado', OBSERVACIONES: 'Observaciones modificadas', REENVIAR: 'Pedido reenviado',
  CAMBIAR_MESA: 'Cambio de mesa', CANCELAR: 'Pedido cancelado',
  PLATO_LISTO: 'Plato listo en cocina', ENTREGAR: 'Entregado en mesa',
};

const ESTADOS_HISTORIAL = {
  DESPACHADO: 'Despachado', FACTURADO: 'Facturado', CANCELADO: 'Cancelado',
  EN_COCINA: 'En cocina', PENDIENTE: 'Pendiente',
};

const textoEstadoPedido = (estado) => !estado ? 'Sin estado anterior' : [
  `Mesa ${estado.mesaNumero ?? estado.mesaId ?? '-'}`, estado.estado,
  ...(estado.items || []).map((item) => `${item.cantidad} x ${item.nombre || item.productoId} (${money(item.precioUnit)})${item.notas ? `: ${item.notas}` : ''}`),
  `Observaciones: ${estado.observaciones || 'Sin observaciones'}`,
].join(' | ');

function EstadoHistorialPedido({ estado }) {
  if (!estado) return <p className="mini">Sin estado anterior.</p>;
  return (
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p className="mini">Mesa {estado.mesaNumero ?? estado.mesaId ?? '-'} · {estado.estado}</p>
      {(estado.items || []).map((item) => (
        <div key={item.id} style={{ marginBottom: 8 }}>
          <strong>{item.cantidad} × {item.nombre || item.productoId}</strong>
          <div className="mini">{money(item.precioUnit)} · {item.notas || 'Sin notas'}</div>
        </div>
      ))}
      <p className="mini">Observaciones: {estado.observaciones || 'Sin observaciones'}</p>
    </div>
  );
}

// Catálogo de reportes seleccionables
const REPORTES = [
  { id: 'totales', nombre: 'Ventas totales' },
  { id: 'dia', nombre: 'Ventas netas por día' },
  { id: 'semana', nombre: 'Ventas netas por semana' },
  { id: 'mes', nombre: 'Ventas netas por mes' },
  { id: 'prod-dia', nombre: 'Ventas por producto por día' },
  { id: 'prod-semana', nombre: 'Ventas por producto por semana' },
  { id: 'prod-mes', nombre: 'Ventas por producto por mes' },
  { id: 'categoria', nombre: 'Ventas por categoría' },
  { id: 'mesera', nombre: 'Ventas por mesera' },
  { id: 'mesa', nombre: 'Ventas por mesa' },
  { id: 'formapago', nombre: 'Ventas por forma de pago' },
  { id: 'facturas', nombre: 'Detalle de facturas' },
  { id: 'resumen-facturas-notas', nombre: 'Resumen de facturas y notas POS acumuladas' },
  { id: 'revision-diaria-pdv', nombre: 'Revisión diaria PDV' },
  { id: 'movimientos-caja', nombre: 'Movimientos de caja' },
  { id: 'gastos', nombre: 'Gastos de insumos (por producto)' },
  { id: 'insumos', nombre: 'Consumo de insumos' },
  { id: 'compras-insumo', nombre: 'Compras por insumo' },
  { id: 'pedidos-mesa', nombre: 'Pedidos por mesa' },
  { id: 'historial-pedidos', nombre: 'Historial de pedidos' },
  { id: 'cocina', nombre: 'Preparación de cocina' },
];

// Tabla simple de ventas por periodo
function TablaPeriodo({ datos, maxTotal }) {
  if (!datos?.length) return <p className="empty">Aún no hay ventas.</p>;
  return (
    <table>
      <thead><tr><th>Periodo</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
      <tbody>
        {datos.map((v) => (
          <tr key={v.clave}>
            <td>
              <div style={{ fontWeight: 600 }}>{v.clave}</div>
              <div className="barra"><span style={{ width: `${(v.total / maxTotal) * 100}%` }} /></div>
            </td>
            <td>{v.facturas}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(v.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Bloques de productos agrupados por periodo
function TablaProductos({ bloques }) {
  if (!bloques?.length) return <p className="empty">Aún no hay ventas.</p>;
  return bloques.map((bloque) => (
    <div key={bloque.clave} style={{ marginBottom: 14 }}>
      <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>{bloque.clave}</div>
      <table>
        <tbody>
          {bloque.items.map((it) => (
            <tr key={it.nombre}>
              <td style={{ textTransform: 'uppercase' }}>{it.nombre}</td>
              <td style={{ textAlign: 'center' }}>×{it.cantidad}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
}

const importeResumen = (valor) => valor == null ? 'No disponible' : money(valor);
const notasResumen = [
  'El valor bruto de las facturas corresponde al subtotal registrado; los descuentos no están registrados.',
  'Las notas se registran por su fecha y se atribuyen al cajero y caja de la factura asociada. Su total no desglosa impuesto ni propina.',
  'Se incluyen las notas registradas en todos los estados, incluso pendientes o rechazadas. Actualmente solo pueden vincularse a facturas electrónicas.',
];
const notasRevision = [
  'El valor neto es el pago aplicado a la factura, incluida la propina. No se guarda el efectivo entregado ni el cambio.',
  'Los medios históricos agrupados o sin desglose se muestran tal como están disponibles, sin repartir importes.',
  'Las facturas a crédito no incluyen la deuda no cobrada; solo se muestra la propina registrada.',
];

function agruparResumen(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const grupo = grupos.get(fila.cajeroId) || {
      cajero: fila.cajero, filas: [], bruto: 0, descuentos: null, impuestos: 0, neto: 0, propina: 0,
    };
    grupo.filas.push(fila);
    for (const campo of ['bruto', 'impuestos', 'neto', 'propina']) {
      grupo[campo] = grupo[campo] == null || fila[campo] == null
        ? null : Math.round((grupo[campo] + fila[campo]) * 100) / 100;
    }
    grupos.set(fila.cajeroId, grupo);
  }
  return [...grupos.entries()].map(([id, grupo]) => ({ id, ...grupo }));
}

function agruparRevision(filas) {
  const cajeros = new Map();
  for (const fila of filas) {
    const cajero = cajeros.get(fila.cajeroId) || { id: fila.cajeroId, nombre: fila.cajero, neto: 0, medios: new Map() };
    const medio = cajero.medios.get(fila.medioId) || { id: fila.medioId, nombre: fila.medio, neto: 0, filas: [] };
    medio.filas.push(fila);
    medio.neto = Math.round((medio.neto + fila.neto) * 100) / 100;
    cajero.neto = Math.round((cajero.neto + fila.neto) * 100) / 100;
    cajero.medios.set(fila.medioId, medio);
    cajeros.set(fila.cajeroId, cajero);
  }
  return [...cajeros.values()].map((cajero) => ({ ...cajero, medios: [...cajero.medios.values()] }));
}

export default function Reportes() {
  const [rep, setRep] = useState(null);
  const [pedidosMesa, setPedidosMesa] = useState([]);
  const [cocina, setCocina] = useState([]);
  const [searchParams] = useSearchParams();
  const sel = searchParams.get('r') || 'totales';
  const hoy = diaColombia(new Date());
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState('');
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [filtrosHistorial, setFiltrosHistorial] = useState({ desde: hoy, hasta: hoy, motivo: '' });
  const consultaHistorial = useRef(0);
  const [resumen, setResumen] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState('');
  const [filtrosResumen, setFiltrosResumen] = useState({ desde: hoy, hasta: hoy });
  const consultaResumen = useRef(0);
  const [revision, setRevision] = useState([]);
  const [cargandoRevision, setCargandoRevision] = useState(false);
  const [errorRevision, setErrorRevision] = useState('');
  const [filtrosRevision, setFiltrosRevision] = useState({ desde: hoy, hasta: hoy });
  const [centroRevision, setCentroRevision] = useState('');
  const [cajaRevision, setCajaRevision] = useState('');
  const consultaRevision = useRef(0);
  const [movimientosCaja, setMovimientosCaja] = useState([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [errorMovimientos, setErrorMovimientos] = useState('');
  const [filtrosMovimientos, setFiltrosMovimientos] = useState({ desde: hoy, hasta: hoy });
  const [cajeroMovimiento, setCajeroMovimiento] = useState('');
  const [tipoMovimiento, setTipoMovimiento] = useState('');
  const [cajaMovimiento, setCajaMovimiento] = useState('');
  const consultaMovimientos = useRef(0);
  const notify = useToast();

  const cargarMovimientos = async (inicio = desde, fin = hasta) => {
    const consulta = ++consultaMovimientos.current;
    const params = new URLSearchParams();
    if (inicio) params.set('desde', inicio);
    if (fin) params.set('hasta', fin);
    setCargandoMovimientos(true);
    setErrorMovimientos('');
    setMovimientosCaja([]);
    setCajeroMovimiento('');
    setTipoMovimiento('');
    setCajaMovimiento('');
    try {
      const datos = await api.get(`/reportes/movimientos-caja?${params}`);
      if (consulta !== consultaMovimientos.current) return;
      setMovimientosCaja(datos);
      setFiltrosMovimientos({ desde: inicio, hasta: fin });
    } catch (e) {
      if (consulta === consultaMovimientos.current) setErrorMovimientos(e.message);
    } finally {
      if (consulta === consultaMovimientos.current) setCargandoMovimientos(false);
    }
  };

  const cargarRevision = async (inicio = desde, fin = hasta) => {
    const consulta = ++consultaRevision.current;
    const params = new URLSearchParams();
    if (inicio) params.set('desde', inicio);
    if (fin) params.set('hasta', fin);
    setCargandoRevision(true);
    setErrorRevision('');
    setRevision([]);
    setCentroRevision('');
    setCajaRevision('');
    try {
      const datos = await api.get(`/reportes/revision-diaria-pdv?${params}`);
      if (consulta !== consultaRevision.current) return;
      setRevision(datos);
      setFiltrosRevision({ desde: inicio, hasta: fin });
    } catch (e) {
      if (consulta === consultaRevision.current) setErrorRevision(e.message);
    } finally {
      if (consulta === consultaRevision.current) setCargandoRevision(false);
    }
  };

  const cargarResumen = async (inicio = desde, fin = hasta) => {
    const consulta = ++consultaResumen.current;
    const params = new URLSearchParams();
    if (inicio) params.set('desde', inicio);
    if (fin) params.set('hasta', fin);
    setCargandoResumen(true);
    setErrorResumen('');
    setResumen([]);
    try {
      const datos = await api.get(`/reportes/resumen-facturas-notas?${params}`);
      if (consulta !== consultaResumen.current) return;
      setResumen(datos);
      setFiltrosResumen({ desde: inicio, hasta: fin });
    } catch (e) {
      if (consulta === consultaResumen.current) setErrorResumen(e.message);
    } finally {
      if (consulta === consultaResumen.current) setCargandoResumen(false);
    }
  };

  const cargarHistorial = async (inicio = desde, fin = hasta, razon = motivo) => {
    const consulta = ++consultaHistorial.current;
    const params = new URLSearchParams();
    if (inicio) params.set('desde', inicio);
    if (fin) params.set('hasta', fin);
    if (razon.trim()) params.set('motivo', razon.trim());
    setCargandoHistorial(true);
    setErrorHistorial('');
    setHistorial([]);
    try {
      const datos = await api.get(`/reportes/historial-pedidos?${params}`);
      if (consulta !== consultaHistorial.current) return;
      setHistorial(datos);
      setFiltrosHistorial({ desde: inicio, hasta: fin, motivo: razon.trim() });
    } catch (e) {
      if (consulta === consultaHistorial.current) setErrorHistorial(e.message);
    } finally {
      if (consulta === consultaHistorial.current) setCargandoHistorial(false);
    }
  };

  const cargar = () => {
    if (sel === 'historial-pedidos') return cargarHistorial();
    if (sel === 'resumen-facturas-notas') return cargarResumen();
    if (sel === 'revision-diaria-pdv') return cargarRevision();
    if (sel === 'movimientos-caja') return cargarMovimientos();
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    const qs = params.toString();
    api.get(`/reportes${qs ? `?${qs}` : ''}`).then(setRep).catch((e) => notify(e.message, 'err'));
    api.get(`/reportes/pedidos-mesa${qs ? `?${qs}` : ''}`).then(setPedidosMesa).catch(() => setPedidosMesa([]));
    api.get(`/reportes/cocina${qs ? `?${qs}` : ''}`).then(setCocina).catch(() => setCocina([]));
  };

  const limpiar = () => {
    setDesde(hoy);
    setHasta(hoy);
    setMotivo('');
    if (sel === 'historial-pedidos') return cargarHistorial(hoy, hoy, '');
    if (sel === 'resumen-facturas-notas') return cargarResumen(hoy, hoy);
    if (sel === 'revision-diaria-pdv') return cargarRevision(hoy, hoy);
    if (sel === 'movimientos-caja') return cargarMovimientos(hoy, hoy);
    api.get(`/reportes?desde=${hoy}&hasta=${hoy}`).then(setRep).catch((e) => notify(e.message, 'err'));
    api.get(`/reportes/pedidos-mesa?desde=${hoy}&hasta=${hoy}`).then(setPedidosMesa).catch(() => setPedidosMesa([]));
    api.get(`/reportes/cocina?desde=${hoy}&hasta=${hoy}`).then(setCocina).catch(() => setCocina([]));
  };

  useEffect(() => {
    if (['historial-pedidos', 'resumen-facturas-notas', 'revision-diaria-pdv', 'movimientos-caja'].includes(sel) || !rep) cargar();
  }, [sel]);

  const maxDia = useMemo(() => Math.max(1, ...(rep?.ventasPorDia || []).map((v) => v.total)), [rep]);
  const maxSemana = useMemo(() => Math.max(1, ...(rep?.ventasPorSemana || []).map((v) => v.total)), [rep]);
  const maxMes = useMemo(() => Math.max(1, ...(rep?.ventasPorMes || []).map((v) => v.total)), [rep]);

  if (!rep && !['historial-pedidos', 'resumen-facturas-notas', 'revision-diaria-pdv', 'movimientos-caja'].includes(sel)) return <LoadingState label="Cargando reportes…" />;
  const t = rep?.totales;
  const actual = REPORTES.find((r) => r.id === sel);
  const centrosRevision = [...new Map(revision.map((fila) => [JSON.stringify([fila.compania, fila.centro]), `${fila.compania} / ${fila.centro}`])).entries()];
  const cajasRevision = [...new Map(revision.map((fila) => [JSON.stringify(fila.cajaId), fila.caja])).entries()];
  const revisionFiltrada = revision.filter((fila) =>
    (!centroRevision || JSON.stringify([fila.compania, fila.centro]) === centroRevision)
    && (!cajaRevision || JSON.stringify(fila.cajaId) === cajaRevision));
  const cajerosMovimientos = [...new Map(movimientosCaja.map((fila) => [JSON.stringify(fila.cajeroId), fila.cajero])).entries()];
  const cajasMovimientos = [...new Map(movimientosCaja.map((fila) => [JSON.stringify(fila.cajaId), fila.caja])).entries()];
  const movimientosFiltrados = movimientosCaja.filter((fila) =>
    (!cajeroMovimiento || JSON.stringify(fila.cajeroId) === cajeroMovimiento)
    && (!cajaMovimiento || JSON.stringify(fila.cajaId) === cajaMovimiento)
    && (!tipoMovimiento || fila.tipo === tipoMovimiento));

  // Construye { columnas, filas } del reporte actual para exportar
  const datosReporte = () => {
    switch (sel) {
      case 'totales':
        return {
          columnas: ['Concepto', 'Valor'],
          filas: [
            ['Ventas totales', money(t.total)],
            ['Facturas', String(t.facturas)],
            ['Unidades vendidas', String(t.unidades)],
            ['Subtotal (neto)', money(t.subtotal)],
            ['Impuesto', money(t.impuesto)],
            ...(t.notasCredito > 0 ? [['Notas crédito', `-${money(t.notasCredito)}`]] : []),
            ...(t.notasDebito > 0 ? [['Notas débito', `+${money(t.notasDebito)}`]] : []),
            ...(t.retenciones > 0 ? [['Retenciones', `-${money(t.retenciones)}`]] : []),
            ...(t.notasCredito > 0 || t.notasDebito > 0 || t.retenciones > 0 ? [['Ventas netas', money(t.totalNeto)]] : []),
          ],
        };
      case 'dia':
      case 'semana':
      case 'mes': {
        const fuente = sel === 'dia' ? rep.ventasPorDia : sel === 'semana' ? rep.ventasPorSemana : rep.ventasPorMes;
        return {
          columnas: ['Periodo', 'Facturas', 'Total'],
          filas: (fuente || []).map((v) => [v.clave, String(v.facturas), money(v.total)]),
        };
      }
      case 'prod-dia':
      case 'prod-semana':
      case 'prod-mes': {
        const bloques = sel === 'prod-dia' ? rep.productos.dia : sel === 'prod-semana' ? rep.productos.semana : rep.productos.mes;
        const filas = [];
        (bloques || []).forEach((b) => {
          b.items.forEach((it) => filas.push([b.clave, it.nombre, String(it.cantidad), money(it.total)]));
        });
        return { columnas: ['Periodo', 'Producto', 'Cantidad', 'Total'], filas };
      }
      case 'categoria':
        return {
          columnas: ['Categoría', 'Unidades', 'Total'],
          filas: (rep.porCategoria || []).map((c) => [c.nombre, String(c.cantidad), money(c.total)]),
        };
      case 'mesera':
        return {
          columnas: ['Mesera', 'Facturas', 'Total'],
          filas: (rep.porMesera || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'mesa':
        return {
          columnas: ['Mesa', 'Facturas', 'Total'],
          filas: (rep.porMesa || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'formapago':
        return {
          columnas: ['Forma de pago', 'Facturas', 'Total'],
          filas: (rep.porFormaPago || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'facturas':
        return {
          columnas: ['# Factura', 'Fecha', 'Mesa/Cliente', 'Forma de pago', 'Total'],
          filas: (rep.detalle || []).map((d) => [
            `#${d.numero}`,
            fechaHoraColombia(d.fecha),
            d.ubicacion === 'Directa' ? d.cliente : d.ubicacion,
            d.formaPago,
            money(d.total),
          ]),
        };
      case 'resumen-facturas-notas':
        return {
          columnas: ['Cajero', 'Fecha', 'T.P.V. / caja', 'Tipo documento', 'Valor bruto', 'Descuentos', 'Impuestos', 'Valor neto', 'Propina'],
          filas: resumen.length ? [...agruparResumen(resumen).flatMap((grupo) => [
            [grupo.cajero, 'Total cajero', '', '', ...['bruto', 'descuentos', 'impuestos', 'neto', 'propina'].map((campo) => importeResumen(grupo[campo]))],
            ...grupo.filas.map((fila) => [
              grupo.cajero, fila.fecha, fila.caja, fila.tipo,
              ...['bruto', 'descuentos', 'impuestos', 'neto', 'propina'].map((campo) => importeResumen(fila[campo])),
            ]),
          ]), ...notasResumen.map((nota) => [nota, '', '', '', '', '', '', '', ''])] : [],
        };
      case 'revision-diaria-pdv':
        return {
          columnas: ['Cajero', 'Medio de pago', 'Fecha', 'Moneda', 'Valor ingreso', 'Valor egreso', 'Valor neto', 'Centro', 'T.P.V. / caja', 'Nro documento'],
          filas: revisionFiltrada.length ? [...agruparRevision(revisionFiltrada).flatMap((cajero) => [
            [cajero.nombre, 'Total cajero', '', '', 'No disponible', 'No disponible', money(cajero.neto), '', '', ''],
            ...cajero.medios.flatMap((medio) => [
              [cajero.nombre, `${medio.nombre} (${medio.id})`, 'Total medio', '', 'No disponible', 'No disponible', money(medio.neto), '', '', ''],
              ...medio.filas.map((fila) => [
                cajero.nombre, `${fila.medio} (${fila.medioId})`, fila.fecha, fila.moneda,
                importeResumen(fila.ingreso), importeResumen(fila.egreso), money(fila.neto),
                `${fila.compania} / ${fila.centro}`, fila.caja, fila.documento,
              ]),
            ]),
          ]), ...notasRevision.map((nota) => [nota, '', '', '', '', '', '', '', '', ''])] : [],
        };
      case 'movimientos-caja':
        return {
          columnas: columnasMovimientos,
          filas: movimientosFiltrados.map(filaMovimiento),
        };
      case 'gastos':
        return {
          columnas: ['Producto', 'Unidades', 'Costo insumos unit.', 'Costo total', 'Venta', 'Utilidad'],
          filas: (rep.gastos?.porProducto || []).map((p) => [
            p.nombre,
            String(p.unidades),
            money(p.costoUnit),
            money(p.costoTotal),
            money(p.ventaTotal),
            money(p.utilidad),
          ]),
        };
      case 'insumos':
        return {
          columnas: ['Insumo', 'Unidad', 'Cantidad consumida', 'Costo total', 'Venta', 'Ganancia', '% Ganancia'],
          filas: (rep.gastos?.porInsumo || []).map((i) => [
            i.nombre,
            i.unidad,
            String(i.cantidad),
            money(i.costoTotal),
            money(i.ventaTotal),
            money(i.utilidad),
            `${(i.ventaTotal > 0 ? (i.utilidad / i.ventaTotal) * 100 : 0).toFixed(1)}%`,
          ]),
        };
      case 'compras-insumo':
        return {
          columnas: ['Insumo', 'Cantidad comprada', 'Costo total'],
          filas: (rep.compras?.porInsumo || []).map((i) => [
            i.nombre,
            String(i.cantidad),
            money(i.costo),
          ]),
        };
      case 'pedidos-mesa':
        return {
          columnas: ['Fecha/Hora', 'Mesa', 'Mesero', 'Producto', 'Cantidad', 'Editado', 'Qué cambió', 'Observaciones'],
          filas: pedidosMesa.map((p) => [
            fechaHoraColombia(p.fecha),
            p.mesa != null ? `Mesa ${p.mesa}` : '-',
            p.mesera || '-',
            p.producto || '-',
            String(p.cantidad),
            p.editado ? 'Sí' : 'No',
            p.cambios || '',
            p.observaciones || '',
          ]),
        };
      case 'historial-pedidos':
        return {
          columnas: ['Fecha/Hora', 'Pedido', 'Mesa', 'Usuario', 'Nombre', 'Acción', 'Motivo', 'Detalle', 'Antes', 'Después', 'Estado'],
          filas: historial.map((evento) => [
            fechaHoraColombia(evento.fecha), String(evento.pedidoId),
            String(evento.despues?.mesaNumero ?? evento.antes?.mesaNumero ?? evento.despues?.mesaId ?? '-'),
            evento.usuarioCuenta, evento.usuarioNombre, ACCIONES_HISTORIAL[evento.accion] || evento.accion,
            evento.motivo || '', evento.detalle || '', textoEstadoPedido(evento.antes), textoEstadoPedido(evento.despues),
            ESTADOS_HISTORIAL[evento.estado] || 'Pendiente',
          ]),
        };
      case 'cocina':
        return {
          columnas: ['Hora listo', 'Mesa', 'Productos', 'Cocinero', 'Listo'],
          filas: cocina.map((c) => [
            c.fechaListo ? fechaHoraColombia(c.fechaListo) : '-',
            c.mesa != null ? `Mesa ${c.mesa}` : '-',
            c.productos || '',
            c.cocinero || '-',
            c.listo ? 'Sí' : 'No',
          ]),
        };
      default:
        return { columnas: [], filas: [] };
    }
  };

  const rangoDesde = sel === 'historial-pedidos' ? filtrosHistorial.desde : sel === 'resumen-facturas-notas' ? filtrosResumen.desde : sel === 'revision-diaria-pdv' ? filtrosRevision.desde : sel === 'movimientos-caja' ? filtrosMovimientos.desde : desde;
  const rangoHasta = sel === 'historial-pedidos' ? filtrosHistorial.hasta : sel === 'resumen-facturas-notas' ? filtrosResumen.hasta : sel === 'revision-diaria-pdv' ? filtrosRevision.hasta : sel === 'movimientos-caja' ? filtrosMovimientos.hasta : hasta;
  const rangoTexto = (rangoDesde || rangoHasta ? `${rangoDesde || '...'} a ${rangoHasta || '...'}` : 'Todo el histórico')
    + (sel === 'historial-pedidos' && filtrosHistorial.motivo ? ` · Motivo: ${filtrosHistorial.motivo}` : '')
    + (sel === 'revision-diaria-pdv' && centroRevision ? ` · Centro: ${centrosRevision.find(([id]) => id === centroRevision)?.[1]}` : '')
    + (sel === 'revision-diaria-pdv' && cajaRevision ? ` · Caja: ${cajasRevision.find(([id]) => id === cajaRevision)?.[1]}` : '')
    + (sel === 'movimientos-caja' && cajeroMovimiento ? ` · Cajero: ${cajerosMovimientos.find(([id]) => id === cajeroMovimiento)?.[1]}` : '')
    + (sel === 'movimientos-caja' && cajaMovimiento ? ` · Caja: ${cajasMovimientos.find(([id]) => id === cajaMovimiento)?.[1]}` : '')
    + (sel === 'movimientos-caja' && tipoMovimiento ? ` · Tipo: ${tipoMovimiento}` : '');

  const exportarExcel = async () => {
    const { columnas, filas } = datosReporte();
    if (!filas.length) return notify('No hay datos para exportar', 'err');
    const ultima = columnas.length - 1;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Asados Santacruz';
    wb.created = new Date();
    const ws = wb.addWorksheet(actual?.nombre?.slice(0, 31) || 'Reporte', {
      views: [{ state: 'frozen', ySplit: 5 }],
    });

    const nCols = columnas.length;
    const lastCol = String.fromCharCode(64 + nCols); // A, B, C...

    // Título POS
    ws.mergeCells(`A1:${lastCol}1`);
    const cMarca = ws.getCell('A1');
    cMarca.value = 'ASADOS SANTACRUZ';
    cMarca.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFE13626' } };
    cMarca.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Nombre del reporte
    ws.mergeCells(`A2:${lastCol}2`);
    const cTit = ws.getCell('A2');
    cTit.value = actual?.nombre || 'Reporte';
    cTit.font = { size: 14, bold: true, color: { argb: 'FF111827' } };

    // Rango y fecha de generación
    ws.mergeCells(`A3:${lastCol}3`);
    const cSub = ws.getCell('A3');
    cSub.value = `Rango: ${rangoTexto}  ·  Generado: ${fechaHoraColombia(new Date())}`;
    cSub.font = { size: 10, italic: true, color: { argb: 'FF6B7280' } };

    // Fila 4 vacía como separador
    const filaEncabezado = 5;
    const header = ws.getRow(filaEncabezado);
    columnas.forEach((col, i) => {
      const celda = header.getCell(i + 1);
      celda.value = col;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
      celda.alignment = { horizontal: i === ultima ? 'right' : 'left', vertical: 'middle' };
      celda.border = {
        top: { style: 'thin', color: { argb: 'FFD97706' } },
        bottom: { style: 'thin', color: { argb: 'FFD97706' } },
        left: { style: 'thin', color: { argb: 'FFD97706' } },
        right: { style: 'thin', color: { argb: 'FFD97706' } },
      };
    });
    header.height = 22;

    // Filas de datos con estilo cebra
    filas.forEach((f, r) => {
      const fila = ws.getRow(filaEncabezado + 1 + r);
      const bg = r % 2 === 0 ? 'FFFFFFFF' : 'FFFFF4EC';
      f.forEach((valor, i) => {
        const celda = fila.getCell(i + 1);
        celda.value = valor;
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        celda.alignment = { horizontal: i === ultima ? 'right' : 'left' };
        celda.font = i === ultima
          ? { bold: true, color: { argb: 'FFB45309' } }
          : { color: { argb: 'FF1F2937' } };
        celda.border = {
          bottom: { style: 'thin', color: { argb: 'FFF1D3BD' } },
          left: { style: 'thin', color: { argb: 'FFF1D3BD' } },
          right: { style: 'thin', color: { argb: 'FFF1D3BD' } },
        };
      });
    });

    if (sel === 'movimientos-caja') {
      const numFila = filaEncabezado + filas.length + 2;
      ws.mergeCells(`A${numFila}:${lastCol}${numFila}`);
      const celda = ws.getCell(`A${numFila}`);
      celda.value = notaMovimientos;
      celda.alignment = { wrapText: true, vertical: 'middle' };
      ws.getRow(numFila).height = 30;
    }

    // Ancho automático por columna
    columnas.forEach((col, i) => {
      let max = String(col).length;
      filas.forEach((f) => { max = Math.max(max, String(f[i] ?? '').length); });
      ws.getColumn(i + 1).width = Math.min(Math.max(max + 4, 12), 40);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${actual?.nombre || 'reporte'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const { columnas, filas } = datosReporte();
    if (!filas.length) return notify('No hay datos para exportar', 'err');
    const th = columnas.map((c, i) => `<th class="${i === columnas.length - 1 ? 'r' : ''}">${c}</th>`).join('');
    const tr = filas
      .map((f) => `<tr>${f.map((c, i) => `<td class="${i === f.length - 1 ? 'r' : ''}">${String(c).replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${actual?.nombre || 'Reporte'}</title>
    <style>
      @page { size: ${sel === 'movimientos-caja' ? 'A3 landscape' : 'A4'}; margin: 16mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; }
      .head { border-bottom: 3px solid #E13626; padding-bottom: 8px; margin-bottom: 16px; }
      .marca { font-size: 22px; font-weight: 900; color: #E13626; letter-spacing: 1px; }
      .marca-logo { height: 30px; display: block; margin-bottom: 4px; }
      h1 { font-size: 18px; margin: 4px 0 2px; }
      .sub { color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: ${sel === 'movimientos-caja' ? '7px' : '13px'}; overflow-wrap: anywhere; }
      th { background: #E13626; color: #fff; text-align: left; padding: ${sel === 'movimientos-caja' ? '3px' : '8px 10px'}; font-size: ${sel === 'movimientos-caja' ? '7px' : '12px'}; text-transform: uppercase; letter-spacing: .4px; }
      td { padding: ${sel === 'movimientos-caja' ? '3px' : '7px 10px'}; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #f8fafc; }
      .r { text-align: right; }
      .pie { margin-top: 18px; color: #888; font-size: 11px; text-align: center; }
    </style></head><body>
      <div class="head">
        <img class="marca-logo" src="${window.location.origin}/logo-oscuro.png" alt="Asados Santacruz">
        <h1>${actual?.nombre || 'Reporte'}</h1>
        <div class="sub">Rango: ${rangoTexto.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))} · Generado: ${fechaHoraColombia(new Date())}</div>
      </div>
      <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
      ${sel === 'movimientos-caja' ? `<p class="sub">${notaMovimientos}</p>` : ''}
      <div class="pie">Asados Santacruz · Reporte de ventas</div>
    </body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return notify('Permite las ventanas emergentes para exportar', 'err');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => { win.print(); };
  };

  const contenido = () => {
    switch (sel) {
      case 'totales':
        return (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="card metric"><div className="metric-label">Ventas totales</div><div className="metric-value">{money(t.total)}</div></div>
            <div className="card metric"><div className="metric-label">Facturas</div><div className="metric-value">{t.facturas}</div></div>
            <div className="card metric"><div className="metric-label">Unidades vendidas</div><div className="metric-value">{t.unidades}</div></div>
            <div className="card metric"><div className="metric-label">Subtotal (neto)</div><div className="metric-value">{money(t.subtotal)}</div></div>
            <div className="card metric"><div className="metric-label">Impuesto</div><div className="metric-value">{money(t.impuesto)}</div></div>
            {t.notasCredito > 0 && <div className="card metric"><div className="metric-label">Notas crédito</div><div className="metric-value">−{money(t.notasCredito)}</div></div>}
            {t.notasDebito > 0 && <div className="card metric"><div className="metric-label">Notas débito</div><div className="metric-value">+{money(t.notasDebito)}</div></div>}
            {t.retenciones > 0 && <div className="card metric"><div className="metric-label">Retenciones</div><div className="metric-value">−{money(t.retenciones)}</div></div>}
            {(t.notasCredito > 0 || t.notasDebito > 0 || t.retenciones > 0) && <div className="card metric"><div className="metric-label">Ventas netas</div><div className="metric-value">{money(t.totalNeto)}</div></div>}
            {rep.compras?.total > 0 && <div className="card metric"><div className="metric-label">Compras ({rep.compras.cantidad})</div><div className="metric-value">−{money(rep.compras.total)}</div></div>}
          </div>
        );
      case 'dia': return <TablaPeriodo datos={rep.ventasPorDia} maxTotal={maxDia} />;
      case 'semana': return <TablaPeriodo datos={rep.ventasPorSemana} maxTotal={maxSemana} />;
      case 'mes': return <TablaPeriodo datos={rep.ventasPorMes} maxTotal={maxMes} />;
      case 'prod-dia': return <TablaProductos bloques={rep.productos.dia} />;
      case 'prod-semana': return <TablaProductos bloques={rep.productos.semana} />;
      case 'prod-mes': return <TablaProductos bloques={rep.productos.mes} />;
      case 'categoria':
        return rep.porCategoria.length === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Categoría</th><th>Unidades</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porCategoria.map((c) => (
                <tr key={c.nombre}><td style={{ fontWeight: 600 }}>{c.nombre}</td><td>{c.cantidad}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'mesera':
        return rep.porMesera.length === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Mesera</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porMesera.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'mesa':
        return (rep.porMesa?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Mesa</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porMesa.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'formapago':
        return (rep.porFormaPago?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Forma de pago</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porFormaPago.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'facturas':
        return (rep.detalle?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th># Factura</th><th>Fecha</th><th>Mesa/Cliente</th><th>Forma de pago</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.detalle.map((d) => (
                <tr key={d.numero}>
                  <td style={{ fontWeight: 700 }}>#{d.numero}</td>
                  <td className="mini">{fechaHoraColombia(d.fecha)}</td>
                  <td>{d.ubicacion === 'Directa' ? d.cliente : d.ubicacion}</td>
                  <td>{d.formaPago}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'resumen-facturas-notas':
        return cargandoResumen ? <LoadingState label="Cargando resumen…" /> : errorResumen ? <p role="alert">{errorResumen}</p> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {resumen.length === 0 ? <p className="empty">Sin facturas ni notas en el periodo.</p> : (
                <table>
                  <thead><tr><th>Cajero / fecha</th><th>T.P.V. / caja</th><th>Tipo documento</th><th>Valor bruto</th><th>Descuentos</th><th>Impuestos</th><th>Valor neto</th><th>Propina</th></tr></thead>
                  {agruparResumen(resumen).map((grupo) => (
                    <tbody key={grupo.id}>
                      <tr style={{ fontWeight: 700 }}>
                        <td>{grupo.cajero}</td><td /><td>Total cajero</td>
                        {['bruto', 'descuentos', 'impuestos', 'neto', 'propina'].map((campo) => <td key={campo} style={{ textAlign: 'right' }}>{importeResumen(grupo[campo])}</td>)}
                      </tr>
                      {grupo.filas.map((fila) => (
                        <tr key={JSON.stringify([fila.fecha, fila.cajaId, fila.tipo])}>
                          <td>{fila.fecha}</td><td>{fila.caja}</td><td>{fila.tipo}</td>
                          {['bruto', 'descuentos', 'impuestos', 'neto', 'propina'].map((campo) => <td key={campo} style={{ textAlign: 'right' }}>{importeResumen(fila[campo])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              )}
            </div>
            {notasResumen.map((nota) => <p key={nota} className="mini">{nota}</p>)}
          </>
        );
      case 'revision-diaria-pdv':
        return cargandoRevision ? <LoadingState label="Cargando revisión diaria…" /> : errorRevision ? <p role="alert">{errorRevision}</p> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {revisionFiltrada.length === 0 ? <p className="empty">Sin pagos para los filtros seleccionados.</p> : (
                <table>
                  <thead><tr><th>Cajero / medio de pago</th><th>Fecha</th><th>Moneda</th><th>Valor ingreso</th><th>Valor egreso</th><th>Valor neto</th><th>Centro</th><th>T.P.V. / caja</th><th>Nro documento</th></tr></thead>
                  {agruparRevision(revisionFiltrada).map((cajero) => (
                    <tbody key={cajero.id}>
                      <tr style={{ fontWeight: 700 }}>
                        <td>{cajero.nombre}</td><td /><td /><td>No disponible</td><td>No disponible</td><td style={{ textAlign: 'right' }}>{money(cajero.neto)}</td><td /><td /><td />
                      </tr>
                      {cajero.medios.flatMap((medio) => [
                        <tr key={`medio-${medio.id}`} style={{ fontWeight: 700 }}>
                          <td>{medio.nombre} ({medio.id})</td><td /><td /><td>No disponible</td><td>No disponible</td><td style={{ textAlign: 'right' }}>{money(medio.neto)}</td><td /><td /><td />
                        </tr>,
                        ...medio.filas.map((fila) => (
                          <tr key={fila.id}>
                            <td>{fila.medio}</td><td>{fila.fecha}</td><td>{fila.moneda}</td>
                            <td>{importeResumen(fila.ingreso)}</td><td>{importeResumen(fila.egreso)}</td>
                            <td style={{ textAlign: 'right' }}>{money(fila.neto)}</td>
                            <td>{fila.compania} / {fila.centro}</td><td>{fila.caja}</td><td>{fila.documento}</td>
                          </tr>
                        )),
                      ])}
                    </tbody>
                  ))}
                </table>
              )}
            </div>
            {notasRevision.map((nota) => <p key={nota} className="mini">{nota}</p>)}
          </>
        );
      case 'movimientos-caja':
        return cargandoMovimientos ? <LoadingState label="Cargando movimientos…" /> : errorMovimientos ? <p role="alert">{errorMovimientos}</p> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {movimientosFiltrados.length === 0 ? <p className="empty">Sin movimientos para los filtros seleccionados.</p> : (
                <table>
                  <thead><tr>{columnasMovimientos.map((columna) => <th key={columna}>{columna}</th>)}</tr></thead>
                  <tbody>
                    {movimientosFiltrados.map((movimiento) => (
                      <tr key={movimiento.id}>{filaMovimiento(movimiento).map((valor, indice) => (
                        <td key={columnasMovimientos[indice]}>{valor}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="mini">{notaMovimientos}</p>
          </>
        );
      case 'gastos': {
        const g = rep.gastos || {};
        return (
          <div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
              <div className="card metric"><div className="metric-label">Gasto en insumos</div><div className="metric-value">{money(g.totalGasto || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Ventas</div><div className="metric-value">{money(g.totalVenta || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Utilidad bruta</div><div className="metric-value">{money(g.utilidad || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Margen</div><div className="metric-value">{(g.margen || 0).toFixed(1)}%</div></div>
            </div>
            {(g.porProducto?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
              <table>
                <thead><tr><th>Producto</th><th>Unid.</th><th style={{ textAlign: 'right' }}>Costo unit.</th><th style={{ textAlign: 'right' }}>Costo total</th><th style={{ textAlign: 'right' }}>Venta</th><th style={{ textAlign: 'right' }}>Utilidad</th></tr></thead>
                <tbody>
                  {g.porProducto.map((p) => (
                    <tr key={p.nombre}>
                      <td style={{ fontWeight: 600, textTransform: 'uppercase' }}>{p.nombre}</td>
                      <td>{p.unidades}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.costoUnit)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.costoTotal)}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.ventaTotal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.utilidad >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(p.utilidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="nota" style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              * El costo se calcula con la receta (insumos) de cada producto. Los productos sin receta cargada aparecen con costo $0.
            </p>
          </div>
        );
      }
      case 'insumos':
        return (rep.gastos?.porInsumo?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Insumo</th><th>Unidad</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Costo total</th><th style={{ textAlign: 'right' }}>Venta</th><th style={{ textAlign: 'right' }}>Ganancia</th><th style={{ textAlign: 'right' }}>% Gan.</th></tr></thead>
            <tbody>
              {rep.gastos.porInsumo.map((i) => {
                const pct = i.ventaTotal > 0 ? (i.utilidad / i.ventaTotal) * 100 : 0;
                return (
                  <tr key={i.nombre}>
                    <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                    <td className="mini">{i.unidad}</td>
                    <td style={{ textAlign: 'right' }}>{i.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{money(i.costoTotal)}</td>
                    <td style={{ textAlign: 'right' }}>{money(i.ventaTotal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: i.utilidad >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(i.utilidad)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: pct >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      case 'compras-insumo':
        return (rep.compras?.porInsumo?.length ?? 0) === 0 ? <p className="empty">Sin compras en el periodo.</p> : (
          <table>
            <thead><tr><th>Insumo</th><th style={{ textAlign: 'right' }}>Cantidad comprada</th><th style={{ textAlign: 'right' }}>Costo total</th></tr></thead>
            <tbody>
              {rep.compras.porInsumo.map((i) => (
                <tr key={i.nombre}>
                  <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                  <td style={{ textAlign: 'right' }}>{i.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(i.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'pedidos-mesa':
        return pedidosMesa.length === 0 ? <p className="empty">Sin pedidos en el periodo.</p> : (
          <table>
            <thead><tr><th>Fecha/Hora</th><th>Mesa</th><th>Mesero</th><th>Producto</th><th>Cant.</th><th>Editado</th><th>Qué cambió</th><th>Observaciones</th></tr></thead>
            <tbody>
              {pedidosMesa.map((p) => (
                <tr key={p.consecutivo}>
                  <td className="mini">{fechaHoraColombia(p.fecha)}</td>
                  <td>{p.mesa != null ? `Mesa ${p.mesa}` : '-'}</td>
                  <td>{p.mesera || '-'}</td>
                  <td style={{ textTransform: 'uppercase' }}>{p.producto || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{p.cantidad}</td>
                  <td>{p.editado ? <span className="badge orange">Sí</span> : 'No'}</td>
                  <td className="mini">{p.cambios || ''}</td>
                  <td className="mini">{p.observaciones || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'historial-pedidos':
        return cargandoHistorial ? <LoadingState label="Cargando historial…" /> : errorHistorial ? <p role="alert">{errorHistorial}</p>
          : historial.length === 0 ? <p className="empty">Sin eventos para los filtros seleccionados.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Fecha/Hora</th><th>Pedido</th><th>Mesa</th><th>Usuario</th><th>Acción</th><th>Motivo</th><th>Cambios</th><th title="Estado actual del pedido">Estado</th></tr></thead>
                <tbody>
                  {historial.map((evento) => (
                    <tr key={evento.id}>
                      <td className="mini">{fechaHoraColombia(evento.fecha)}</td>
                      <td>#{evento.pedidoId}</td>
                      <td>{evento.despues?.mesaNumero ?? evento.antes?.mesaNumero ?? evento.despues?.mesaId ?? '-'}</td>
                      <td><strong>{evento.usuarioNombre}</strong><div className="mini">{evento.usuarioCuenta}</div></td>
                      <td>{ACCIONES_HISTORIAL[evento.accion] || evento.accion}</td>
                      <td style={{ overflowWrap: 'anywhere', minWidth: 140 }}>{evento.motivo || '-'}</td>
                      <td style={{ minWidth: 180 }}>
                        <details>
                          <summary style={{ cursor: 'pointer' }}>Ver cambios</summary>
                          {evento.detalle && <p style={{ overflowWrap: 'anywhere' }}>{evento.detalle}</p>}
                          <h4>Antes</h4><EstadoHistorialPedido estado={evento.antes} />
                          <h4>Después</h4><EstadoHistorialPedido estado={evento.despues} />
                        </details>
                      </td>
                      <td><span className={`badge ${evento.estado === 'CANCELADO' ? 'red' : evento.estado === 'FACTURADO' ? 'green' : evento.estado === 'DESPACHADO' ? 'blue' : 'orange'}`}>
                        {ESTADOS_HISTORIAL[evento.estado] || 'Pendiente'}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
      case 'cocina':
        return cocina.length === 0 ? <p className="empty">Sin preparaciones en el periodo.</p> : (
          <table>
            <thead><tr><th>Hora listo</th><th>Mesa</th><th>Productos</th><th>Cocinero</th><th>Listo</th></tr></thead>
            <tbody>
              {cocina.map((c) => (
                <tr key={c.consecutivo}>
                  <td className="mini">{c.fechaListo ? fechaHoraColombia(c.fechaListo) : '—'}</td>
                  <td>{c.mesa != null ? `Mesa ${c.mesa}` : '-'}</td>
                  <td>{c.productos}</td>
                  <td>{c.cocinero || '-'}</td>
                  <td>{c.listo ? <span className="badge green">Sí</span> : <span className="badge red">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      default: return null;
    }
  };

  return (
    <div>
      <h1>Reportes de ventas</h1>
      <p className="subtitle">Selecciona un reporte en el menú lateral para verlo.</p>

      <div className="reportes-layout">
        {/* Reporte seleccionado */}
        <div className="card" style={{ minWidth: 0 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{actual?.nombre}</h3>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: '100%' }}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="reporte-desde">Desde</label>
                <input id="reporte-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="reporte-hasta">Hasta</label>
                <input id="reporte-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
              </div>
              {sel === 'revision-diaria-pdv' && (
                <>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="revision-centro">Centro de operación</label>
                    <select id="revision-centro" value={centroRevision} onChange={(e) => setCentroRevision(e.target.value)}>
                      <option value="">Todos</option>
                      {centrosRevision.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="revision-caja">T.P.V. / caja</label>
                    <select id="revision-caja" value={cajaRevision} onChange={(e) => setCajaRevision(e.target.value)}>
                      <option value="">Todas</option>
                      {cajasRevision.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                  </div>
                </>
              )}
              {sel === 'movimientos-caja' && (
                <>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="movimiento-cajero">Cajero</label>
                    <select id="movimiento-cajero" value={cajeroMovimiento} onChange={(e) => setCajeroMovimiento(e.target.value)}>
                      <option value="">Todos</option>
                      {cajerosMovimientos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="movimiento-caja">Caja</label>
                    <select id="movimiento-caja" value={cajaMovimiento} onChange={(e) => setCajaMovimiento(e.target.value)}>
                      <option value="">Todas</option>
                      {cajasMovimientos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="movimiento-tipo">Tipo</label>
                    <select id="movimiento-tipo" value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value)}>
                      <option value="">Todos</option><option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option>
                    </select>
                  </div>
                </>
              )}
              {sel === 'historial-pedidos' && (
                <div className="field" style={{ margin: 0, flex: '1 1 180px', minWidth: 0 }}>
                  <label htmlFor="historial-motivo">Motivo</label>
                  <input id="historial-motivo" type="search" maxLength={1000} value={motivo} placeholder="Buscar motivo…" onChange={(e) => setMotivo(e.target.value)} />
                </div>
              )}
              <button className="btn btn-primary btn-sm" onClick={cargar}>Consultar</button>
              {(desde !== hoy || hasta !== hoy || (sel === 'historial-pedidos' && motivo)) && (
                <button className="btn btn-sm" onClick={limpiar}>Hoy</button>
              )}
              <button className="btn-export btn-export-xls" title="Exportar a Excel" onClick={exportarExcel}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><path fill="#fff" d="m8.5 12 1.6 2.4L11.7 12h1.6l-2.4 3.4 2.5 3.6h-1.7l-1.7-2.6-1.7 2.6H6.6l2.5-3.6L6.8 12h1.7Z"/></svg>
                Excel
              </button>
              <button className="btn-export btn-export-pdf" title="Exportar a PDF" onClick={exportarPDF}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><text x="12" y="18" font-size="7" font-weight="700" text-anchor="middle" fill="#fff">PDF</text></svg>
                PDF
              </button>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>{contenido()}</div>
        </div>
      </div>
    </div>
  );
}
