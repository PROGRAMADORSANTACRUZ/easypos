import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../App.jsx';

const ACCIONES = ['', 'LOGIN', 'CREAR', 'EDITAR', 'ELIMINAR', 'ANULAR', 'ABONAR'];

const colorAccion = (a) => {
  if (a === 'ELIMINAR' || a === 'ANULAR') return 'red';
  if (a === 'CREAR') return 'green';
  if (a === 'LOGIN') return 'blue';
  return 'orange';
};

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [filtro, setFiltro] = useState({ accion: '', entidad: '' });
  const notify = useToast();

  const cargar = async () => {
    try {
      const params = new URLSearchParams();
      if (filtro.accion) params.set('accion', filtro.accion);
      if (filtro.entidad) params.set('entidad', filtro.entidad);
      const q = params.toString();
      const data = await api.get(`/auditoria${q ? `?${q}` : ''}`);
      setRegistros(data);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, [filtro]);

  const fecha = (iso) => new Date(iso).toLocaleString('es-CO');

  return (
    <div>
      <h1>Auditoría</h1>
      <p className="subtitle">Registro de acciones realizadas en el sistema.</p>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Acción</label>
            <select value={filtro.accion} onChange={(e) => setFiltro({ ...filtro, accion: e.target.value })}>
              {ACCIONES.map((a) => <option key={a} value={a}>{a || 'Todas'}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Entidad</label>
            <input
              placeholder="Ej. Usuario, Rol"
              value={filtro.entidad}
              onChange={(e) => setFiltro({ ...filtro, entidad: e.target.value })}
            />
          </div>
          <div className="field" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="btn" onClick={cargar}>Actualizar</button>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="mini">{fecha(r.createdAt)}</td>
                <td>{r.usuario || '—'}{r.usuarioLogin ? <span className="mini"> ({r.usuarioLogin})</span> : ''}</td>
                <td><span className={`badge ${colorAccion(r.accion)}`}>{r.accion}</span></td>
                <td className="mini">{r.entidad || '—'}{r.entidadId ? ` #${r.entidadId}` : ''}</td>
                <td className="mini">{r.detalle || '—'}</td>
                <td className="mini">{r.ip || '—'}</td>
              </tr>
            ))}
            {registros.length === 0 && <tr><td colSpan={6} className="empty">Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
