import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { LoadingState, EmptyState, Button, Modal } from '../components/ui/index.jsx';
import { diaColombia } from '../fechaComercial.js';

// Vista de cocina: pedidos abiertos con sus items, ingredientes de cada plato, y el
// check de "listo" para avisarle al mesero que puede pasar a recoger la mesa.
export default function Cocina() {
  const [pedidos, setPedidos] = useState([]);
  const [preparaciones, setPreparaciones] = useState({}); // pedidoId -> preparacion
  const [cocineros, setCocineros] = useState([]);
  const [cocineroId, setCocineroId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(null);
  const [confirmarId, setConfirmarId] = useState(null); // pedidoId pendiente de confirmar como "listo"
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
  const [motivo, setMotivo] = useState('');
  const notify = useToast();

  const cargar = async () => {
    try {
      const [peds, pendientesPrep, listasPrep, cocs] = await Promise.all([
        api.get('/pedidos?estado=ABIERTO'),
        api.get('/preparacion-cocina?listo=0').catch(() => []),
        api.get('/preparacion-cocina?listo=1').catch(() => []), // se pide aparte para que "Finalizado" no se pierda al volver a consultar
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

  const marcarListo = async (pedidoId) => {
    setConfirmarId(null);
    try {
      setMarcando(pedidoId);
      await api.put(`/preparacion-cocina/${pedidoId}/listo`, { cocineroId: cocineroId || null });
      notify('Plato marcado como listo');
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
        estado: resultado.estado, cocineroId: cocineroId || null, motivo,
      });
      notify(resultado.estado === 'ENTREGADO' ? 'Entrega registrada' : resultado.estado === 'RECHAZADO' ? 'Rechazo registrado' : 'Comanda reenviada a cocina');
      setResultado(null);
      setMotivo('');
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setMarcando(null);
    }
  };

  if (cargando) return <LoadingState label="Cargando comandas…" />;

  const pendientes = pedidos.filter((pedido) => !['ENTREGADO', 'RECHAZADO'].includes(preparaciones[pedido.id]?.estadoCocina));
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
  const abrirResultado = (pedidoId, estado) => { setMotivo(''); setResultado({ pedidoId, estado }); };

  return (
    <div>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Cocina</h1>
          <p className="subtitle" style={{ margin: 0 }}>Comandas de los pedidos abiertos, con sus ingredientes. Marca "Plato listo" cuando termines.</p>
        </div>
        <div className="page-header__actions">
          <select aria-label="Cocinero responsable" value={cocineroId} onChange={(e) => elegirCocinero(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Cocinero...</option>
            {cocineros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <EmptyState icon="mesas" title="Sin comandas pendientes" description="No hay comandas por preparar o entregar." />
      ) : (
        <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {pendientes.map((p) => {
            const listo = !!preparaciones[p.id]?.listo;
            return (
            <div key={p.id} className={`card${listo ? ' LISTO' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>
                  {p.tipo === 'DOMICILIO' ? `Domicilio #${p.consecutivoDia ?? p.id}` : `Mesa ${p.mesa?.numero ?? '-'}`}
                </strong>
                <span className="mini">{new Date(p.createdAt).toLocaleTimeString()}</span>
              </div>
              {p.mesera?.nombre && <div className="mini" style={{ opacity: .8 }}>{p.mesera.nombre}</div>}
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {p.items.map((it) => (
                  <li key={it.id} style={{ marginBottom: 6 }}>
                    <strong>{it.cantidad}x {it.producto?.nombre}</strong>
                    {it.notas && <span className="mini" style={{ display: 'block', opacity: .8 }}>{it.notas}</span>}
                    {it.producto?.componentes?.length > 0 && (
                      <div className="mini" style={{ opacity: .75, marginTop: 2 }}>
                        Ingredientes: {it.producto.componentes.map((c) => c.item?.nombre).join(', ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {listo ? (
                <>
                  <div className="mini" style={{ color: 'var(--green)', marginTop: 10, fontWeight: 700 }}><Icon name="check" size={16} /> Listo para entregar</div>
                  <Button variant="success" icon="check" style={{ width: '100%', marginTop: 8 }}
                    disabled={marcando !== null} onClick={() => abrirResultado(p.id, 'ENTREGADO')}>Entregar</Button>
                </>
              ) : (
                <Button
                  variant="success"
                  icon="check"
                  style={{ width: '100%', marginTop: 10 }}
                  loading={marcando === p.id}
                  disabled={marcando !== null}
                  onClick={() => setConfirmarId(p.id)}
                >
                  Plato listo
                </Button>
              )}
              <Button variant="ghost" icon="ban" style={{ width: '100%', marginTop: 8 }}
                disabled={marcando !== null} onClick={() => abrirResultado(p.id, 'RECHAZADO')}>Rechazar comanda</Button>
            </div>
            );
          })}
        </div>
      )}

      <section className="cocina-historial" aria-labelledby="historial-cocina-titulo">
        <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <h2 id="historial-cocina-titulo">Historial de cocina</h2>
          <Button icon="reload" title="Actualizar historial" aria-label="Actualizar historial" style={{ width: 40, flex: '0 0 40px' }} onClick={cargarHistorial} />
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
          <div className="field"><label htmlFor="cocina-busqueda">Buscar</label>
            <input id="cocina-busqueda" type="search" placeholder="Plato, mesa o motivo" value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(1); }} /></div>
        </div>
        {cargandoHistorial ? <LoadingState label="Cargando historial..." /> : errorHistorial ? (
          <p role="alert" style={{ color: 'var(--red)' }}>{errorHistorial}</p>
        ) : filtrado.length === 0 ? (
          <EmptyState icon="cocina" title="Sin registros" description="No hay registros para los filtros seleccionados." />
        ) : (
          <>
            <div className="cocina-historial-tabla" tabIndex={0} aria-label="Historial de platos">
              <table>
                <thead><tr><th>Fecha y hora</th><th>Comanda</th><th>Platos</th><th>Estado</th><th>Cocinero</th><th>Mesero</th><th>Motivo</th><th></th></tr></thead>
                <tbody>{filasVisibles.map((fila) => (
                  <tr key={fila.id}>
                    <td>{new Date(fila.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
                    <td>{fila.tipo === 'DOMICILIO' ? `Domicilio #${fila.consecutivoDia ?? fila.pedidoId}` : `Mesa ${fila.mesa ?? '-'}`}<div className="mini">Pedido #{fila.pedidoId}</div></td>
                    <td>{fila.productos}</td>
                    <td><span className={`badge ${fila.estado === 'RECHAZADO' ? 'red' : fila.estado === 'ENTREGADO' ? 'green' : 'blue'}`}>{fila.estado === 'RECHAZADO' ? 'Rechazado' : fila.estado === 'ENTREGADO' ? 'Entregado' : 'Listo'}</span></td>
                    <td>{fila.cocinero || 'Sin asignar'}</td><td>{fila.mesera || '-'}</td><td>{fila.motivo || '-'}</td>
                    <td>{fila.estado === 'RECHAZADO' && pedidos.some((pedido) => pedido.id === fila.pedidoId && preparaciones[pedido.id]?.estadoCocina === 'RECHAZADO') && (
                      <Button size="sm" icon="reload" disabled={marcando !== null} onClick={() => abrirResultado(fila.pedidoId, 'REABIERTO')}>Reenviar a cocina</Button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="row between" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <span className="mini">{filtrado.length} registros · {paginaActual} / {paginas}</span>
              <div className="row" style={{ gap: 8 }}>
                <Button icon="back" title="Pagina anterior" aria-label="Pagina anterior" disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)} />
                <Button icon="forward" title="Pagina siguiente" aria-label="Pagina siguiente" disabled={paginaActual === paginas} onClick={() => setPagina(paginaActual + 1)} />
              </div>
            </div>
          </>
        )}
      </section>

      {resultado && (
        <Modal title={resultado.estado === 'RECHAZADO' ? 'Rechazar comanda' : resultado.estado === 'ENTREGADO' ? 'Confirmar entrega' : 'Reenviar a cocina'} size="sm"
          onClose={() => { if (marcando === null) setResultado(null); }}
          footer={<><Button variant="ghost" disabled={marcando !== null} onClick={() => setResultado(null)}>Cancelar</Button>
            <Button variant={resultado.estado === 'RECHAZADO' ? 'danger' : 'success'} icon={resultado.estado === 'RECHAZADO' ? 'ban' : 'check'}
              loading={marcando === resultado.pedidoId} disabled={marcando !== null || (resultado.estado === 'RECHAZADO' && !motivo.trim())}
              onClick={registrarResultado}>{resultado.estado === 'RECHAZADO' ? 'Registrar rechazo' : resultado.estado === 'ENTREGADO' ? 'Confirmar entrega' : 'Reenviar'}</Button></>}
        >
          {resultado.estado === 'RECHAZADO' ? <div className="field"><label htmlFor="cocina-motivo">Motivo del rechazo</label>
            <textarea id="cocina-motivo" rows={3} maxLength={500} value={motivo} onChange={(event) => setMotivo(event.target.value)} /></div>
            : <p>{resultado.estado === 'ENTREGADO' ? 'Confirmar que los platos de esta comanda fueron entregados.' : 'La comanda volvera a pendientes y conservara su rechazo en el historial.'}</p>}
        </Modal>
      )}

      {confirmarId != null && (
        <Modal
          title="Confirmar"
          size="sm"
          onClose={() => setConfirmarId(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setConfirmarId(null)}>No</Button>
              <Button variant="success" onClick={() => marcarListo(confirmarId)}>Sí</Button>
            </>
          )}
        >
          ¿Marcar este plato como listo?
        </Modal>
      )}
    </div>
  );
}
