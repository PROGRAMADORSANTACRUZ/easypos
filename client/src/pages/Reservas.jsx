import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, useToast } from '../App.jsx';
import { Button, EmptyState, LoadingState, PageHeader } from '../components/ui/index.jsx';
import { diaColombia } from '../fechaComercial.js';

const ESTADOS = {
  CONFIRMADA: { etiqueta: 'Confirmada', clase: 'orange' },
  CUMPLIDA: { etiqueta: 'Llegó', clase: 'green' },
  NO_ASISTIO: { etiqueta: 'No asistió', clase: 'gray' },
  CANCELADA: { etiqueta: 'Cancelada', clase: 'red' },
};

// Reservas que los clientes hacen desde la pagina publica /reservar/<restaurante>.
export default function Reservas() {
  const { user } = useAuth();
  const notify = useToast();
  const [desde, setDesde] = useState(() => diaColombia(new Date()));
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cambiando, setCambiando] = useState(null);
  const enlace = `${window.location.origin}/reservar${user?.restaurante?.slug ? `/${encodeURIComponent(user.restaurante.slug)}` : ''}`;

  const cargar = async () => {
    try {
      const filtros = new URLSearchParams({ desde, ...(hasta && { hasta }), ...(estado && { estado }) });
      setReservas(await api.get(`/reservas?${filtros}`));
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    setCargando(true);
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, [desde, hasta, estado]);

  const cambiarEstado = async (reserva, estado) => {
    try {
      setCambiando(reserva.id);
      await api.put(`/reservas/${reserva.id}/estado`, { estado });
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCambiando(null);
    }
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      notify('Enlace de reservas copiado');
    } catch {
      notify(enlace);
    }
  };

  const activas = reservas.filter((r) => r.estado === 'CONFIRMADA');

  return (
    <div>
      <PageHeader
        title="Reservas"
        subtitle="Todas las reservas que hacen los clientes desde la página pública, de hoy en adelante. Comparte el enlace en Instagram o WhatsApp."
        actions={<Button icon="copy" onClick={copiarEnlace}>Copiar enlace de reservas</Button>}
      />
      <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="reservas-desde">Desde</label>
          <input id="reservas-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value || diaColombia(new Date()))} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="reservas-hasta">Hasta</label>
          <input id="reservas-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="reservas-estado">Estado</label>
          <select id="reservas-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([valor, { etiqueta }]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </select>
        </div>
        <span className="mini">{reservas.length} reservas · {activas.length} por llegar · {activas.reduce((total, r) => total + r.personas, 0)} personas</span>
      </div>
      {cargando ? <LoadingState label="Cargando reservas..." /> : reservas.length === 0 ? (
        <EmptyState icon="mesas" title="Sin reservas" description="No hay reservas para los filtros seleccionados." />
      ) : (
        <div className="card crud-table-scroll" role="region" aria-label="Tabla de reservas" tabIndex={0}>
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Mesa</th><th>Cliente</th><th>Contacto</th><th>Personas</th><th>Comentarios</th><th>Estado</th><th></th></tr></thead>
            <tbody>{reservas.map((r) => {
              const estadoReserva = ESTADOS[r.estado] || ESTADOS.CONFIRMADA;
              return (
                <tr key={r.id}>
                  <td>{new Date(r.fechaHora).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: '2-digit', month: 'short' })}</td>
                  <td><strong>{new Date(r.fechaHora).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}</strong></td>
                  <td>Mesa {r.mesa?.numero}<div className="mini">{r.zona}</div></td>
                  <td>{r.nombre}</td>
                  <td>{r.celular}<div className="mini">{r.email}</div></td>
                  <td>{r.personas}</td>
                  <td>{r.comentarios || '—'}</td>
                  <td><span className={`badge ${estadoReserva.clase}`}>{estadoReserva.etiqueta}</span></td>
                  <td>{r.estado === 'CONFIRMADA' && (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <Button size="sm" variant="success" disabled={cambiando !== null} onClick={() => cambiarEstado(r, 'CUMPLIDA')}>Llegó</Button>
                      <Button size="sm" disabled={cambiando !== null} onClick={() => cambiarEstado(r, 'NO_ASISTIO')}>No asistió</Button>
                      <Button size="sm" variant="ghost" disabled={cambiando !== null} onClick={() => cambiarEstado(r, 'CANCELADA')}>Cancelar</Button>
                    </div>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
