import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button } from '../components/ui/index.jsx';

const vacio = { nombre: '', descripcion: '', permisos: [] };

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [rs, ps] = await Promise.all([api.get('/roles'), api.get('/permisos')]);
      setRoles(rs);
      setPermisos(ps);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  // Permisos agrupados por modulo para pintarlos en secciones
  const porModulo = useMemo(() => {
    const map = {};
    for (const p of permisos) {
      const m = p.modulo || 'otros';
      (map[m] = map[m] || []).push(p);
    }
    return map;
  }, [permisos]);

  const togglePermiso = (codigo) => {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.includes(codigo)
        ? f.permisos.filter((c) => c !== codigo)
        : [...f.permisos, codigo],
    }));
  };

  const toggleModulo = (modulo, marcar) => {
    const codigos = porModulo[modulo].map((p) => p.codigo);
    setForm((f) => ({
      ...f,
      permisos: marcar
        ? [...new Set([...f.permisos, ...codigos])]
        : f.permisos.filter((c) => !codigos.includes(c)),
    }));
  };

  const editar = (r) => {
    setEditId(r.id);
    setForm({ nombre: r.nombre, descripcion: r.descripcion || '', permisos: r.permisos });
    setModalAbierto(true);
  };

  const nuevoRol = () => { setEditId(null); setForm(vacio); setModalAbierto(true); };

  const cancelar = () => {
    setEditId(null);
    setForm(vacio);
    setModalAbierto(false);
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/roles/${editId}`, form);
        notify('Rol actualizado');
      } else {
        await api.post('/roles', form);
        notify('Rol creado');
      }
      cancelar();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar el rol "${r.nombre}"? Se quitará de sus usuarios.`)) return;
    try {
      await api.del(`/roles/${r.id}`);
      notify('Rol eliminado');
      if (editId === r.id) cancelar();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles y permisos"
        subtitle="Define qué puede hacer cada rol y asígnalos a los usuarios."
        actions={<Button variant="primary" icon="add" onClick={nuevoRol} title="Nuevo rol" />}
      />

      <div className="card">
        <table>
          <thead>
            <tr><th>Rol</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Permisos</th><th style={{ textAlign: 'right' }}>Usuarios</th><th></th></tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td><span className="badge blue">{r.nombre}</span></td>
                <td className="mini">{r.descripcion || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.permisos.length}</td>
                <td style={{ textAlign: 'right' }}>{r.usuarios}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>{' '}
                  <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)}><Icon name="delete" size={16} /></button>
                </td>
              </tr>
            ))}
            {roles.length === 0 && <tr><td colSpan={5} className="empty">Sin roles.</td></tr>}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <Modal
          title={editId ? `Editar rol: ${form.nombre}` : 'Nuevo rol'}
          onClose={cancelar}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cancelar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="rol-form">{editId ? 'Guardar cambios' : 'Crear rol'}</Button>
            </>
          )}
        >
          <form id="rol-form" onSubmit={guardar}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Nombre</label>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div className="field">
                <label>Descripción</label>
                <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
            </div>

            <label style={{ display: 'block', margin: '10px 0 6px', fontWeight: 600 }}>Permisos</label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {Object.entries(porModulo).map(([modulo, lista]) => {
                const codigos = lista.map((p) => p.codigo);
                const todos = codigos.every((c) => form.permisos.includes(c));
                return (
                  <div key={modulo} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ textTransform: 'capitalize' }}>{modulo}</strong>
                      <button type="button" className="btn btn-sm" onClick={() => toggleModulo(modulo, !todos)}>
                        {todos ? 'Quitar todos' : 'Marcar todos'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                      {lista.map((p) => (
                        <label key={p.codigo} className="mini" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={form.permisos.includes(p.codigo)}
                            onChange={() => togglePermiso(p.codigo)}
                          />
                          {p.codigo.split('.')[1]}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {permisos.length === 0 && <div className="empty">Sin permisos definidos.</div>}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}