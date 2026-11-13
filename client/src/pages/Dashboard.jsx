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

const COLORES_TOP = ['var(--primary)', '#7C5CBF', '#F5A524', '#2D9CDB', '#8A8178'];

// Dona del top de productos: cada segmento es proporcional al valor facturado.
function Dona({ productos }) {
  const radio = 70;
  const circunferencia = 2 * Math.PI * radio;
  const total = productos.reduce((suma, producto) => suma + producto.total, 0);
  let acumulado = 0;
  const lider = productos[0];
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Top 5 productos del mes">
      <circle cx="100" cy="100" r={radio} fill="none" stroke="var(--border)" strokeWidth="22" />
      {total > 0 && productos.map((producto, indice) => {
        const largo = (producto.total / total) * circunferencia;
        const segmento = (
          <circle key={producto.id} cx="100" cy="100" r={radio} fill="none" stroke={COLORES_TOP[indice]} strokeWidth="22"
            strokeDasharray={`${Math.max(0, largo - 2)} ${circunferencia}`} strokeDashoffset={-acumulado} transform="rotate(-90 100 100)">
            <title>{`${producto.nombre}: ${money(producto.total)} (${producto.cantidad} und.)`}</title>
          </circle>
        );
        acumulado += largo;
        return segmento;
      })}
      {lider && (
        <>
          <text x="100" y="94" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
            {lider.nombre.length > 20 ? `${lider.nombre.slice(0, 19)}…` : lider.nombre}
          </text>
          <text x="100" y="114" textAnchor="middle" fontSize="15" fill="currentColor">{money(lider.total)}</text>
        </>
      )}
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

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Top 5 productos del mes</h3>
        {(datos.topProductos || []).length === 0 ? <p className="empty">Aún no hay productos facturados este mes.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Dona productos={datos.topProductos} />
            <Leyenda series={datos.topProductos.map((producto, indice) => ({ clave: producto.id, nombre: `${producto.nombre} · ${money(producto.total)}`, color: COLORES_TOP[indice] }))} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '2 1 520px', minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Últimos pedidos</h3>
          {(datos.ultimosPedidos || []).length === 0 ? <p className="empty">Sin pedidos.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Mesa</th><th>Producto</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Estado</th><th>Vendedor</th></tr></thead>
                <tbody>
                  {datos.ultimosPedidos.map((pedido) => (
                    <tr key={pedido.id}>
                      <td>{pedido.mesa}</td>
                      <td>{pedido.producto}</td>
                      <td className="mini">{pedido.fecha ? new Date(pedido.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : ''}</td>
                      <td style={{ textAlign: 'right' }}>{pedido.cantidad}</td>
                      <td><span className={`badge ${pedido.estado === 'Pagada' ? 'green' : pedido.estado === 'Cancelado' ? 'red' : 'orange'}`}>{pedido.estado}</span></td>
                      <td>{pedido.vendedor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Vendedores del mes</h3>
          {(datos.vendedores || []).length === 0 ? <p className="empty">Aún no hay ventas este mes.</p> : datos.vendedores.map((vendedor, indice) => (
            <div key={vendedor.id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Icon name="usuarios" size={18} />
                <b style={{ overflowWrap: 'anywhere' }}>{vendedor.nombre}</b>
                {indice < 3 && <span className={`badge ${indice === 0 ? 'red' : 'gray'}`}>Top {indice + 1}</span>}
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <b>{money(vendedor.total)}</b>
                <div className="mini">{vendedor.facturas} factura(s)</div>
              </span>
            </div>
          ))}
        </div>
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
