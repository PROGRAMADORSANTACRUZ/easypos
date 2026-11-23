import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../App.jsx';
import { LoadingState, EmptyState, Button, Modal } from '../components/ui/index.jsx';
import { diaColombia } from '../fechaComercial.js';

// Semaforo por minutos de espera de la comanda.
const SEMAFORO = [
  { hasta: 10, clase: 'verde', etiqueta: 'A tiempo', rango: '< 10 min' },
  { hasta: 20, clase: 'naranja', etiqueta: 'Atención', rango: '10–20 min' },
  { hasta: 30, clase: 'rojo', etiqueta: 'Demorada', rango: '20–30 min' },
  { hasta: Infinity, clase: 'vino', etiqueta: 'Crítica', rango: '> 30 min' },
];
const semaforoDe = (minutos) => SEMAFORO.find((nivel) => minutos < nivel.hasta);
const ESTADOS_HISTORIAL = {
  RECHAZADO: { clase: 'rechazado', etiqueta: 'Rechazado' },
  ENTREGADO: { clase: 'entregado', etiqueta: 'Entregado' },
  LISTO: { clase: 'listo', etiqueta: 'Listo' },
};

// Vista de cocina: pedidos abiertos con sus items, ingredientes de cada plato, y el
// check de "listo" para avisarle al mesero que puede pasar a recoger la mesa.
export default function Cocina() {
  const [pedidos, setPedidos] = useState([]);
  const [preparaciones, setPreparaciones] = useState({}); // pedidoId -> preparacion
  const [cocineros, setCocineros] = useState([]);
  const [cocineroId, setCocineroId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [revisionHistorial, setRevisionHistorial] = useState(0);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [desde, setDesde] = useState(() => diaColombia(new Date()));
  const [hasta, setHasta] = useState(() => diaColombia(new Date()));
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [cocineroFiltro, setCocineroFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const notify = useToast();

  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(reloj);
  }, []);

  const cargar = async () => {
    try {
      const [peds, pendientesPrep, listasPrep, cocs] = await Promise.all([
        api.get('/pedidos?estado=ABIERTO'),
        api.get('/preparacion-cocina?listo=0'),
        api.get('/preparacion-cocina?listo=1'),
        api.get('/cocineros').catch(() => []),
      ]);
      setPedidos(peds);
      setPreparaciones(Object.fromEntries([...pendientesPrep, ...listasPrep].map((p) => [p.pedidoId, p])));
      setCocineros(cocs.filter((c) => c.activo !== false));
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  const cargarHistorial = () => setRevisionHistorial((actual) => actual + 1);

  useEffect(() => {
    let activo = true;
    const consultar = async () => {
      if (desde && hasta && desde > hasta) {
        setErrorHistorial('La fecha inicial debe ser menor o igual a la final.');
        setCargandoHistorial(false);
        return;
      }
      try {
        const filas = await api.get(`/preparacion-cocina/historial?${new URLSearchParams({ desde, hasta })}`);
        if (activo) { setHistorial(filas); setErrorHistorial(''); }
      } catch (error) {
        if (activo) setErrorHistorial(error.message);
      } finally {
        if (activo) setCargandoHistorial(false);
      }
    };
    setCargandoHistorial(true);
    consultar();
    const intervalo = setInterval(consultar, 15000);
    return () => { activo = false; clearInterval(intervalo); };
  }, [desde, hasta, revisionHistorial]);

  const elegirCocinero = (id) => {
    setCocineroId(id);
  };

  const marcarItemListo = async (pedido, item) => {
    try {
      setMarcando(pedido.id);
      const preparacion = await api.put(`/preparacion-cocina/${pedido.id}/items/${item.id}/listo`, { cocineroId: cocineroId || null });
      setPreparaciones((actual) => ({ ...actual, [pedido.id]: preparacion }));
      notify(preparacion.listo ? 'Todos los platos de la comanda están listos' : `${item.producto?.nombre || 'Plato'} marcado como listo`);
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setMarcando(null);
    }
  };

  const registrarResultado = async () => {
    if (!resultado) return;
    try {
      setMarcando(resultado.pedidoId);
      await api.put(`/preparacion-cocina/${resultado.pedidoId}/resultado`, {
        estado: 'REABIERTO', cocineroId: cocineroId || null,
      });
      notify('Comanda reenviada a cocina');
      setResultado(null);
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setMarcando(null);
    }
  };

  if (cargando) return <LoadingState label="Cargando comandas…" />;

  const pendientes = pedidos.filter((pedido) => !preparaciones[pedido.id]?.listo
    && !['ENTREGADO', 'RECHAZADO'].includes(preparaciones[pedido.id]?.estadoCocina))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const minutosDe = (pedido) => Math.max(0, Math.floor((ahora - new Date(pedido.createdAt).getTime()) / 60000));
  const conteoSemaforo = Object.fromEntries(SEMAFORO.map((nivel) => [nivel.clase, 0]));
  pendientes.forEach((pedido) => { conteoSemaforo[semaforoDe(minutosDe(pedido)).clase] += 1; });
  const texto = busqueda.trim().toLocaleLowerCase('es-CO');
  const filtrado = historial.filter((fila) =>
    (!estadoFiltro || fila.estado === estadoFiltro) &&
    (!cocineroFiltro || String(fila.cocineroId) === cocineroFiltro) &&
    (!texto || [fila.productos, fila.motivo, fila.cocinero, fila.mesera, fila.pedidoId, fila.mesa != null ? `Mesa ${fila.mesa}` : 'Domicilio']
      .join(' ').toLocaleLowerCase('es-CO').includes(texto)));
  const paginas = Math.max(1, Math.ceil(filtrado.length / 20));
  const paginaActual = Math.min(pagina, paginas);
  const filasVisibles = filtrado.slice((paginaActual - 1) * 20, paginaActual * 20);
  const responsables = [...new Map([...cocineros, ...historial.filter((fila) => fila.cocineroId).map((fila) => ({ id: fila.cocineroId, nombre: fila.cocinero }))]
    .map((cocinero) => [String(cocinero.id), cocinero])).values()];
  const abrirResultado = (pedidoId, estado) => setResultado({ pedidoId, estado });

  return (
    <div>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Cocina</h1>
          <p className="subtitle" style={{ margin: 0 }}>Comandas de los pedidos abiertos, con sus ingredientes. Toca cada plato cuando esté listo; al tocar el último, la comanda queda terminada.</p>
        </div>
        <div className="page-header__actions">
          <select aria-label="Cocinero responsable" value={cocineroId} onChange={(e) => elegirCocinero(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Cocinero...</option>
            {cocineros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="cocina-layout">
        <div className="cocina-comandas">
          <div className="cocina-semaforo" aria-label="Semáforo de comandas">
            {SEMAFORO.map((nivel) => (
              <div key={nivel.clase} className={`cocina-semaforo__nivel cocina-semaforo__nivel--${nivel.clase}`}>
                <span className="cocina-semaforo__luz" aria-hidden="true" />
                <div><strong>{conteoSemaforo[nivel.clase]}</strong> <span>{nivel.etiqueta}</span><small>{nivel.rango}</small></div>
              </div>
            ))}
          </div>
          {pendientes.length === 0 ? (
            <EmptyState icon="mesas" title="Sin comandas pendientes" description="No hay comandas por preparar." />
          ) : (
            <div className="cocina-comandas__grid">
              {pendientes.map((p) => {
                const minutos = minutosDe(p);
                const nivel = semaforoDe(minutos);
                return (
                  <article key={p.id} className={`cocina-comanda cocina-comanda--${nivel.clase}`}>
                    <header className="cocina-comanda__cabecera">
                      <div>
                        <strong>{p.tipo === 'DOMICILIO' ? `Domicilio #${p.consecutivoDia ?? p.id}` : `Mesa ${p.mesa?.numero ?? '-'}`}</strong>
                        <span>{p.mesera?.nombre || 'Sin mesero'} · {new Date(p.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="cocina-comanda__tiempo" title={nivel.etiqueta}>{minutos} min</span>
                    </header>
                    <ul className="cocina-comanda__platos">
                      {p.items.map((it) => {
                        const listo = (preparaciones[p.id]?.itemsListos || []).some((estado) => Number(estado.pedidoItemId) === it.id
                          && Number(estado.cantidad ?? it.cantidad) === it.cantidad);
                        return (
                          <li key={it.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              className={`cocina-plato${listo ? ' cocina-plato--listo' : ''}`}
                              aria-pressed={listo}
                              aria-disabled={listo || marcando !== null}
                              aria-label={listo ? `${it.producto?.nombre || 'Plato'} listo` : `Marcar ${it.producto?.nombre || 'plato'} como listo`}
                              onClick={() => !listo && marcando === null && marcarItemListo(p, it)}
                              onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !listo && marcando === null) {
                                  e.preventDefault();
                                  marcarItemListo(p, it);
                                }
                              }}
                            >
                              <strong className="cocina-plato__nombre">
                                <span className="cocina-plato__cantidad">{it.cantidad}x</span> {it.producto?.nombre}
                                {it.cantidadMesa00 > 0 && <span className="badge blue">Mesa 00 ×{it.cantidadMesa00}</span>}
                              </strong>
                              {it.notas && <span className="cocina-nota"><b>Obs:</b> {it.notas}</span>}
                              {it.producto?.componentes?.length > 0 && (
                                <div className="cocina-plato__ingredientes">
                                  Ingredientes: {it.producto.componentes.map((c) => c.item?.nombre).join(', ')}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {p.observaciones && <div className="cocina-nota cocina-nota--pedido"><b>Observaciones:</b> {p.observaciones}</div>}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <section className="cocina-historial" aria-labelledby="historial-cocina-titulo">
          <div className="cocina-historial__cabecera">
            <h2 id="historial-cocina-titulo">Historial de cocina</h2>
            <Button icon="reload" title="Actualizar historial" aria-label="Actualizar historial" style={{ width: 36, flex: '0 0 36px', padding: 0, justifyContent: 'center' }} onClick={cargarHistorial} />
          </div>
          <div className="cocina-historial-filtros">
            <div className="field"><label htmlFor="cocina-desde">Desde</label>
              <input id="cocina-desde" type="date" value={desde} onChange={(event) => { setDesde(event.target.value); setPagina(1); }} /></div>
            <div className="field"><label htmlFor="cocina-hasta">Hasta</label>
              <input id="cocina-hasta" type="date" value={hasta} onChange={(event) => { setHasta(event.target.value); setPagina(1); }} /></div>
            <div className="field"><label htmlFor="cocina-estado">Estado</label>
              <select id="cocina-estado" value={estadoFiltro} onChange={(event) => { setEstadoFiltro(event.target.value); setPagina(1); }}>
                <option value="">Todos</option><option value="ENTREGADO">Entregados</option><option value="RECHAZADO">Rechazados</option><option value="LISTO">Listos</option>
              </select></div>
            <div className="field"><label htmlFor="cocina-historial-cocinero">Cocinero</label>
              <select id="cocina-historial-cocinero" value={cocineroFiltro} onChange={(event) => { setCocineroFiltro(event.target.value); setPagina(1); }}>
                <option value="">Todos</option>{responsables.map((cocinero) => <option key={cocinero.id} value={cocinero.id}>{cocinero.nombre}</option>)}
              </select></div>
            <div className="field cocina-historial-filtros__busqueda"><label htmlFor="cocina-busqueda">Buscar</label>
              <input id="cocina-busqueda" type="search" placeholder="Plato, mesa o motivo" value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(1); }} /></div>
          </div>
          {cargandoHistorial ? <LoadingState label="Cargando historial..." /> : errorHistorial ? (
            <p role="alert" style={{ color: 'var(--red)' }}>{errorHistorial}</p>
          ) : filtrado.length === 0 ? (
            <EmptyState icon="cocina" title="Sin registros" description="No hay registros para los filtros seleccionados." />
          ) : (
            <>
              <ul className="cocina-historial__lista" aria-label="Historial de platos">
                {filasVisibles.map((fila) => {
                  const estado = ESTADOS_HISTORIAL[fila.estado] || ESTADOS_HISTORIAL.LISTO;
                  return (
                    <li key={fila.id} className={`cocina-hist cocina-hist--${estado.clase}`}>
                      <div className="cocina-hist__fila">
                        <strong>{fila.tipo === 'DOMICILIO' ? `Domicilio #${fila.consecutivoDia ?? fila.pedidoId}` : `Mesa ${fila.mesa ?? '-'}`}
                          <span className="cocina-hist__pedido"> · Pedido #{fila.pedidoId}</span></strong>
                        <span className={`cocina-hist__estado cocina-hist__estado--${estado.clase}`}>{estado.etiqueta}</span>
                      </div>
                      <div className="cocina-hist__platos">{fila.productos}</div>
                      <div className="cocina-hist__meta">
                        <span>{new Date(fila.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>Cocinero: {fila.cocinero || 'Sin asignar'}</span>
                        <span>Mesero: {fila.mesera || '-'}</span>
                      </div>
                      {fila.motivo && <div className="cocina-nota cocina-nota--motivo"><b>Motivo:</b> {fila.motivo}</div>}
                      {fila.estado === 'RECHAZADO' && pedidos.some((pedido) => pedido.id === fila.pedidoId && preparaciones[pedido.id]?.estadoCocina === 'RECHAZADO') && (
                        <Button size="sm" icon="reload" disabled={marcando !== null} onClick={() => abrirResultado(fila.pedidoId, 'REABIERTO')}>Reenviar a cocina</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="row between" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <span className="mini">{filtrado.length} registros · {paginaActual} / {paginas}</span>
                <div className="row" style={{ gap: 8 }}>
                  <Button icon="back" title="Pagina anterior" aria-label="Pagina anterior" disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)} />
                  <Button icon="forward" title="Pagina siguiente" aria-label="Pagina siguiente" disabled={paginaActual === paginas} onClick={() => setPagina(paginaActual + 1)} />
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {resultado && (
        <Modal title="Reenviar a cocina" size="sm"
          onClose={() => { if (marcando === null) setResultado(null); }}
          footer={<><Button variant="ghost" disabled={marcando !== null} onClick={() => setResultado(null)}>Cancelar</Button>
            <Button variant="success" icon="reload" loading={marcando === resultado.pedidoId} disabled={marcando !== null}
              onClick={registrarResultado}>Reenviar</Button></>}
        >
          <p>La comanda volverá a pendientes y conservará su rechazo en el historial.</p>
        </Modal>
      )}
    </div>
  );
}
