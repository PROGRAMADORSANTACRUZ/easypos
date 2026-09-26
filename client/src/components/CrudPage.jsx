import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useAuth, useToast } from '../App.jsx';
import { PageHeader, EmptyState, TableSkeleton, Modal, Button } from './ui/index.jsx';

const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);
const camposMayusculas = new Set(['nombre', 'descripcion', 'observaciones', 'direccion', 'razonSocial']);

// Valor inicial vacío de un campo según su tipo.
const vacioCampo = (c) => (c.type === 'checkbox' ? (c.default ?? true) : (c.default ?? ''));

// Página CRUD genérica dirigida por configuración (ver crudConfig.js).
export default function CrudPage({ cfg }) {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, `${cfg.modulo}.crear`);
  const puedeEditar = puede(user, `${cfg.modulo}.editar`);
  const puedeEliminar = puede(user, `${cfg.modulo}.eliminar`);
  const usaFormulario = puedeCrear || puedeEditar;

  const VACIO = useMemo(
    () => Object.fromEntries(cfg.campos.map((c) => [c.name, vacioCampo(c)])),
    [cfg],
  );

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [refs, setRefs] = useState({}); // opciones de campos tipo 'ref'
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const [lista, ...fuentes] = await Promise.all([
        api.get(cfg.endpoint),
        ...cfg.campos.filter((c) => c.type === 'ref').map((c) => api.get(c.fuente).catch(() => [])),
      ]);
      setRows(Array.isArray(lista) ? lista : []);
      const camposRef = cfg.campos.filter((c) => c.type === 'ref');
      const mapa = {};
      camposRef.forEach((c, i) => { mapa[c.name] = fuentes[i] || []; });
      setRefs(mapa);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); setForm(VACIO); setEditId(null); }, [cfg]);

  const set = (campo, valor) => setForm((f) => ({
    ...f,
    [campo]: camposMayusculas.has(campo) && typeof valor === 'string' ? valor.toUpperCase() : valor,
  }));
  const limpiar = () => { setEditId(null); setForm(VACIO); };
  const abrirNuevo = () => { limpiar(); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); limpiar(); };

  const empezarEdicion = (row) => {
    setEditId(row.id);
    const nuevo = {};
    for (const c of cfg.campos) {
      const v = row[c.name];
      if (c.type === 'checkbox') nuevo[c.name] = v !== false;
      else if (c.type === 'date') nuevo[c.name] = v ? String(v).slice(0, 10) : '';
      else nuevo[c.name] = v ?? '';
    }
    setForm(nuevo);
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    for (const c of cfg.campos) {
      if (c.required && (form[c.name] === '' || form[c.name] == null)) {
        return notify(`${c.label} es obligatorio`, 'err');
      }
    }
    const payload = {};
    for (const c of cfg.campos) {
      let v = form[c.name];
      if (c.type === 'number') v = v === '' || v == null ? null : Number(v);
      else if (c.type === 'checkbox') v = !!v;
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
      payload[c.name] = v;
    }
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`${cfg.endpoint}/${editId}`, payload);
        notify(`${cfg.singular} actualizado`);
      } else {
        await api.post(cfg.endpoint, payload);
        notify(`${cfg.singular} creado`);
      }
      setModalAbierto(false);
      limpiar();
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (row) => {
    if (!confirm(`¿Eliminar ${cfg.singular.toLowerCase()}?`)) return;
    try {
      await api.del(`${cfg.endpoint}/${row.id}`);
      notify(`${cfg.singular} eliminado`);
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const opcionLabel = (campo, opt) => {
    if (typeof campo.labelKey === 'function') return campo.labelKey(opt);
    return opt[campo.labelKey || 'nombre'] ?? opt.id;
  };

  const celda = (col, row) => {
    const v = col.get(row);
    if (v == null || v === '') return '—';
    return col.money ? money(Number(v)) : String(v);
  };

  return (
    <div>
      <PageHeader
        title={cfg.titulo}
        subtitle={cfg.descripcion}
        actions={puedeCrear && (
          <Button variant="primary" icon="add" onClick={abrirNuevo} title={`Nuevo ${cfg.singular.toLowerCase()}`} />
        )}
      />

      <div className="card">
        {cargando ? (
          <TableSkeleton cols={cfg.columnas.length + 1} rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={cfg.icon || 'maestros'}
            title="Sin registros"
            description={puedeCrear ? `Crea tu primer ${cfg.singular.toLowerCase()} con el botón “+”.` : 'Aún no hay datos para mostrar.'}
          />
        ) : (
          <table>
            <thead>
              <tr>
                {cfg.columnas.map((col) => <th key={col.label} style={col.money ? { textAlign: 'right' } : undefined}>{col.label}</th>)}
                {(puedeEditar || puedeEliminar) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {cfg.columnas.map((col) => (
                    <td key={col.label} style={col.money ? { textAlign: 'right' } : undefined}>{celda(col, row)}</td>
                  ))}
                  {(puedeEditar || puedeEliminar) && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(row)}><Icon name="edit" size={16} /></button>}
                      {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(row)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {usaFormulario && modalAbierto && (
        <Modal
          title={editId ? `Editar ${cfg.singular.toLowerCase()}` : `Nuevo ${cfg.singular.toLowerCase()}`}
          onClose={cerrarModal}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cancelar</Button>
              <Button variant="primary" type="submit" form="crud-form" loading={guardando}>
                {editId ? 'Guardar cambios' : 'Crear'}
              </Button>
            </>
          )}
        >
          <form id="crud-form" onSubmit={guardar}>
            <div className="grid form-2col">
              {cfg.campos.map((c) => (
                <div className="field" key={c.name} style={c.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                  <label>{c.label}{c.required ? ' *' : ''}</label>
                  {c.type === 'textarea' ? (
                    <textarea value={form[c.name] ?? ''} onChange={(e) => set(c.name, e.target.value)} rows={2} />
                  ) : c.type === 'checkbox' ? (
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={!!form[c.name]} onChange={(e) => set(c.name, e.target.checked)} />
                      <span className="mini">{c.hint || 'Activo'}</span>
                    </label>
                  ) : c.type === 'select' ? (
                    <select value={form[c.name] ?? ''} onChange={(e) => set(c.name, e.target.value)}>
                      <option value="">—</option>
                      {(c.options || []).map((o) => (
                        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
                      ))}
                    </select>
                  ) : c.type === 'ref' ? (
                    <select value={form[c.name] ?? ''} onChange={(e) => set(c.name, e.target.value)}>
                      <option value="">—</option>
                      {(refs[c.name] || []).map((o) => (
                        <option key={o.id} value={o.id}>{opcionLabel(c, o)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      step={c.step}
                      value={form[c.name] ?? ''}
                      onChange={(e) => set(c.name, e.target.value)}
                      maxLength={c.maxLength}
                    />
                  )}
                </div>
              ))}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
