import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, TableSkeleton, EmptyState } from '../components/ui/index.jsx';
import { municipiosColombia } from '../municipiosColombia.js';

// Selector genérico con búsqueda (municipio o ciudad según el municipio elegido).
// items puede ser un array de strings o de objetos { codigo, nombre }.
function BuscadorLista({ items, value, onChange, placeholder, deshabilitado }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const filtro = q.trim().toLowerCase();
  const etiquetaDe = (i) => (typeof i === 'string' ? i : i.nombre);
  const valorDe = (i) => (typeof i === 'string' ? i : i.nombre);
  const lista = filtro ? items.filter((i) => etiquetaDe(i).toLowerCase().includes(filtro)) : items;
  return (
    <div className="cliente-picker">
      <button
        type="button"
        className="cliente-picker-btn"
        disabled={deshabilitado}
        onClick={() => !deshabilitado && setOpen((o) => !o)}
      >
        <span className="cliente-picker-txt">{value || placeholder}</span>
        <span className="nav-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => { setOpen(false); setQ(''); }} />
          <div className="cliente-picker-pop">
            <input
              autoFocus
              className="cliente-picker-search"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cliente-picker-list">
              {lista.map((i) => (
                <button
                  type="button"
                  key={etiquetaDe(i)}
                  className={`cliente-picker-item ${value === valorDe(i) ? 'activo' : ''}`}
                  onClick={() => { onChange(i); setOpen(false); setQ(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{etiquetaDe(i)}</span>
                </button>
              ))}
              {lista.length === 0 && <div className="empty" style={{ padding: 10 }}>Sin resultados</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const VACIO = {
  tipoCliente: 'NATURAL',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  razonSocial: '',
  documento: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  direccion: '',
  barrio: '',
  ciudad: '',
  email: '',
  municipioCodigo: '',
  responsableIVA: false,
  porcentajeEmpleado: '',
  porcentajeCliente: '',
  condicionPago: 'CONTADO',
  creditoDias: '',
  creditoCupo: '',
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(VACIO);
  const [municipio, setMunicipio] = useState('');
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const notify = useToast();

  const cargar = async (q = '') => {
    try {
      setCargando(true);
      const data = await api.get(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setClientes(data);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const buscar = (e) => {
    e.preventDefault();
    cargar(busqueda.trim());
  };

  const empezarEdicion = (c) => {
    setEditando(c.id);
    setMunicipio(municipiosColombia.find((d) => d.ciudades.some((ciu) => ciu.nombre === c.ciudad))?.departamento || '');
    setForm({
      tipoCliente: c.tipoCliente || 'NATURAL',
      tipoDocumento: c.tipoDocumento || 'CC',
      numeroDocumento: c.numeroDocumento || '',
      razonSocial: c.razonSocial || '',
      documento: c.documento || '',
      nombres: c.nombres || '',
      apellidos: c.apellidos || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      barrio: c.barrio || '',
      ciudad: c.ciudad || '',
      email: c.email || '',
      municipioCodigo: c.municipioCodigo || '',
      responsableIVA: !!c.responsableIVA,
      porcentajeEmpleado: c.porcentajeEmpleado ?? '',
      porcentajeCliente: c.porcentajeCliente ?? '',
      condicionPago: c.condicionPago || 'CONTADO',
      creditoDias: c.creditoDias ?? '',
      creditoCupo: c.creditoCupo ?? '',
    });
    setModalAbierto(true);
  };

  const abrirNuevo = () => { setEditando(null); setForm(VACIO); setMunicipio(''); setModalAbierto(true); };

  const cancelar = () => {
    setEditando(null);
    setForm(VACIO);
    setMunicipio('');
    setModalAbierto(false);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombres.trim() && !form.razonSocial.trim()) return notify('Indica los nombres o la razón social', 'err');
    if (form.condicionPago === 'CREDITO' && !String(form.creditoDias).trim()) {
      return notify('Indica a cuántos días es el crédito', 'err');
    }
    setGuardando(true);
    try {
      if (editando) {
        await api.put(`/clientes/${editando}`, form);
        notify('Cliente actualizado');
      } else {
        await api.post('/clientes', form);
        notify('Cliente agregado');
      }
      cancelar();
      cargar(busqueda.trim());
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"?`)) return;
    try {
      await api.del(`/clientes/${c.id}`);
      notify('Cliente eliminado');
      if (editando === c.id) cancelar();
      cargar(busqueda.trim());
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Directorio de clientes del negocio para ventas y facturación."
        actions={<Button variant="primary" icon="add" onClick={abrirNuevo} title="Nuevo cliente" />}
      />

      <div className="card">
        <div className="row between" style={{ marginBottom: 12, gap: 12 }}>
          <h3 style={{ margin: 0 }}>Directorio ({clientes.length})</h3>
          <form onSubmit={buscar} className="row" style={{ gap: 6 }}>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              style={{ maxWidth: 200 }}
            />
            <button className="btn btn-sm">Buscar</button>
            {busqueda && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setBusqueda(''); cargar(); }}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </form>
        </div>

        {cargando ? (
          <TableSkeleton cols={4} rows={6} />
        ) : clientes.length === 0 ? (
          <EmptyState
            icon="clientes"
            title="Sin clientes"
            description="Agrega tu primer cliente con el botón “+” de arriba."
          />
        ) : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>NIT / Cédula</th><th>Pago</th><th></th></tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className={editando === c.id ? 'fila-activa' : ''}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.razonSocial || c.nombre}</div>
                    {c.email && <div className="mini">{c.email}</div>}
                  </td>
                  <td className="mini">{c.numeroDocumento || c.documento || '—'}</td>
                  <td className="mini">
                    {c.condicionPago === 'CREDITO'
                      ? `Crédito${c.creditoDias ? ` ${c.creditoDias} días` : ''}${c.creditoCupo ? ` · ${money(c.creditoCupo)}` : ''}`
                      : 'Contado'}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" title="Editar" onClick={() => empezarEdicion(c)}><Icon name="edit" size={16} /></button>
                      <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(c)}><Icon name="delete" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAbierto && (
        <Modal
          title={editando ? 'Editar cliente' : 'Nuevo cliente'}
          onClose={cancelar}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cancelar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="cliente-form" loading={guardando}>
                {editando ? 'Guardar cambios' : 'Agregar cliente'}
              </Button>
            </>
          )}
        >
          <form id="cliente-form" onSubmit={guardar}>
            <div className="grid form-3col" style={{ gap: 12 }}>
              <div className="field">
                <label>Tipo de cliente</label>
                <select value={form.tipoCliente} onChange={(e) => setForm({ ...form, tipoCliente: e.target.value })}>
                  <option value="NATURAL">Persona Natural</option>
                  <option value="JURIDICA">Persona Jurídica</option>
                </select>
              </div>
              <div className="field">
                <label>Tipo de documento</label>
                <select value={form.tipoDocumento} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value })}>
                  <option value="RC">Registro civil</option>
                  <option value="TI">Tarjeta de identidad</option>
                  <option value="CC">Cédula de ciudadanía</option>
                  <option value="TE">Tarjeta de extranjería</option>
                  <option value="CE">Cédula de extranjería</option>
                  <option value="NIT">NIT</option>
                  <option value="PAS">Pasaporte</option>
                  <option value="DIE">Documento de identificación extranjero</option>
                  <option value="PEP">PEP - Permiso especial de permanencia</option>
                  <option value="NUIP">NUIP</option>
                </select>
              </div>
              <div className="field">
                <label>Número de documento</label>
                <input value={form.numeroDocumento} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })} placeholder="Número / NIT" />
              </div>
              <div className="field">
                <label>Razón social</label>
                <input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })} placeholder="Razón social (empresas)" />
              </div>
              <div className="field">
                <label>Nombres</label>
                <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} placeholder="Nombres" />
              </div>
              <div className="field">
                <label>Apellidos</label>
                <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} placeholder="Apellidos" />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Número de teléfono" />
              </div>
              <div className="field">
                <label>Correo</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
              </div>
              <div className="field">
                <label>Municipio</label>
                <BuscadorLista
                  items={municipiosColombia.map((d) => d.departamento)}
                  value={municipio}
                  onChange={(v) => { setMunicipio(v); setForm({ ...form, ciudad: '' }); }}
                  placeholder="Selecciona un municipio…"
                />
              </div>
              <div className="field">
                <label>Ciudad</label>
                <BuscadorLista
                  items={municipiosColombia.find((d) => d.departamento === municipio)?.ciudades || []}
                  value={form.ciudad}
                  onChange={(v) => setForm({ ...form, ciudad: v.nombre, municipioCodigo: v.codigo })}
                  placeholder={municipio ? 'Selecciona una ciudad…' : 'Primero elige el municipio'}
                  deshabilitado={!municipio}
                />
              </div>
              <div className="field">
                <label>Barrio</label>
                <input value={form.barrio} onChange={(e) => setForm({ ...form, barrio: e.target.value })} placeholder="Barrio" />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" />
              </div>
              <div className="field">
                <label>Código de municipio</label>
                <input value={form.municipioCodigo} readOnly disabled placeholder="Se llena al elegir la ciudad" />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.responsableIVA} onChange={(e) => setForm({ ...form, responsableIVA: e.target.checked })} />
                  Responsable de IVA
                </label>
              </div>
              <div className="field">
                <label>% Empleado / % Cliente</label>
                <div className="grid" style={{ gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                  <input type="number" min="0" max="100" step="0.01" value={form.porcentajeEmpleado} onChange={(e) => setForm({ ...form, porcentajeEmpleado: e.target.value })} placeholder="Empleado" />
                  <input type="number" min="0" max="100" step="0.01" value={form.porcentajeCliente} onChange={(e) => setForm({ ...form, porcentajeCliente: e.target.value })} placeholder="Cliente" />
                </div>
              </div>
            </div>

            <div className="grid form-3col" style={{ gap: 12, alignItems: 'start' }}>
              <div className="field">
                <label>Condición de pago</label>
                <div className="mesera-grid">
                  {['CONTADO', 'CREDITO'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`mesera-card ${form.condicionPago === c ? 'sel' : ''}`}
                      onClick={() => setForm({ ...form, condicionPago: c })}
                    >
                      <div className="mesera-nombre">{c === 'CONTADO' ? 'Contado' : 'Crédito'}</div>
                    </button>
                  ))}
                </div>
              </div>
              {form.condicionPago === 'CREDITO' ? (
                <>
                  <div className="field">
                    <label>Días de crédito *</label>
                    <input
                      type="number"
                      min="0"
                      value={form.creditoDias}
                      onChange={(e) => setForm({ ...form, creditoDias: e.target.value })}
                      placeholder="Ej. 30"
                    />
                  </div>
                  <div className="field">
                    <label>Cupo máximo</label>
                    <input
                      type="number"
                      min="0"
                      value={form.creditoCupo}
                      onChange={(e) => setForm({ ...form, creditoCupo: e.target.value })}
                      placeholder="Ej. 500000"
                    />
                  </div>
                </>
              ) : (
                <p className="mini" style={{ gridColumn: '2 / -1', alignSelf: 'center' }}>Pago de contado: no aplica plazo ni cupo.</p>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
