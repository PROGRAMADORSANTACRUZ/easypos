import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, tenantActual } from '../api.js';
import { esApk, llamarNativo } from '../movil.js';
import { useAuth } from '../App.jsx';

// Solo en la APK de las meseras. Al iniciar sesion arranca el servicio nativo AlertaPlato (notificacion fija,
// como WhatsApp) que consulta los platos listos aunque la pantalla este apagada y hace sonar la campana
// (dos toques y vibracion fuerte) cuando aparece un plato listo nuevo. Aqui solo se arranca/detiene el
// servicio y se muestra el aviso
// en pantalla; la alarma la maneja el servicio. Si la mesera tiene mesas asignadas, el servidor solo
// devuelve esas; sin asignacion, todas.
const CADA_MS = 4000;

export default function AlertaPlatoListo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendientes, setPendientes] = useState([]);
  const aplica = esApk() && (user?.roles || []).includes('MESERO') && (user?.permisos || []).includes('mesas.ver');

  useEffect(() => {
    if (!aplica) return undefined;
    llamarNativo('AlertaPlato', 'vigilar', { url: window.location.origin, tenant: tenantActual() || '' }).catch(() => {});
    return () => { llamarNativo('AlertaPlato', 'detener', {}).catch(() => {}); };
  }, [aplica]);

  useEffect(() => {
    if (!aplica) return undefined;
    let activo = true;
    let consultando = false;
    const consultar = async () => {
      if (consultando || document.visibilityState !== 'visible') return;
      consultando = true;
      try {
        const lista = await api.get('/mesas/platos-listos');
        if (activo) setPendientes(lista);
      } catch {
        // Sin conexion momentanea: se mantiene el aviso actual y se reintenta.
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
    };
  }, [aplica]);

  if (!aplica || !pendientes.length) return null;

  return (
    <div className="alerta-plato-listo" role="alert">
      <strong>¡Plato listo! Entrégalo y confirma la entrega.</strong>
      {pendientes.map((mesa) => (
        <button key={mesa.mesaId} type="button" onClick={() => navigate(`/mesas/${mesa.mesaId}/pedido`)}>
          <span>Mesa {mesa.numero}</span>
          <span className="mini">{mesa.platos.join(' · ') || 'Plato listo'}</span>
        </button>
      ))}
    </div>
  );
}
