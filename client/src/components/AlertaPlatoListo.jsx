import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { esApk, llamarNativo } from '../movil.js';
import { platosListos, tienePlatoListo } from '../platosListos.js';
import { useAuth } from '../App.jsx';

// Solo en la APK de las meseras: mientras haya platos listos sin entregar suena una alarma fuerte y
// vibra sin parar (plugin nativo AlertaPlato). Se apaga sola cuando la mesera confirma la entrega.
// Si la mesera tiene mesas asignadas solo la avisan sus mesas; sin asignacion, todas.
const CADA_MS = 4000;
const alarma = (metodo) => llamarNativo('AlertaPlato', metodo, {}).catch(() => {});

export default function AlertaPlatoListo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendientes, setPendientes] = useState([]);
  const sonando = useRef(false);
  const aplica = esApk() && (user?.roles || []).includes('MESERO') && (user?.permisos || []).includes('mesas.ver');
  const mesaIds = (user?.mesaIds || []).join(',');

  useEffect(() => {
    if (!aplica) return undefined;
    let activo = true;
    let consultando = false;
    const asignadas = mesaIds ? mesaIds.split(',').map(Number) : [];
    const consultar = async () => {
      if (consultando || document.visibilityState !== 'visible') return;
      consultando = true;
      try {
        const mesas = await api.get('/mesas');
        if (!activo) return;
        const lista = mesas
          .filter((mesa) => (!asignadas.length || asignadas.includes(mesa.id)) && tienePlatoListo(mesa))
          .map((mesa) => ({ id: mesa.id, numero: mesa.numero, platos: platosListos(mesa) }));
        setPendientes(lista);
        if (lista.length && !sonando.current) { sonando.current = true; alarma('iniciar'); }
        if (!lista.length && sonando.current) { sonando.current = false; alarma('detener'); }
      } catch {
        // Sin conexion momentanea: se mantiene el estado actual y se reintenta.
      } finally {
        consultando = false;
      }
    };
    consultar();
    const intervalo = setInterval(consultar, CADA_MS);
    document.addEventListener('visibilitychange', consultar);
    return () => {
      activo = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', consultar);
      if (sonando.current) { sonando.current = false; alarma('detener'); }
    };
  }, [aplica, mesaIds]);

  if (!aplica || !pendientes.length) return null;

  return (
    <div className="alerta-plato-listo" role="alert">
      <strong>¡Plato listo! Entrégalo y confirma la entrega.</strong>
      {pendientes.map((mesa) => (
        <button key={mesa.id} type="button" onClick={() => navigate(`/mesas/${mesa.id}/pedido`)}>
          <span>Mesa {mesa.numero}</span>
          <span className="mini">{mesa.platos.join(' · ') || 'Plato listo'}</span>
        </button>
      ))}
    </div>
  );
}
