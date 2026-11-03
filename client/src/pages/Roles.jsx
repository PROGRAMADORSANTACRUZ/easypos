import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { NAV_GRUPOS, useAuth, useToast } from '../App.jsx';
import { CRUD_ENTIDADES } from '../crudConfig.js';
import { PageHeader, Modal, Button } from '../components/ui/index.jsx';

const vacio = { nombre: '', descripcion: '', permisos: [] };
const PERMISOS_ADMIN_MESAS = new Set(['mesas.crear', 'mesas.editar', 'mesas.eliminar']);
const etiquetaPermiso = (codigo) => {
  if (codigo === 'mesas.crear') return 'Nueva mesa';
  if (codigo === 'mesas.editar') return 'Editar mesa';
  if (codigo === 'mesas.eliminar') return 'Eliminar mesa';
  if (codigo === 'pedidos.crear') return 'Crear pedido';
  if (codigo === 'pedidos.editar') return 'Editar';
  if (codigo === 'pedidos.eliminar') return 'Cancelar';
  if (codigo === 'pedidos.prefactura') return 'Prefactura';
  if (codigo === 'pedidos.observaciones') return 'Observaciones';
  return codigo.split('.')[1];
};

export default function Roles() {
  const { user } = useAuth();
  const esAdmin = user?.roles?.includes('ADMIN');
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
    const ordenPedidos = ['pedidos.crear', 'pedidos.editar', 'pedidos.eliminar', 'pedidos.prefactura', 'pedidos.observaciones', 'pedidos.ver'];
    if (map.pedidos) {
      map.pedidos.sort((a, b) => ordenPedidos.indexOf(a.codigo) - ordenPedidos.indexOf(b.codigo));
    }
    return map;
  }, [permisos]);

  const gruposMenu = useMemo(() => {
    const disponibles = new Set(Object.keys(porModulo));
    const grupo = (id, label, items) => {
      const modulos = new Map();
      for (const item of items) {
        const modulo = item.permiso.split('.')[0];
        if (!disponibles.has(modulo)) continue;
        if (modulo === 'pedidos' && modulos.has('mesas')) {
          modulos.get('mesas').incluirPedidos = true;
          continue;
        }
        const anterior = modulos.get(modulo);
        const label = anterior ? `${anterior.label} / ${item.label}` : item.label;
        modulos.set(modulo, { modulo, label, incluirPedidos: false });
      }
      return { id, label, modulos: [...modulos.values()] };
    };
    const grupos = NAV_GRUPOS.filter((g) => g.id !== 'admin').map((g) => grupo(g.id, g.label, g.items));
    grupos.push(grupo('reportes', 'Reportes', [{ permiso: 'reportes.ver', label: 'Reportes' }]));
    grupos.push(grupo('maestros', 'Maestros / DIAN', CRUD_ENTIDADES.map((e) => ({ permiso: `${e.modulo}.ver`, label: e.label }))));
    const admin = NAV_GRUPOS.find((g) => g.id === 'admin');
    grupos.push(grupo(admin.id, admin.label, admin.items));
    const asignados = new Set(grupos.flatMap((g) => g.modulos.flatMap((m) => m.incluirPedidos ? [m.modulo, 'pedidos'] : [m.modulo])));
    const otrosModulos = [...disponibles]
      .filter((modulo) => !asignados.has(modulo) && modulo !== 'mesas')
      .map((modulo) => ({ modulo, label: modulo.replaceAll('_', ' ') }));
    const permisosMesasOtros = (porModulo.mesas || []).filter((permiso) => PERMISOS_ADMIN_MESAS.has(permiso.codigo));
    grupos.push({ id: 'otros', label: 'Otros permisos', modulos: otrosModulos, permisosDirectos: permisosMesasOtros });
    return grupos.filter((g) => g.modulos.length || g.permisosDirectos?.length);
  }, [porModulo]);

  const togglePermiso = (codigo) => {
    setForm((f) => {
      if (f.permisos.includes(codigo)) {
        const restante = codigo.endsWith('.ver')
          ? f.permisos.filter((actual) => !actual.startsWith(`${codigo.split('.')[0]}.`))
          : f.permisos.filter((actual) => actual !== codigo);
        const modulo = codigo.split('.')[0];
        const quedanAcciones = restante.some((actual) => actual.startsWith(`${modulo}.`) && actual !== `${modulo}.ver`);
        const conservaLectura = modulo === 'mesas' || quedanAcciones;
        return { ...f, permisos: conservaLectura ? restante : restante.filter((actual) => actual !== `${modulo}.ver`) };
      }
      return {
        ...f,
        permisos: [...new Set([...f.permisos, codigo, ...(codigo.endsWith('.ver') ? [] : [`${codigo.split('.')[0]}.ver`])])],
      };
    });
  };

  const toggleModulo = (modulo, marcar) => {
    const codigo = `${modulo}.ver`;
    setForm((f) => ({
      ...f,
      permisos: marcar
        ? [...new Set([...f.permisos, codigo])]
        : f.permisos.filter((c) => !c.startsWith(`${modulo}.`)),
    }));
  };

  const toggleGrupo = (grupo, marcar) => {
    const codigos = grupo.modulos.map(({ modulo }) => `${modulo}.ver`);
    const modulos = grupo.modulos.map(({ modulo }) => modulo);
    const permisosDirectos = (grupo.permisosDirectos || []).map(({ codigo }) => codigo);
    const lecturasDirectas = [...new Set(permisosDirectos.map((codigo) => `${codigo.split('.')[0]}.ver`))];
    setForm((f) => ({ ...f, permisos: marcar
      ? [...new Set([...f.permisos, ...codigos, ...permisosDirectos, ...lecturasDirectas])]
      : f.permisos.filter((codigo) => !modulos.some((modulo) => codigo.startsWith(`${modulo}.`)) && !permisosDirectos.includes(codigo)) }));
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
        actions={esAdmin && <Button variant="primary" icon="add" onClick={nuevoRol} title="Nuevo rol" />}
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
                  {r.nombre === 'ADMIN' ? <span className="mini">Protegido</span> : esAdmin && <>
                    <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>{' '}
                    <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)}><Icon name="delete" size={16} /></button>
                  </>}
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

            <label style={{ display: 'block', margin: '10px 0 6px', fontWeight: 600 }}>Módulos y permisos</label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {gruposMenu.map((grupo) => {
                const todos = grupo.modulos.every(({ modulo, incluirPedidos }) => form.permisos.includes(`${modulo}.ver`)
                  && (!incluirPedidos || form.permisos.includes('pedidos.ver')))
                  && (grupo.permisosDirectos || []).every(({ codigo }) => form.permisos.includes(codigo));
                return (
                  <details key={grupo.id} style={{ borderBottom: '1px solid var(--border)', padding: '7px 0' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{grupo.label}</summary>
                    <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0' }}>
                      <input type="checkbox" checked={todos} onChange={() => toggleGrupo(grupo, !todos)} />
                      {grupo.label}
                    </label>
                    <div style={{ paddingLeft: 12 }}>
                      {grupo.modulos.map(({ modulo, label, incluirPedidos }) => (
                        <div key={modulo} style={{ borderTop: '1px solid var(--border)', padding: '7px 0' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={form.permisos.includes(`${modulo}.ver`)} onChange={() => toggleModulo(modulo, !form.permisos.includes(`${modulo}.ver`))} />
                            {label}
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingLeft: 18 }}>
                            {[
                              ...(porModulo[modulo] || []).filter((p) => p.codigo !== `${modulo}.ver` && !(modulo === 'mesas' && PERMISOS_ADMIN_MESAS.has(p.codigo))),
                              ...(incluirPedidos ? (porModulo.pedidos || []).filter((p) => p.codigo !== 'pedidos.ver') : []),
                            ].map((p) => (
                              <label key={p.codigo} className="mini" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={form.permisos.includes(p.codigo)} onChange={() => togglePermiso(p.codigo)} />
                                {etiquetaPermiso(p.codigo)}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {grupo.permisosDirectos?.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '7px 0' }}>
                          <strong style={{ display: 'block', marginBottom: 6 }}>Mesas</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingLeft: 18 }}>
                            {grupo.permisosDirectos.map((permiso) => (
                              <label key={permiso.codigo} className="mini" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="checkbox" checked={form.permisos.includes(permiso.codigo)} onChange={() => togglePermiso(permiso.codigo)} />
                                {etiquetaPermiso(permiso.codigo)}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
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