import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { LoadingState, EmptyState, Button, Modal } from '../components/ui/index.jsx';

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

  const elegirCocinero = (id) => {
    setCocineroId(id);
  };

  const marcarListo = async (pedidoId) => {
    setConfirmarId(null);
    try {
      setMarcando(pedidoId);
      await api.put(`/preparacion-cocina/${pedidoId}/listo`, { cocineroId: cocineroId || null });
      notify('Plato marcado como listo');
      cargar();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setMarcando(null);
    }
  };

  if (cargando) return <LoadingState label="Cargando comandas…" />;

  // Se muestran todos los pedidos abiertos (con o sin "Finalizado"); solo salen de la lista
  // cuando se facturan (dejan de estar ABIERTO).
  const pendientes = pedidos;

  return (
    <div>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Cocina</h1>
          <p className="subtitle" style={{ margin: 0 }}>Comandas de los pedidos abiertos, con sus ingredientes. Marca "Plato listo" cuando termines.</p>
        </div>
        <div className="page-header__actions">
          <select value={cocineroId} onChange={(e) => elegirCocinero(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Cocinero...</option>
            {cocineros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <EmptyState icon="mesas" title="Sin comandas pendientes" description="No hay pedidos abiertos en este momento." />
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
                <div
                  className="mini"
                  style={{
                    width: '100%', marginTop: 10, textAlign: 'center', fontWeight: 700,
                    color: 'var(--green)', background: 'var(--green-soft)', borderRadius: 8, padding: '8px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Icon name="check" size={16} /> Finalizado
                </div>
              ) : (
                <Button
                  variant="success"
                  icon="check"
                  style={{ width: '100%', marginTop: 10 }}
                  loading={marcando === p.id}
                  onClick={() => setConfirmarId(p.id)}
                >
                  Plato listo
                </Button>
              )}
            </div>
            );
          })}
        </div>
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
