import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, TableSkeleton, EmptyState } from '../components/ui/index.jsx';

function BuscadorUbicacionSiesa({ items, value, onChange, placeholder, placeholderBusqueda, deshabilitado }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const seleccionado = items.find((item) => item.codigo === value);
  const consulta = busqueda.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const resultados = consulta
    ? items.filter((item) => `${item.codigo} ${item.nombre}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(consulta))
    : items;

  return (
    <div className="cliente-picker">
      <button
        type="button"
        className="cliente-picker-btn"
        disabled={deshabilitado}
        aria-expanded={abierto}
        onClick={() => !deshabilitado && setAbierto((estado) => !estado)}
      >
        <span className="cliente-picker-txt">{seleccionado ? `${seleccionado.codigo} · ${seleccionado.nombre}` : placeholder}</span>
        <span className="nav-caret" aria-hidden>▾</span>
      </button>
      {abierto && !deshabilitado && (
        <>
          <div className="cliente-picker-backdrop" onClick={() => { setAbierto(false); setBusqueda(''); }} />
          <div className="cliente-picker-pop">
            <input
              autoFocus
              className="cliente-picker-search"
              placeholder={placeholderBusqueda}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="cliente-picker-list">
              <button
                type="button"
                className={`cliente-picker-item ${!value ? 'activo' : ''}`}
                onClick={() => { onChange(''); setAbierto(false); setBusqueda(''); }}
              >
                <span>{placeholder}</span>
              </button>
              {resultados.map((item) => (
                <button
                  type="button"
                  key={item.codigo}
                  className={`cliente-picker-item ${item.codigo === value ? 'activo' : ''}`}
                  onClick={() => { onChange(item.codigo); setAbierto(false); setBusqueda(''); }}
                >
                  <span style={{ fontWeight: 600 }}>{item.codigo} · {item.nombre}</span>
                </button>
              ))}
              {resultados.length === 0 && <div className="empty" style={{ padding: 10 }}>Sin resultados</div>}
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
  sucursal: '',
  telefono: '',
  direccion: '',
  barrio: '',
  ciudad: '',
  email: '',
  municipioCodigo: '',
  municipioSiesaCodigo: '',
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
  const [paisesSiesa, setPaisesSiesa] = useState([]);
  const [paisSiesaCodigo, setPaisSiesaCodigo] = useState('169');
  const [departamentosSiesa, setDepartamentosSiesa] = useState([]);
  const [departamentoSiesaCodigo, setDepartamentoSiesaCodigo] = useState('');
  const [ciudadesSiesa, setCiudadesSiesa] = useState([]);
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

  useEffect(() => {
    let vigente = true;
    api.get('/catalogos-siesa/paises')
      .then((lista) => { if (vigente) setPaisesSiesa(lista); })
      .catch((error) => { if (vigente) notify(error.message, 'err'); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    let vigente = true;
    if (!paisSiesaCodigo) {
      setDepartamentosSiesa([]);
      return () => { vigente = false; };
    }
    api.get(`/catalogos-siesa/departamentos?paisCodigo=${encodeURIComponent(paisSiesaCodigo)}`)
      .then((lista) => { if (vigente) setDepartamentosSiesa(lista); })
      .catch((error) => { if (vigente) notify(error.message, 'err'); });
    return () => { vigente = false; };
  }, [paisSiesaCodigo]);

  useEffect(() => {
    let vigente = true;
    if (!departamentoSiesaCodigo) {
      setCiudadesSiesa([]);
      return () => { vigente = false; };
    }
    api.get(`/catalogos-siesa/ciudades?departamentoCodigo=${encodeURIComponent(departamentoSiesaCodigo)}`)
      .then((lista) => { if (vigente) setCiudadesSiesa(lista); })
      .catch((error) => { if (vigente) notify(error.message, 'err'); });
    return () => { vigente = false; };
  }, [departamentoSiesaCodigo]);

  const buscar = (e) => {
    e.preventDefault();
    cargar(busqueda.trim());
  };

  const empezarEdicion = (c) => {
    setEditando(c.id);
    setPaisSiesaCodigo(c.municipioSiesa?.departamento?.paisCodigo || '169');
    setDepartamentoSiesaCodigo(c.municipioSiesa?.departamentoCodigo || '');
    setForm({
      tipoCliente: c.tipoCliente || 'NATURAL',
      tipoDocumento: c.tipoDocumento || 'CC',
      numeroDocumento: c.numeroDocumento || '',
      razonSocial: c.razonSocial || '',
      documento: c.documento || '',
      nombres: c.nombres || '',
      apellidos: c.apellidos || '',
      sucursal: c.sucursal || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      barrio: c.barrio || '',
      ciudad: c.ciudad || '',
      email: c.email || '',
      municipioCodigo: c.municipioCodigo || '',
      municipioSiesaCodigo: c.municipioSiesaCodigo || '',
      responsableIVA: !!c.responsableIVA,
      porcentajeEmpleado: c.porcentajeEmpleado ?? '',
      porcentajeCliente: c.porcentajeCliente ?? '',
      condicionPago: c.condicionPago || 'CONTADO',
      creditoDias: c.creditoDias ?? '',
      creditoCupo: c.creditoCupo ?? '',
    });
    setModalAbierto(true);
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(VACIO);
    setPaisSiesaCodigo('169');
    setDepartamentoSiesaCodigo('');
    setModalAbierto(true);
  };

  const cancelar = () => {
    setEditando(null);
    setForm(VACIO);
    setPaisSiesaCodigo('169');
    setDepartamentoSiesaCodigo('');
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
                <input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value.toUpperCase() })} placeholder="Razón social (empresas)" />
              </div>
              <div className="field">
                <label>Nombres</label>
                <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value.toUpperCase() })} placeholder="Nombres" />
              </div>
              <div className="field">
                <label>Apellidos</label>
                <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value.toUpperCase() })} placeholder="Apellidos" />
              </div>
              <div className="field">
                <label>Sucursal</label>
                <input value={form.sucursal} onChange={(e) => setForm({ ...form, sucursal: e.target.value.toUpperCase() })} placeholder="Sucursal del cliente" />
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
                <label>País Siesa</label>
                <select
                  value={paisSiesaCodigo}
                  onChange={(e) => {
                    setPaisSiesaCodigo(e.target.value);
                    setDepartamentoSiesaCodigo('');
                    setForm({
                      ...form,
                      municipioSiesaCodigo: '',
                      ciudad: form.municipioSiesaCodigo ? '' : form.ciudad,
                    });
                  }}
                >
                  <option value="">Seleccionar país…</option>
                  {paisesSiesa.map((pais) => <option key={pais.codigo} value={pais.codigo}>{pais.codigo} · {pais.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Departamento Siesa</label>
                <BuscadorUbicacionSiesa
                  key={paisSiesaCodigo}
                  items={departamentosSiesa}
                  value={departamentoSiesaCodigo}
                  placeholder="Seleccionar departamento…"
                  placeholderBusqueda="Buscar código o departamento…"
                  deshabilitado={!paisSiesaCodigo}
                  onChange={(codigo) => {
                    setDepartamentoSiesaCodigo(codigo);
                    setForm({
                      ...form,
                      municipioSiesaCodigo: '',
                      ciudad: form.municipioSiesaCodigo ? '' : form.ciudad,
                    });
                  }}
                />
              </div>
              <div className="field">
                <label>Ciudad Siesa</label>
                <BuscadorUbicacionSiesa
                  key={departamentoSiesaCodigo}
                  items={ciudadesSiesa}
                  value={form.municipioSiesaCodigo}
                  placeholder="Seleccionar ciudad…"
                  placeholderBusqueda="Buscar código o ciudad…"
                  deshabilitado={!departamentoSiesaCodigo}
                  onChange={(codigo) => {
                    const ciudad = ciudadesSiesa.find((item) => item.codigo === codigo);
                    setForm({ ...form, municipioSiesaCodigo: codigo, ciudad: ciudad?.nombre || '' });
                  }}
                />
              </div>
              <div className="field">
                <label>Barrio</label>
                <input value={form.barrio} onChange={(e) => setForm({ ...form, barrio: e.target.value.toUpperCase() })} placeholder="Barrio" />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value.toUpperCase() })} placeholder="Dirección" />
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
