import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useAuth, useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { PageHeader, Modal, Button, LoadingState } from '../components/ui/index.jsx';
import { escalaEje, porcentajeObjetivo } from '../dashboardCalculos.js';

const compacto = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

function Anillo({ porcentaje }) {
  const radio = 26;
  const circunferencia = 2 * Math.PI * radio;
  const avance = porcentaje == null ? 0 : Math.min(100, porcentaje);
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={porcentaje == null ? 'Sin objetivo' : `${porcentaje}% del objetivo`}>
      <circle cx="34" cy="34" r={radio} fill="none" stroke="var(--border)" strokeWidth="6" />
      {avance > 0 && (
        <circle cx="34" cy="34" r={radio} fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(avance / 100) * circunferencia} ${circunferencia}`} transform="rotate(-90 34 34)" />
      )}
      <text x="34" y="38" textAnchor="middle" fontSize="12" fill="currentColor">{porcentaje == null ? '—' : `${porcentaje.toLocaleString('es-CO')}%`}</text>
    </svg>
  );
}

// Grafico de lineas o barras agrupadas en SVG; "series" = [{ clave, nombre, color }].
function Grafico({ datos, etiqueta, series, tipo = 'barras', alto = 220, formato = (v) => compacto.format(v) }) {
  const ancho = 640;
  const margen = { arriba: 12, derecha: 12, abajo: 30, izquierda: 60 };
  const maximo = Math.max(0, ...datos.flatMap((dato) => series.map((serie) => dato[serie.clave] || 0)));
  const { tope, paso } = escalaEje(maximo);
  const areaAncho = ancho - margen.izquierda - margen.derecha;
  const areaAlto = alto - margen.arriba - margen.abajo;
  const y = (valor) => margen.arriba + areaAlto - (valor / tope) * areaAlto;
  const banda = areaAncho / Math.max(1, datos.length);
  const xCentro = (indice) => margen.izquierda + banda * indice + banda / 2;
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, indice) => indice * paso);
  const saltoEtiqueta = Math.max(1, Math.ceil(datos.length / 12));
  const anchoBarra = Math.min(48, (banda * 0.7) / series.length);

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" role="img" style={{ display: 'block' }}>
      {marcas.map((marca) => (
        <g key={marca}>
          <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y(marca)} y2={y(marca)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={margen.izquierda - 6} y={y(marca) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{formato(marca)}</text>
        </g>
      ))}
      {datos.map((dato, indice) => (
        <g key={etiqueta(dato)}>
          {tipo === 'barras' && series.map((serie, s) => {
            const valor = dato[serie.clave] || 0;
            const x = xCentro(indice) - (anchoBarra * series.length) / 2 + s * anchoBarra;
            return (
              <rect key={serie.clave} x={x} y={y(valor)} width={Math.max(1, anchoBarra - 2)} height={Math.max(0, y(0) - y(valor))} fill={serie.color} rx="2">
                <title>{`${etiqueta(dato)} · ${serie.nombre}: ${serie.formatoTitulo ? serie.formatoTitulo(valor) : valor}`}</title>
              </rect>
            );
          })}
          {indice % saltoEtiqueta === 0 && (
            <text x={xCentro(indice)} y={alto - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{etiqueta(dato)}</text>
          )}
        </g>
      ))}
      {tipo === 'linea' && series.map((serie) => (
        <g key={serie.clave}>
          <polyline fill="none" stroke={serie.color} strokeWidth="2.5" strokeLinejoin="round"
            points={datos.map((dato, indice) => `${xCentro(indice)},${y(dato[serie.clave] || 0)}`).join(' ')} />
          {datos.map((dato, indice) => (
            <circle key={etiqueta(dato)} cx={xCentro(indice)} cy={y(dato[serie.clave] || 0)} r="3.5" fill="var(--panel)" stroke={serie.color} strokeWidth="2">
              <title>{`${etiqueta(dato)}: ${dato[serie.clave] || 0}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Leyenda({ series }) {
  return (
    <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
      {series.map((serie) => (
        <span key={serie.clave} className="mini" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: serie.color, display: 'inline-block' }} />{serie.nombre}
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const notify = useToast();
  const [datos, setDatos] = useState(null);
  const [horas, setHoras] = useState(12);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const puedeEditar = puede(user, 'dashboard.editar') || user?.__dev === true;

  const cargar = async (rango = horas) => {
    setCargando(true);
    try {
      setDatos(await api.get(`/dashboard?horas=${rango}`));
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(horas); }, [horas]);

  const abrirObjetivos = () => setEditando(Object.fromEntries(datos.indicadores.map((indicador) => [indicador.id, indicador.objetivo ?? ''])));
  const guardarObjetivos = async (e) => {
    e.preventDefault();
    try {
      setGuardando(true);
      await api.put('/dashboard/objetivos', editando);
      notify('Objetivos actualizados');
      setEditando(null);
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  if (!datos) return <div><PageHeader title="Dashboard" /><LoadingState label="Cargando dashboard…" /></div>;

  const seriesIngresos = [
    { clave: 'ingresos', nombre: 'Ingresos (ventas)', color: 'var(--primary)', formatoTitulo: money },
    { clave: 'egresos', nombre: 'Egresos (compras + egresos de caja)', color: 'var(--muted)', formatoTitulo: money },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de ventas del restaurante."
        actions={(
          <div className="row" style={{ gap: 8 }}>
            {puedeEditar && <Button variant="secondary" size="sm" icon="edit" onClick={abrirObjetivos}>Objetivos</Button>}
            <Button variant="secondary" size="sm" onClick={() => cargar()} loading={cargando}>Actualizar</Button>
          </div>
        )}
      />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 16 }}>
        {datos.indicadores.map((indicador) => (
          <div key={indicador.id} className="card row" style={{ gap: 12, alignItems: 'center', flexWrap: 'nowrap', padding: 14 }}>
            <Anillo porcentaje={porcentajeObjetivo(indicador.valor, indicador.objetivo)} />
            <div style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', overflowWrap: 'anywhere' }}>{money(indicador.valor)}</div>
              <div className="mini">{indicador.label}</div>
              <div className="mini">Objetivo: {indicador.objetivo == null ? 'sin definir' : money(indicador.objetivo)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: 16 }}>
        <div className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Pedidos por hora</h3>
            <select value={horas} onChange={(e) => setHoras(Number(e.target.value))} aria-label="Rango de horas" style={{ width: 'auto' }}>
              <option value={12}>12 horas</option>
              <option value={24}>24 horas</option>
            </select>
          </div>
          <Grafico tipo="linea" datos={datos.pedidosPorHora} etiqueta={(dato) => dato.hora}
            series={[{ clave: 'cantidad', nombre: 'Pedidos', color: 'var(--primary)' }]} formato={(v) => String(v)} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Facturado últimos 7 días</h3>
          <Grafico datos={datos.facturado7Dias} etiqueta={(dato) => dato.etiqueta}
            series={[{ clave: 'total', nombre: 'Facturado', color: 'var(--primary)', formatoTitulo: money }]} />
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="reportes" size={18} /> Ingresos vs egresos · últimos 12 meses</h3>
          <Leyenda series={seriesIngresos} />
        </div>
        <Grafico datos={datos.ingresosEgresos} etiqueta={(dato) => dato.etiqueta} series={seriesIngresos} alto={260} />
      </div>
      <p className="mini">Valores facturados sin propina, en hora de Colombia. Pedidos cancelados no se cuentan.</p>

      {editando && (
        <Modal
          title="Objetivos de ventas"
          subtitle="Deja un campo vacío para no definir objetivo."
          onClose={() => setEditando(null)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="objetivos-form" loading={guardando}>Guardar</Button>
            </>
          )}
        >
          <form id="objetivos-form" onSubmit={guardarObjetivos}>
            {datos.indicadores.map((indicador) => (
              <div key={indicador.id} className="field">
                <label htmlFor={`objetivo-${indicador.id}`}>{indicador.label}</label>
                <input id={`objetivo-${indicador.id}`} type="number" min="0" step="1" value={editando[indicador.id]}
                  onChange={(e) => setEditando((actual) => ({ ...actual, [indicador.id]: e.target.value }))} />
              </div>
            ))}
          </form>
        </Modal>
      )}
    </div>
  );
}
