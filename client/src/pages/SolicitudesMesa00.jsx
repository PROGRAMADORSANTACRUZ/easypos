import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useToast } from '../App.jsx';
import { Button, EmptyState, LoadingState, Modal, PageHeader } from '../components/ui/index.jsx';

const fechaHora = (valor) => new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota' });

export default function SolicitudesMesa00() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [stock, setStock] = useState([]);
  const [estado, setEstado] = useState('PENDIENTE');
  const [rechazo, setRechazo] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [procesando, setProcesando] = useState(null);
  const [cargando, setCargando] = useState(true);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [filas, existencias] = await Promise.all([
        api.get(`/mesa00/solicitudes?estado=${estado}`),
        api.get('/mesa00/stock'),
      ]);
      setSolicitudes(filas);
      setStock(existencias);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
  }, [estado]);

  const aceptar = async (solicitud) => {
    setProcesando(solicitud.id);
    try {
      await api.post(`/mesa00/solicitudes/${solicitud.id}/aprobar`, {});
      notify(`${solicitud.cantidad} ${solicitud.productoNombre} movido a Mesa 00`);
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  const rechazar = async (event) => {
    event.preventDefault();
    if (!rechazo || !respuesta.trim()) return notify('Indica el motivo del rechazo', 'err');
    setProcesando(rechazo.id);
    try {
      await api.post(`/mesa00/solicitudes/${rechazo.id}/rechazar`, { respuesta: respuesta.trim() });
      notify('Solicitud rechazada; la comanda original no cambió');
      setRechazo(null);
      setRespuesta('');
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setProcesando(null);
    }
  };

  if (cargando) return <LoadingState label="Cargando solicitudes de Mesa 00…" />;

  return (
    <div>
      <PageHeader
        title="Mesa 00"
        subtitle="Solicitudes de traslado y productos disponibles para reutilizar."
        actions={<Button icon="reload" title="Actualizar" aria-label="Actualizar" onClick={cargar} />}
      />

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Existencias disponibles</h2>
        {stock.length === 0 ? <p className="empty">Mesa 00 no tiene productos disponibles.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Producto</th><th>Disponible</th><th>Precio actual</th><th>Actualizado</th></tr></thead>
              <tbody>{stock.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td>{item.cantidadMesa00}</td>
                  <td>{money(item.precio)}</td>
                  <td>{fechaHora(item.actualizado)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Solicitudes de movimiento</h2>
          <select aria-label="Estado de solicitudes" value={estado} onChange={(event) => setEstado(event.target.value)}>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
            <option value="TODAS">Todas</option>
          </select>
        </div>
        {solicitudes.length === 0 ? <EmptyState title="Sin solicitudes" description="No hay solicitudes para este estado." /> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table>
              <thead><tr><th>Fecha</th><th>Origen</th><th>Producto</th><th>Cantidad</th><th>Solicitó</th><th>Estado</th><th></th></tr></thead>
              <tbody>{solicitudes.map((solicitud) => (
                <tr key={solicitud.id}>
                  <td>{fechaHora(solicitud.createdAt)}</td>
                  <td>Mesa {solicitud.pedido?.mesa?.numero ?? '—'} · Pedido #{solicitud.pedidoId}</td>
                  <td>{solicitud.productoNombre}</td>
                  <td>{solicitud.cantidad}</td>
                  <td>{solicitud.solicitanteNombre} <span className="mini">({solicitud.solicitadoPor})</span></td>
                  <td>
                    <span className={`badge ${solicitud.estado === 'APROBADA' ? 'green' : solicitud.estado === 'RECHAZADA' ? 'red' : 'orange'}`}>
                      {solicitud.estado}
                    </span>
                    {solicitud.respuesta && <div className="mini">{solicitud.respuesta}</div>}
                    {solicitud.decisionNombre && <div className="mini">{solicitud.decisionNombre} · {fechaHora(solicitud.decididoAt)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {solicitud.estado === 'PENDIENTE' && <div className="row" style={{ gap: 6 }}>
                      <Button size="sm" variant="success" icon="check" loading={procesando === solicitud.id} disabled={procesando !== null} onClick={() => aceptar(solicitud)}>Aceptar</Button>
                      <Button size="sm" variant="danger" icon="close" disabled={procesando !== null} onClick={() => { setRechazo(solicitud); setRespuesta(''); }}>Rechazar</Button>
                    </div>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {rechazo && <Modal title="Rechazar traslado" subtitle={`${rechazo.cantidad} × ${rechazo.productoNombre}`} onClose={() => { if (!procesando) setRechazo(null); }}
        footer={<><Button variant="ghost" disabled={procesando !== null} onClick={() => setRechazo(null)}>Cancelar</Button>
          <Button variant="danger" icon="close" loading={procesando === rechazo.id} disabled={procesando !== null || !respuesta.trim()} onClick={rechazar}>Confirmar rechazo</Button></>}>
        <form onSubmit={rechazar}>
          <div className="field"><label htmlFor="mesa00-respuesta">Motivo del rechazo *</label>
            <textarea id="mesa00-respuesta" rows={3} maxLength={500} required value={respuesta} onChange={(event) => setRespuesta(event.target.value)} /></div>
        </form>
      </Modal>}
    </div>
  );
}