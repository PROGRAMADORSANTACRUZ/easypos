import { useEffect, useMemo, useRef, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { LoadingState } from '../components/ui/index.jsx';
import MapaSeguimiento from '../components/MapaSeguimiento.jsx';

const ESTADOS = [
  { estado: 'EN_PREPARACION', label: 'En preparación', icon: 'reload' },
  { estado: 'EN_CAMINO', label: 'En camino', icon: 'remisiones' },
  { estado: 'ENTREGADO', label: 'Entregado', icon: 'check' },
];

const ETIQUETA = {
  RECIBIDO: 'Recibido',
  EN_PREPARACION: 'En preparación',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

// Módulo del repartidor: ve los domicilios pendientes, cambia el estado de la
// entrega y comparte su ubicación GPS en tiempo real mientras entrega.
export default function Repartidor() {
  const notify = useToast();
  const { user } = useAuth() || {};

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState(null);
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [compartiendo, setCompartiendo] = useState(false);
  const [miUbicacion, setMiUbicacion] = useState(null);
  const watchRef = useRef(null);
  const ultimoEnvioRef = useRef(0);

  const cargar = async () => {
    try {
      const data = await api.get('/pedidos');
      setPedidos(data.filter((p) => p.tipo === 'DOMICILIO'));
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Refresca la lista periódicamente para ver nuevos domicilios
  useEffect(() => {
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  // Detiene el rastreo GPS al desmontar
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  const pendientes = useMemo(
    () => pedidos.filter((p) => !['ENTREGADO', 'CANCELADO'].includes(p.estadoEntrega)),
    [pedidos]
  );
  const sel = pedidos.find((p) => p.id === selId) || null;

  const destino = sel?.latDestino != null && sel?.lngDestino != null
    ? { lat: sel.latDestino, lng: sel.lngDestino } : null;

  const totalPedido = (p) => (p.items || []).reduce((s, it) => s + it.precioUnit * it.cantidad, 0);

  const cambiarEstado = async (estadoEntrega) => {
    if (!sel) return;
    try {
      const act = await api.put(`/pedidos/${sel.id}/estado-entrega`, {
        estadoEntrega,
        repartidor: nombre.trim() || null,
      });
      setPedidos((prev) => prev.map((p) => (p.id === act.id ? act : p)));
      notify(`Pedido #${sel.id}: ${ETIQUETA[estadoEntrega]}`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const enviarUbicacion = async (lat, lng, ponerEnCamino) => {
    if (!sel) return;
    try {
      const act = await api.post(`/pedidos/${sel.id}/ubicacion`, {
        lat, lng,
        repartidor: nombre.trim() || null,
        estadoEntrega: ponerEnCamino ? 'EN_CAMINO' : undefined,
      });
      setPedidos((prev) => prev.map((p) => (p.id === act.id ? act : p)));
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const iniciarCompartir = () => {
    if (!sel) return notify('Selecciona un pedido primero', 'err');
    if (!navigator.geolocation) return notify('Este dispositivo no tiene GPS', 'err');
    setCompartiendo(true);
    let primero = true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMiUbicacion({ lat, lng });
        const ahora = Date.now();
        // Envía al servidor como máximo cada 4 s (además del primer punto)
        if (primero || ahora - ultimoEnvioRef.current > 4000) {
          ultimoEnvioRef.current = ahora;
          enviarUbicacion(lat, lng, primero);
          primero = false;
        }
      },
      () => { notify('No pudimos acceder al GPS. Revisa los permisos.', 'err'); detenerCompartir(); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    notify('Compartiendo tu ubicación en vivo', 'ok');
  };

  const detenerCompartir = () => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setCompartiendo(false);
  };

  const seleccionar = (p) => {
    if (compartiendo) detenerCompartir();
    setMiUbicacion(null);
    setSelId(p.id);
  };

  if (cargando) return <LoadingState />;

  return (
    <div>
      <div className="row between">
        <div>
          <h1>Repartidor / Entregas</h1>
          <p className="subtitle">Gestiona los domicilios y comparte tu ubicación en tiempo real.</p>
        </div>
        <button className="btn" onClick={cargar}><Icon name="reload" size={16} /> Actualizar</button>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <label>Tu nombre (repartidor)</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del repartidor" />
      </div>

      <div className="grid grid-2">
        {/* Lista de domicilios pendientes */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Domicilios pendientes ({pendientes.length})</h3>
          {pendientes.length === 0 ? (
            <p className="empty">No hay domicilios pendientes.</p>
          ) : (
            <div className="repartidor-lista">
              {pendientes.map((p) => (
                <button
                  key={p.id}
                  className={`repartidor-item ${selId === p.id ? 'sel' : ''}`}
                  onClick={() => seleccionar(p)}
                >
                  <div className="ri-top">
                    <strong>#{p.id} · {p.cliente || 'Cliente'}</strong>
                    <span className={`badge estado-${p.estadoEntrega}`}>{ETIQUETA[p.estadoEntrega]}</span>
                  </div>
                  <div className="mini">
                    {p.clienteRel?.direccion || 'Sin dirección'} · {money(totalPedido(p))}
                    {p.latDestino != null ? ' · 📍 con ubicación' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalle y acciones */}
        <div className="card">
          {!sel ? (
            <p className="empty">Selecciona un domicilio para gestionarlo.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Pedido #{sel.id}</h3>
              <div className="mini" style={{ marginBottom: 8 }}>
                <div><strong>{sel.cliente || 'Cliente'}</strong></div>
                {sel.clienteRel?.telefono && <div><Icon name="clientes" size={13} /> {sel.clienteRel.telefono}</div>}
                {sel.clienteRel?.direccion && <div><Icon name="mapa" size={13} /> {sel.clienteRel.direccion}{sel.clienteRel.barrio ? `, ${sel.clienteRel.barrio}` : ''}</div>}
                <div>Pago: {sel.metodoPago || '—'}</div>
              </div>

              <div className="repartidor-items">
                {(sel.items || []).map((it) => (
                  <div key={it.id} className="row between mini">
                    <span>{it.cantidad}× {it.producto?.nombre}</span>
                    <span>{money(it.precioUnit * it.cantidad)}</span>
                  </div>
                ))}
                <div className="row between" style={{ fontWeight: 600, marginTop: 6 }}>
                  <span>Total</span><span>{money(totalPedido(sel))}</span>
                </div>
              </div>

              <div className="repartidor-estados">
                {ESTADOS.map((e) => (
                  <button
                    key={e.estado}
                    className={`btn btn-sm ${sel.estadoEntrega === e.estado ? 'btn-ok' : ''}`}
                    onClick={() => cambiarEstado(e.estado)}
                  >
                    <Icon name={e.icon} size={15} /> {e.label}
                  </button>
                ))}
              </div>

              {destino ? (
                <>
                  <MapaSeguimiento destino={destino} repartidor={miUbicacion} height={260} />
                  {!compartiendo ? (
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={iniciarCompartir}>
                      <Icon name="gps" size={16} /> Iniciar entrega y compartir ubicación
                    </button>
                  ) : (
                    <button className="btn btn-danger" style={{ width: '100%', marginTop: 10 }} onClick={detenerCompartir}>
                      <Icon name="ban" size={16} /> Detener rastreo
                    </button>
                  )}
                </>
              ) : (
                <p className="mini" style={{ marginTop: 10 }}>
                  <Icon name="mapa" size={14} /> Este pedido no tiene ubicación de entrega registrada. Aún puedes
                  compartir tu ubicación para el seguimiento.
                  {!compartiendo ? (
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={iniciarCompartir}>
                      <Icon name="gps" size={16} /> Iniciar entrega y compartir ubicación
                    </button>
                  ) : (
                    <button className="btn btn-danger" style={{ width: '100%', marginTop: 10 }} onClick={detenerCompartir}>
                      <Icon name="ban" size={16} /> Detener rastreo
                    </button>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
