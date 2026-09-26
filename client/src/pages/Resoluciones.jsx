import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = {
  prefijo: '', numeroResolucion: '', rangoInicial: '', rangoFinal: '',
  siguienteNumero: '', fechaInicio: '', fechaFin: '',
};

// Convierte una fecha ISO a formato YYYY-MM-DD para <input type=date>
const aDia = (f) => (f ? new Date(f).toISOString().slice(0, 10) : '');

export default function Resoluciones() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'resoluciones.crear');
  const puedeEditar = puede(user, 'resoluciones.editar');
  const puedeEliminar = puede(user, 'resoluciones.eliminar');

  const [resoluciones, setResoluciones] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      setResoluciones(await api.get('/resoluciones'));
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const limpiar = () => { setEditId(null); setForm(VACIO); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const empezarEdicion = (r) => {
    setEditId(r.id);
    setForm({
      prefijo: r.prefijo || '',
      numeroResolucion: r.numeroResolucion || '',
      rangoInicial: r.rangoInicial != null ? String(r.rangoInicial) : '',
      rangoFinal: r.rangoFinal != null ? String(r.rangoFinal) : '',
      siguienteNumero: r.siguienteNumero != null ? String(r.siguienteNumero) : '',
      fechaInicio: aDia(r.fechaInicio),
      fechaFin: aDia(r.fechaFin),
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.prefijo.trim()) return notify('El prefijo es obligatorio', 'err');
    const payload = {
      prefijo: form.prefijo.trim(),
      numeroResolucion: form.numeroResolucion.trim() || null,
      rangoInicial: form.rangoInicial === '' ? null : Number(form.rangoInicial),
      rangoFinal: form.rangoFinal === '' ? null : Number(form.rangoFinal),
      siguienteNumero: form.siguienteNumero === '' ? undefined : Number(form.siguienteNumero),
      fechaInicio: form.fechaInicio || null,
      fechaFin: form.fechaFin || null,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/resoluciones/${editId}`, payload);
        notify('Resolución actualizada');
      } else {
        await api.post('/resoluciones', payload);
        notify('Resolución creada');
      }
      setModalAbierto(false);
      limpiar();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar la resolución "${r.prefijo} ${r.numeroResolucion || ''}"?`)) return;
    try {
      await api.del(`/resoluciones/${r.id}`);
      notify('Resolución eliminada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Resoluciones de facturación (DIAN)"
        subtitle="Prefijos, rangos de numeración y vigencia autorizados por la DIAN."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nueva resolución" />}
      />

      <div className="card">
        {resoluciones.length === 0 ? (
          <EmptyState
            icon="resoluciones"
            title="Sin resoluciones"
            description={puedeCrear ? 'Crea tu primera resolución con el botón “+” de arriba.' : 'Aún no hay resoluciones.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prefijo</th><th>N° resolución</th>
                <th style={{ textAlign: 'right' }}>Rango inicial</th><th style={{ textAlign: 'right' }}>Rango final</th>
                <th style={{ textAlign: 'right' }}>Siguiente</th><th>Vigencia</th><th></th>
              </tr>
            </thead>
            <tbody>
              {resoluciones.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.prefijo || '—'}</td>
                  <td className="mini">{r.numeroResolucion || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.rangoInicial ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.rangoFinal ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.siguienteNumero ?? '—'}</td>
                  <td className="mini">{aDia(r.fechaInicio) || '—'} → {aDia(r.fechaFin) || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(r)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar resolución' : 'Nueva resolución'}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="reso-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="reso-form" onSubmit={guardar}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Prefijo *</label>
                <input value={form.prefijo} onChange={(e) => set('prefijo', e.target.value)} placeholder="Ej. FE" />
              </div>
              <div className="field">
                <label>N° resolución</label>
                <input value={form.numeroResolucion} onChange={(e) => set('numeroResolucion', e.target.value)} />
              </div>
              <div className="field">
                <label>Rango inicial</label>
                <input type="number" value={form.rangoInicial} onChange={(e) => set('rangoInicial', e.target.value)} />
              </div>
              <div className="field">
                <label>Rango final</label>
                <input type="number" value={form.rangoFinal} onChange={(e) => set('rangoFinal', e.target.value)} />
              </div>
              <div className="field">
                <label>Siguiente N°</label>
                <input type="number" value={form.siguienteNumero} onChange={(e) => set('siguienteNumero', e.target.value)} placeholder="(auto)" />
              </div>
              <div className="field"></div>
              <div className="field">
                <label>Fecha inicio</label>
                <input type="date" value={form.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
              </div>
              <div className="field">
                <label>Fecha fin</label>
                <input type="date" value={form.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
