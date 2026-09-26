import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useAuth, useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const uVacio = { nombre: '', usuario: '', correo: '', password: '', roles: [], modulosFacturacion: [], activo: true };
const modulosVenta = [
  { codigo: 'facturas', nombre: 'Facturas' },
  { codigo: 'factura_venta', nombre: 'Factura de venta' },
  { codigo: 'cortesias', nombre: 'Cortesías' },
];

export default function Usuarios() {
  const { user } = useAuth();
  const esAdmin = user?.roles?.includes('ADMIN');
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [meseras, setMeseras] = useState([]);
  const [cocineros, setCocineros] = useState([]);
  const [uForm, setUForm] = useState(uVacio);
  const [editId, setEditId] = useState(null);
  const [mForm, setMForm] = useState({ nombre: '', codigo: '' });
  const [cForm, setCForm] = useState({ nombre: '', codigo: '' });
  const [modalUsuario, setModalUsuario] = useState(false);
  const [modalMesera, setModalMesera] = useState(false);
  const [modalCocinero, setModalCocinero] = useState(false);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [us, rs, ms, cs] = await Promise.all([
        api.get('/usuarios'),
        api.get('/roles'),
        api.get('/meseras'),
        api.get('/cocineros').catch(() => []),
      ]);
      setUsuarios(us);
      setRoles(rs);
      setMeseras(ms);
      setCocineros(cs);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const toggleRol = (nombre) => {
    setUForm((f) => ({
      ...f,
      roles: f.roles.includes(nombre) ? f.roles.filter((r) => r !== nombre) : [...f.roles, nombre],
    }));
  };

  const editarUsuario = (u) => {
    setEditId(u.id);
    setUForm({
      nombre: u.nombre,
      usuario: u.usuario,
      correo: u.correo || '',
      password: '',
      roles: u.roles || [],
      modulosFacturacion: u.modulosFacturacion || [],
      activo: u.activo,
    });
    setModalUsuario(true);
  };

  const nuevoUsuario = () => { setEditId(null); setUForm(uVacio); setModalUsuario(true); };

  const cancelarEdicion = () => {
    setEditId(null);
    setUForm(uVacio);
    setModalUsuario(false);
  };

  const guardarUsuario = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        const payload = { ...uForm };
        if (!payload.password) delete payload.password; // vacio = mantener
        await api.put(`/usuarios/${editId}`, payload);
        notify('Usuario actualizado');
      } else {
        await api.post('/usuarios', uForm);
        notify('Usuario creado');
      }
      cancelarEdicion();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const alternarActivo = async (u) => {
    try {
      await api.put(`/usuarios/${u.id}`, { activo: !u.activo });
      notify(u.activo ? 'Usuario inactivado' : 'Usuario activado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminarUsuario = async (u) => {
    if (!confirm(`¿Eliminar al usuario "${u.nombre}"?`)) return;
    try {
      await api.del(`/usuarios/${u.id}`);
      notify('Usuario eliminado');
      if (editId === u.id) cancelarEdicion();
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const crearMesera = async (e) => {
    e.preventDefault();
    try {
      await api.post('/meseras', mForm);
      setMForm({ nombre: '', codigo: '' });
      setModalMesera(false);
      notify('Mesera agregada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminarMesera = async (m) => {
    if (!confirm(`¿Eliminar a "${m.nombre}"?`)) return;
    try {
      await api.del(`/meseras/${m.id}`);
      notify('Mesera eliminada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const crearCocinero = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cocineros', cForm);
      setCForm({ nombre: '', codigo: '' });
      setModalCocinero(false);
      notify('Cocinero agregado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminarCocinero = async (c) => {
    if (!confirm(`¿Eliminar a "${c.nombre}"?`)) return;
    try {
      await api.del(`/cocineros/${c.id}`);
      notify('Cocinero eliminado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Personal que toma pedidos y usuarios que inician sesión en el sistema."
        actions={(
          <>
            <Button variant="secondary" icon="mesas" onClick={() => { setMForm({ nombre: '', codigo: '' }); setModalMesera(true); }}>Nueva mesera</Button>
            <Button variant="secondary" icon="cocina" onClick={() => { setCForm({ nombre: '', codigo: '' }); setModalCocinero(true); }}>Nuevo cocinero</Button>
            {esAdmin && <Button variant="primary" icon="add" onClick={nuevoUsuario} title="Nuevo usuario" />}
          </>
        )}
      />

      <div className="grid grid-2">
        {/* Usuarios del sistema */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Usuarios del sistema</h3>
          <table>
            <thead>
              <tr><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Roles</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                  <td className="mini">{u.usuario}</td>
                  <td className="mini">{u.correo || '—'}</td>
                  <td>
                    {(u.roles || []).map((r) => <span key={r} className="badge blue" style={{ marginRight: 4 }}>{r}</span>)}
                    {(!u.roles || u.roles.length === 0) && <span className="mini">—</span>}
                  </td>
                  <td>
                    <span className={`badge ${u.activo ? 'green' : 'red'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {esAdmin && <><button className="btn btn-sm" title="Editar" onClick={() => editarUsuario(u)}><Icon name="edit" size={16} /></button>{' '}
                    <button className="btn btn-sm" title={u.activo ? 'Inactivar' : 'Activar'} onClick={() => alternarActivo(u)}>
                      {u.activo ? <Icon name="ban" size={16} /> : <Icon name="check" size={16} />}
                    </button>{' '}
                    <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminarUsuario(u)}><Icon name="delete" size={16} /></button></>}
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && <tr><td colSpan={6} className="empty">Sin usuarios.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Personal / meseras */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Personal (meseras)</h3>
          <table>
            <thead>
              <tr><th>Código</th><th>Nombre</th><th></th></tr>
            </thead>
            <tbody>
              {meseras.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge orange">#{m.codigo}</span></td>
                  <td style={{ fontWeight: 600 }}>{m.nombre}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminarMesera(m)}><Icon name="delete" size={16} /></button></td>
                </tr>
              ))}
              {meseras.length === 0 && <tr><td colSpan={3} className="empty">Sin personal.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Personal / cocineros */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Personal (cocineros)</h3>
          <table>
            <thead>
              <tr><th>Código</th><th>Nombre</th><th></th></tr>
            </thead>
            <tbody>
              {cocineros.map((c) => (
                <tr key={c.id}>
                  <td><span className="badge orange">#{c.codigo}</span></td>
                  <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminarCocinero(c)}><Icon name="delete" size={16} /></button></td>
                </tr>
              ))}
              {cocineros.length === 0 && <tr><td colSpan={3} className="empty">Sin personal.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalUsuario && (
        <Modal
          title={editId ? `Editar usuario: ${uForm.usuario}` : 'Nuevo usuario'}
          onClose={cancelarEdicion}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cancelarEdicion}>Cancelar</Button>
              <Button variant="primary" type="submit" form="usuario-form">{editId ? 'Guardar cambios' : 'Crear usuario'}</Button>
            </>
          )}
        >
          <form id="usuario-form" onSubmit={guardarUsuario}>
            <div className="field">
              <label>Nombre completo</label>
              <input value={uForm.nombre} onChange={(e) => setUForm({ ...uForm, nombre: e.target.value })} required />
            </div>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Usuario (acceso)</label>
                <input value={uForm.usuario} onChange={(e) => setUForm({ ...uForm, usuario: e.target.value })} required />
              </div>
              <div className="field">
                <label>Correo</label>
                <input type="email" value={uForm.correo} onChange={(e) => setUForm({ ...uForm, correo: e.target.value })} placeholder="correo@ejemplo.com" />
              </div>
            </div>
            <div className="field">
              <label>{editId ? 'Contraseña (dejar vacío para mantener)' : 'Contraseña'}</label>
              <input
                type="password"
                value={uForm.password}
                onChange={(e) => setUForm({ ...uForm, password: e.target.value })}
                placeholder={editId ? '••••••' : ''}
                required={!editId}
              />
              <span className="mini">Mínimo 6 caracteres, con letras y números.</span>
            </div>
            <div className="field">
              <label>Roles</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {roles.map((r) => (
                  <label key={r.id} className="mini" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={uForm.roles.includes(r.nombre)} onChange={() => toggleRol(r.nombre)} />
                    {r.nombre}
                  </label>
                ))}
                {roles.length === 0 && <span className="mini">Sin roles definidos.</span>}
              </div>
            </div>
            <div className="field">
              <label>Submódulos de facturación</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {modulosVenta.map(({ codigo, nombre }) => (
                  <label key={codigo} className="mini" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="checkbox" checked={uForm.roles.includes('ADMIN') || uForm.modulosFacturacion.includes(codigo)} disabled={uForm.roles.includes('ADMIN')}
                      onChange={() => setUForm((form) => ({ ...form, modulosFacturacion: form.modulosFacturacion.includes(codigo) ? form.modulosFacturacion.filter((modulo) => modulo !== codigo) : [...form.modulosFacturacion, codigo] }))} />
                    {nombre}
                  </label>
                ))}
              </div>
            </div>
            {editId && (
              <div className="field">
                <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={uForm.activo} onChange={(e) => setUForm({ ...uForm, activo: e.target.checked })} />
                  Usuario activo
                </label>
              </div>
            )}
          </form>
        </Modal>
      )}

      {modalMesera && (
        <Modal
          title="Nueva mesera"
          onClose={() => setModalMesera(false)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setModalMesera(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="mesera-form">Agregar mesera</Button>
            </>
          )}
        >
          <form id="mesera-form" onSubmit={crearMesera}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Nombre</label>
                <input value={mForm.nombre} onChange={(e) => setMForm({ ...mForm, nombre: e.target.value })} required />
              </div>
              <div className="field">
                <label>Código</label>
                <input value={mForm.codigo} onChange={(e) => setMForm({ ...mForm, codigo: e.target.value })} required />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {modalCocinero && (
        <Modal
          title="Nuevo cocinero"
          onClose={() => setModalCocinero(false)}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setModalCocinero(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="cocinero-form">Agregar cocinero</Button>
            </>
          )}
        >
          <form id="cocinero-form" onSubmit={crearCocinero}>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>Nombre</label>
                <input value={cForm.nombre} onChange={(e) => setCForm({ ...cForm, nombre: e.target.value })} required />
              </div>
              <div className="field">
                <label>Código</label>
                <input value={cForm.codigo} onChange={(e) => setCForm({ ...cForm, codigo: e.target.value })} required />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
