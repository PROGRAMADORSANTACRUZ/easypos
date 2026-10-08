import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { LoadingState, Modal, Button } from '../components/ui/index.jsx';

export default function Mesas() {
  const [mesas, setMesas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('TOTAL');
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nueva, setNueva] = useState({ numero: '', capacidad: 4, password: '' });
  const [reservarMesa, setReservarMesa] = useState(null);
  const [detalleReserva, setDetalleReserva] = useState(null);
  const [formReserva, setFormReserva] = useState({ nombre: '', telefono: '', fechaHora: '', personas: 2, notas: '' });
  const [guardandoReserva, setGuardandoReserva] = useState(false);
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

  const abrirFormularioReserva = (mesa) => {
    setFormReserva({ nombre: '', telefono: '', fechaHora: '', personas: Math.min(2, mesa.capacidad), notas: '' });
    setReservarMesa(mesa);
  };

  const crearReserva = async (e) => {
    e.preventDefault();
    if (!reservarMesa) return;
    setGuardandoReserva(true);
    try {
      await api.post(`/mesas/${reservarMesa.id}/reservar`, {
        ...formReserva,
        fechaHora: new Date(formReserva.fechaHora).toISOString(),
      });
      notify(`Reserva creada para la mesa ${reservarMesa.numero}`);
      setReservarMesa(null);
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setGuardandoReserva(false);
    }
  };

  const cancelarReserva = async (mesa) => {
    try {
      await api.post(`/mesas/${mesa.id}/cancelar-reserva`, {});
      notify(`Reserva de la mesa ${mesa.numero} cancelada`);
      setDetalleReserva(null);
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    }
  };

  const fechaLocalMinima = () => {
    const ahora = new Date();
    return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const totalPedido = (mesa) => {
    const p = mesa.pedidos?.[0];
    if (!p) return 0;
    return p.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  };

  const resumenMesas = [
    { etiqueta: 'Total', estado: 'TOTAL', cantidad: mesas.length },
    { etiqueta: 'Disponibles', estado: 'LIBRE', cantidad: mesas.filter((mesa) => mesa.estado === 'LIBRE').length },
    { etiqueta: 'Ocupadas', estado: 'OCUPADA', cantidad: mesas.filter((mesa) => mesa.estado === 'OCUPADA').length },
    { etiqueta: 'Reservadas', estado: 'RESERVADA', cantidad: mesas.filter((mesa) => mesa.estado === 'RESERVADA').length },
  ];
  const mesasFiltradas = filtroEstado === 'TOTAL' ? mesas : mesas.filter((mesa) => mesa.estado === filtroEstado);

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

      {!cargando && mesas.length > 0 && (
        <section className="mesa-resumen" aria-label="Resumen de mesas">
          {resumenMesas.map((dato) => (
            <button
              key={dato.estado}
              type="button"
              className={`mesa-resumen__item mesa-resumen__item--${dato.estado.toLowerCase()}${filtroEstado === dato.estado ? ' is-active' : ''}`}
              aria-pressed={filtroEstado === dato.estado}
              onClick={() => setFiltroEstado(dato.estado)}
            >
              <span>{dato.etiqueta}</span>
              <strong>{dato.cantidad}</strong>
            </button>
          ))}
        </section>
      )}

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

      {reservarMesa && (
        <Modal
          title={`Reservar mesa ${reservarMesa.numero}`}
          subtitle={`Capacidad máxima: ${reservarMesa.capacidad} personas.`}
          onClose={() => setReservarMesa(null)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setReservarMesa(null)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="reserva-mesa-form" disabled={guardandoReserva}>
                {guardandoReserva ? 'Guardando…' : 'Confirmar reserva'}
              </Button>
            </>
          )}
        >
          <form id="reserva-mesa-form" onSubmit={crearReserva}>
            <div className="field">
              <label>Nombre</label>
              <input autoFocus required maxLength={150} value={formReserva.nombre} onChange={(e) => setFormReserva({ ...formReserva, nombre: e.target.value })} />
            </div>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Teléfono</label>
                <input maxLength={50} value={formReserva.telefono} onChange={(e) => setFormReserva({ ...formReserva, telefono: e.target.value })} />
              </div>
              <div className="field">
                <label>Personas</label>
                <input type="number" required min="1" max={reservarMesa.capacidad} value={formReserva.personas} onChange={(e) => setFormReserva({ ...formReserva, personas: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Fecha y hora</label>
              <input type="datetime-local" required min={fechaLocalMinima()} value={formReserva.fechaHora} onChange={(e) => setFormReserva({ ...formReserva, fechaHora: e.target.value })} />
            </div>
            <div className="field">
              <label>Nota</label>
              <textarea rows="2" maxLength={500} value={formReserva.notas} onChange={(e) => setFormReserva({ ...formReserva, notas: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}

      {detalleReserva && (
        <Modal
          title={`Reserva · Mesa ${detalleReserva.numero}`}
          onClose={() => setDetalleReserva(null)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => cancelarReserva(detalleReserva)}>Cancelar reserva</Button>
              <Button variant="primary" onClick={() => navigate(`/mesas/${detalleReserva.id}/pedido`)}>Iniciar pedido</Button>
            </>
          )}
        >
          <div className="reserva-detalle">
            <strong>{detalleReserva.reservaNombre}</strong>
            <span>{new Date(detalleReserva.reservaFechaHora).toLocaleString('es-CO')}</span>
            <span>{detalleReserva.reservaPersonas} personas</span>
            {detalleReserva.reservaTelefono && <span>{detalleReserva.reservaTelefono}</span>}
            {detalleReserva.reservaNotas && <p>{detalleReserva.reservaNotas}</p>}
          </div>
        </Modal>
      )}

      {cargando ? (
        <LoadingState />
      ) : mesas.length === 0 ? (
        <p className="empty">No hay mesas. Ejecuta el seed para cargar datos de ejemplo.</p>
      ) : mesasFiltradas.length === 0 ? (
        <p className="empty">No hay mesas {filtroEstado.toLowerCase()}.</p>
      ) : (
        <div className="grid grid-mesas">
          {mesasFiltradas.map((mesa) => {
            const pedido = mesa.pedidos?.[0];
            const listo = !!pedido?.preparacion?.listo;
            return (
              <div
                key={mesa.id}
                className={`card mesa ${mesa.estado}${listo ? ' LISTO' : ''}`}
                onClick={() => mesa.estado === 'RESERVADA'
                  ? setDetalleReserva(mesa)
                  : navigate(`/mesas/${mesa.id}/pedido`)}
              >
                <div className="num">{mesa.numero}</div>
                <div className="estado">{listo ? 'Plato listo' : mesa.estado}</div>
                {mesa.estado === 'RESERVADA' ? (
                  <div className="mini reserva-resumen">
                    {mesa.reservaNombre}<br />
                    {new Date(mesa.reservaFechaHora).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                ) : mesa.estado === 'LIBRE' ? (
                  <button
                    type="button"
                    className="btn btn-sm mesa-reservar-btn"
                    onClick={(e) => { e.stopPropagation(); abrirFormularioReserva(mesa); }}
                  >
                    Reservar
                  </button>
                ) : null}
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
