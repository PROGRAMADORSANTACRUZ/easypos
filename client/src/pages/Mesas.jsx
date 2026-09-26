import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { LoadingState, Modal, Button } from '../components/ui/index.jsx';

export default function Mesas() {
  const [mesas, setMesas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nueva, setNueva] = useState({ numero: '', capacidad: 4, password: '' });
  const navigate = useNavigate();
  const notify = useToast();

  const cargar = async () => {
    try {
      setMesas(await api.get('/mesas'));
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const agregarMesa = async (e) => {
    e.preventDefault();
    try {
      await api.post('/mesas', {
        numero: nueva.numero || undefined,
        capacidad: nueva.capacidad,
        password: nueva.password,
      });
      notify('Mesa agregada');
      setNueva({ numero: '', capacidad: 4, password: '' });
      setMostrarForm(false);
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const totalPedido = (mesa) => {
    const p = mesa.pedidos?.[0];
    if (!p) return 0;
    return p.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Mesas</h1>
          <p className="subtitle" style={{ margin: 0 }}>Toca una mesa para tomar el pedido o continuar la cuenta.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" icon="cart" onClick={() => navigate('/facturas', { state: { abrirDirecta: true } })}>
            Factura directa
          </Button>
          <Button variant="primary" icon="add" onClick={() => setMostrarForm(true)} title="Agregar mesa" />
        </div>
      </div>

      {mostrarForm && (
        <Modal
          title="Nueva mesa"
          subtitle="La creación de mesas requiere contraseña de administrador."
          onClose={() => setMostrarForm(false)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="mesa-form">Crear mesa</Button>
            </>
          )}
        >
          <form id="mesa-form" onSubmit={agregarMesa}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Número (opcional)</label>
                <input
                  type="number"
                  placeholder="Auto"
                  value={nueva.numero}
                  onChange={(e) => setNueva({ ...nueva, numero: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Capacidad</label>
                <input
                  type="number"
                  value={nueva.capacidad}
                  onChange={(e) => setNueva({ ...nueva, capacidad: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Contraseña de administrador</label>
              <input
                type="password"
                value={nueva.password}
                onChange={(e) => setNueva({ ...nueva, password: e.target.value })}
                required
              />
            </div>
          </form>
        </Modal>
      )}

      {cargando ? (
        <LoadingState />
      ) : mesas.length === 0 ? (
        <p className="empty">No hay mesas. Ejecuta el seed para cargar datos de ejemplo.</p>
      ) : (
        <div className="grid grid-mesas">
          {mesas.map((mesa) => {
            const pedido = mesa.pedidos?.[0];
            const listo = !!pedido?.preparacion?.listo;
            return (
              <div
                key={mesa.id}
                className={`card mesa ${mesa.estado}${listo ? ' LISTO' : ''}`}
                onClick={() => navigate(`/mesas/${mesa.id}/pedido`)}
              >
                <div className="num">{mesa.numero}</div>
                <div className="estado">{listo ? 'Plato listo' : mesa.estado}</div>
                {pedido && (
                  <div style={{ marginTop: 8 }}>
                    <div className="mini">Mesera: {pedido.mesera?.nombre}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
