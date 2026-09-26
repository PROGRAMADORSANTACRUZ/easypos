import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);

const VACIO = { mac: '', equipo: '', numeroCaja: '', activo: true };

// Parámetros → Asignación de cajas: relaciona la MAC de cada equipo con su número de caja.
export default function AsignacionCajas() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'empresa.crear') || puede(user, 'empresa.ver');
  const puedeEditar = puede(user, 'empresa.editar') || puede(user, 'empresa.ver');
  const puedeEliminar = puede(user, 'empresa.eliminar') || puede(user, 'empresa.ver');

  const [rows, setRows] = useState([]);
  const [macActual, setMacActual] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const [lista, mac] = await Promise.all([
        api.get('/asignacion-cajas'),
        api.get('/asignacion-cajas/mac-actual').catch(() => ({ mac: null })),
      ]);
      setRows(Array.isArray(lista) ? lista : []);
      setMacActual(mac?.mac || null);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const nuevo = (macPrefill = '') => {
    setEditId(null);
    setForm({ ...VACIO, mac: macPrefill });
    setModal(true);
  };
  const editar = (r) => {
    setEditId(r.id);
    setForm({ mac: r.mac || '', equipo: r.equipo || '', numeroCaja: r.numeroCaja || '', activo: r.activo !== false });
    setModal(true);
  };
  const cerrar = () => { setModal(false); setEditId(null); setForm(VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.mac.trim()) return notify('La MAC es obligatoria', 'err');
    if (!form.numeroCaja.trim()) return notify('El número de caja es obligatorio', 'err');
    const payload = {
      mac: form.mac.trim(),
      equipo: form.equipo.trim() || null,
      numeroCaja: form.numeroCaja.trim(),
      activo: !!form.activo,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/asignacion-cajas/${editId}`, payload);
        notify('Asignación actualizada');
      } else {
        await api.post('/asignacion-cajas', payload);
        notify('Asignación creada');
      }
      cerrar();
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar la asignación de la caja ${r.numeroCaja}?`)) return;
    try {
      await api.del(`/asignacion-cajas/${r.id}`);
      notify('Asignación eliminada');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const macRegistrada = macActual && rows.some((r) => (r.mac || '').toUpperCase() === macActual.toUpperCase());
  const cajaDeEsteEquipo = macActual && rows.find((r) => (r.mac || '').toUpperCase() === macActual.toUpperCase());

  return (
    <div>
      <PageHeader
        title="Asignación de cajas"
        subtitle="Registra la MAC de cada equipo y el número de caja que le corresponde."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={() => nuevo()} title="Nueva asignación" />}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>MAC de este equipo</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{macActual || 'No detectada'}</div>
            {cajaDeEsteEquipo && (
              <div style={{ marginTop: 4, color: 'var(--ok, #2e7d32)' }}>Asignado a Caja {cajaDeEsteEquipo.numeroCaja}</div>
            )}
          </div>
          {macActual && !macRegistrada && puedeCrear && (
            <Button variant="secondary" icon="add" onClick={() => nuevo(macActual)}>Asignar caja a este equipo</Button>
          )}
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Caja</th>
              <th>MAC</th>
              <th>Equipo</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const esEste = macActual && (r.mac || '').toUpperCase() === macActual.toUpperCase();
              return (
                <tr key={r.id} className={esEste ? 'fila-activa' : undefined}>
                  <td style={{ fontWeight: 600 }}>{r.numeroCaja}{esEste && ' ·  este equipo'}</td>
                  <td style={{ letterSpacing: 1 }}>{r.mac}</td>
                  <td>{r.equipo || '—'}</td>
                  <td>{r.activo ? 'Sí' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5}><EmptyState icon="caja" title="Sin asignaciones" description="Registra la MAC de este equipo para asignarle un número de caja." /></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Editar asignación' : 'Nueva asignación'}
          onClose={cerrar}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="asig-form" disabled={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="asig-form" onSubmit={guardar}>
            <div className="field">
              <label>MAC del equipo</label>
              <div className="row" style={{ gap: 8 }}>
                <input placeholder="Ej. A1:B2:C3:D4:E5:F6" value={form.mac} onChange={(e) => set('mac', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase', flex: 1 }} autoFocus />
                {macActual && <Button variant="secondary" size="sm" type="button" onClick={() => set('mac', macActual)}>Usar la de este equipo</Button>}
              </div>
            </div>
            <div className="field">
              <label>Nombre del equipo (opcional)</label>
              <input placeholder="Ej. CAJA MOSTRADOR" value={form.equipo} onChange={(e) => set('equipo', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field">
              <label>Número de caja</label>
              <input placeholder="Ej. 1" value={form.numeroCaja} onChange={(e) => set('numeroCaja', e.target.value)} />
            </div>
            <div className="field">
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.activo} onChange={(e) => set('activo', e.target.checked)} />
                Activo
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
