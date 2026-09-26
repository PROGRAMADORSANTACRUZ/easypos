import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => (user?.permisos || []).includes(codigo);

const VACIO = { nombre: '', nit: '', telefono: '', email: '', direccion: '', activo: true };

export default function Proveedores() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'proveedores.crear');
  const puedeEditar = puede(user, 'proveedores.editar');
  const puedeEliminar = puede(user, 'proveedores.eliminar');

  const [proveedores, setProveedores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [q, setQ] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async (busqueda = q) => {
    try {
      const ruta = busqueda ? `/proveedores?q=${encodeURIComponent(busqueda)}` : '/proveedores';
      setProveedores(await api.get(ruta));
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(''); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const limpiar = () => { setEditId(null); setForm(VACIO); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const empezarEdicion = (p) => {
    setEditId(p.id);
    setForm({
      nombre: p.nombre || '', nit: p.nit || '', telefono: p.telefono || '',
      email: p.email || '', direccion: p.direccion || '', activo: p.activo !== false,
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return notify('El nombre es obligatorio', 'err');
    const payload = {
      nombre: form.nombre.trim(),
      nit: form.nit.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      activo: form.activo,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/proveedores/${editId}`, payload);
        notify('Proveedor actualizado');
      } else {
        await api.post('/proveedores', payload);
        notify('Proveedor creado');
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

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar al proveedor "${p.nombre}"?`)) return;
    try {
      await api.del(`/proveedores/${p.id}`);
      notify('Proveedor eliminado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Directorio de proveedores para compras e insumos."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nuevo proveedor" />}
      />

      <div className="card">
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, NIT o email" style={{ maxWidth: 260 }} />
          <button className="btn btn-primary" type="button" onClick={() => cargar()}>Buscar</button>
          {q && <button className="btn" type="button" onClick={() => { setQ(''); cargar(''); }}>Limpiar</button>}
        </div>
        {proveedores.length === 0 ? (
          <EmptyState
            icon="proveedores"
            title="Sin proveedores"
            description={puedeCrear ? 'Crea tu primer proveedor con el botón “+” de arriba.' : 'Aún no hay proveedores.'}
          />
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Email</th><th>Activo</th><th></th></tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                  <td className="mini">{p.nit || '—'}</td>
                  <td className="mini">{p.telefono || '—'}</td>
                  <td className="mini">{p.email || '—'}</td>
                  <td>{p.activo !== false ? <span className="badge green">Sí</span> : <span className="badge gray">No</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(p)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(p)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(puedeCrear || puedeEditar) && modalAbierto && (
        <Modal
          title={editId ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="prov-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="prov-form" onSubmit={guardar}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Nombre *</label>
                <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Nombre del proveedor" />
              </div>
              <div className="field">
                <label>NIT</label>
                <input value={form.nit} onChange={(e) => set('nit', e.target.value)} />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
                  <span className="mini">Proveedor activo</span>
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
