import { useEffect, useRef, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import MapaSeguimiento from './MapaSeguimiento.jsx';
import { overlayCierre } from './ui/index.jsx';

const PASOS = [
  { estado: 'RECIBIDO', label: 'Recibido', desc: 'Tu pedido fue recibido' },
  { estado: 'EN_PREPARACION', label: 'En preparación', desc: 'Estamos preparando tu pedido' },
  { estado: 'EN_CAMINO', label: 'En camino', desc: 'El repartidor va hacia ti' },
  { estado: 'ENTREGADO', label: 'Entregado', desc: '¡Disfruta tu pedido!' },
];

const horaCorta = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return null; }
};

// Vista de seguimiento del pedido para el cliente: línea de estado + mapa en vivo.
// Consulta el estado por polling cada 5 s. Props: pedidoId, token, onClose.
export default function SeguimientoPedido({ pedidoId, token, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const data = await api.get(`/pedidos/${pedidoId}/seguimiento?token=${encodeURIComponent(token)}`);
        if (vivo) { setInfo(data); setError(null); }
      } catch (e) {
        if (vivo) setError(e.message);
      }
    };
    consultar();
    timerRef.current = setInterval(consultar, 5000);
    return () => { vivo = false; clearInterval(timerRef.current); };
  }, [pedidoId, token]);

  const estado = info?.estadoEntrega || 'RECIBIDO';
  const cancelado = estado === 'CANCELADO';
  const idxActual = PASOS.findIndex((p) => p.estado === estado);
  const enCamino = estado === 'EN_CAMINO';
  const destino = info?.latDestino != null && info?.lngDestino != null
    ? { lat: info.latDestino, lng: info.lngDestino } : null;
  const repartidor = info?.latRepartidor != null && info?.lngRepartidor != null
    ? { lat: info.latRepartidor, lng: info.lngRepartidor } : null;

  return (
    <div className="modal-overlay" {...overlayCierre(onClose)}>
      <div className="modal seguimiento-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>
            <Icon name="pedidos" size={18} /> Seguimiento del pedido {info ? `#${info.id}` : ''}
          </h3>
          <button className="btn btn-sm" title="Cerrar" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {error && <p className="empty" style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}

        {cancelado ? (
          <div className="seg-cancelado">
            <Icon name="ban" size={40} />
            <p>Este pedido fue cancelado.</p>
          </div>
        ) : (
          <>
            <div className="seg-timeline">
              {PASOS.map((paso, i) => {
                const hecho = i <= idxActual;
                const activo = i === idxActual;
                return (
                  <div key={paso.estado} className={`seg-paso ${hecho ? 'hecho' : ''} ${activo ? 'activo' : ''}`}>
                    <div className="seg-dot">
                      {hecho ? <Icon name="check" size={14} /> : <span>{i + 1}</span>}
                    </div>
                    <div className="seg-txt">
                      <strong>{paso.label}</strong>
                      <span className="mini">{paso.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {enCamino && info?.repartidor && (
              <div className="seg-repartidor">
                <Icon name="remisiones" size={16} /> Repartidor: <strong>{info.repartidor}</strong>
                {info.ubicacionActualizada && (
                  <span className="mini"> · Actualizado {horaCorta(info.ubicacionActualizada)}</span>
                )}
              </div>
            )}

            {(enCamino || repartidor) && destino && (
              <MapaSeguimiento destino={destino} repartidor={repartidor} height={280} />
            )}
            {(enCamino || repartidor) && destino && !repartidor && (
              <p className="mini" style={{ textAlign: 'center' }}>Esperando la ubicación del repartidor…</p>
            )}
          </>
        )}

        {info && (
          <div className="seg-resumen">
            <div className="row between">
              <span className="mini">{info.items?.length || 0} producto(s)</span>
              <strong>{money(info.total || 0)}</strong>
            </div>
            {info.direccion && <div className="mini"><Icon name="mapa" size={13} /> {info.direccion}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
