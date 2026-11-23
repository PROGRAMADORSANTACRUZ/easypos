import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, money } from '../api.js';
import { DOCUMENTOS_GENERICOS, MAX_DOCUMENTO, soloDigitos } from '../documento.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, TableSkeleton, EmptyState } from '../components/ui/index.jsx';

// Combo con busqueda para catalogos de Siesa: se escribe directamente en el campo y la lista se dibuja fija sobre
// la pantalla (no queda cortada por el scroll del modal) y se abre hacia arriba si abajo no hay espacio.
function BuscadorUbicacionSiesa({ items, value, onChange, placeholder, placeholderBusqueda, deshabilitado }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const [activo, setActivo] = useState(0);
  const campo = useRef(null);
  const seleccionado = items.find((item) => item.codigo === value);
  const normalizar = (texto) => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const consulta = normalizar(busqueda.trim());
  const resultados = (consulta ? items.filter((item) => normalizar(`${item.codigo} ${item.nombre}`).includes(consulta)) : items).slice(0, 200);

  const ubicar = () => {
    const rect = campo.current?.getBoundingClientRect();
    if (!rect) return;
    const alto = 260;
    const arriba = window.innerHeight - rect.bottom < alto + 8 && rect.top > window.innerHeight - rect.bottom;
    setPosicion({
      left: rect.left,
      width: rect.width,
      ...(arriba ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(140, Math.min(alto, arriba ? rect.top - 12 : window.innerHeight - rect.bottom - 12)),
    });
  };

  useEffect(() => {
    if (!abierto) return undefined;
    ubicar();
    const mover = () => ubicar();
    window.addEventListener('resize', mover);
    window.addEventListener('scroll', mover, true);
    return () => {
      window.removeEventListener('resize', mover);
      window.removeEventListener('scroll', mover, true);
    };
  }, [abierto]);

  const abrir = () => {
    if (deshabilitado) return;
    setBusqueda('');
    setActivo(0);
    setAbierto(true);
  };
  const cerrar = () => { setAbierto(false); setBusqueda(''); };
  const elegir = (codigo) => { onChange(codigo); cerrar(); campo.current?.blur(); };

  const teclas = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierto) abrir(); else setActivo((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (abierto && resultados[activo]) elegir(resultados[activo].codigo); }
    else if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); cerrar(); }
    else if (e.key === 'Tab') cerrar();
  };

  return (
    <div className="cliente-picker">
      <input
        ref={campo}
        className="cliente-picker-input"
        disabled={deshabilitado}
        value={abierto ? busqueda : (seleccionado ? `${seleccionado.codigo} · ${seleccionado.nombre}` : '')}
        placeholder={abierto ? placeholderBusqueda : placeholder}
        onFocus={abrir}
        onClick={() => { if (!abierto) abrir(); }}
        onChange={(e) => { setBusqueda(e.target.value); setActivo(0); if (!abierto) setAbierto(true); }}
        onKeyDown={teclas}
        role="combobox"
        aria-expanded={abierto}
        autoComplete="off"
      />
      {abierto && !deshabilitado && posicion && createPortal(
        <>
          <div className="cliente-picker-backdrop cliente-picker-backdrop--fijo" onMouseDown={cerrar} />
          <div className="cliente-picker-pop cliente-picker-pop--fijo" style={{ left: posicion.left, width: posicion.width, top: posicion.top, bottom: posicion.bottom }}>
            <div className="cliente-picker-list" style={{ maxHeight: posicion.maxHeight }} role="listbox">
              {resultados.map((item, indice) => (
                <button
                  type="button"
                  key={item.codigo}
                  className={`cliente-picker-item ${item.codigo === value || indice === activo ? 'activo' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); elegir(item.codigo); }}
                  onMouseEnter={() => setActivo(indice)}
                >
                  <span style={{ fontWeight: 600 }}>{item.codigo} · {item.nombre}</span>
                </button>
              ))}
              {resultados.length === 0 && <div className="empty" style={{ padding: 10 }}>{items.length ? 'Sin resultados' : 'Cargando…'}</div>}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function EditorSucursalCliente({ sucursal, paises, onChange, onRemove }) {
  const [paisCodigo, setPaisCodigo] = useState(() => sucursal.paisSiesaCodigo || sucursal.municipioSiesa?.departamento?.paisCodigo || '169');
  const [departamentoCodigo, setDepartamentoCodigo] = useState(() => sucursal.departamentoSiesaCodigo || sucursal.municipioSiesa?.departamentoCodigo || '');
  const [departamentos, setDepartamentos] = useState([]);
  const [ciudades, setCiudades] = useState([]);

  useEffect(() => {
    let vigente = true;
    if (!paisCodigo) { setDepartamentos([]); return () => { vigente = false; }; }
    api.get(`/catalogos-siesa/departamentos?paisCodigo=${encodeURIComponent(paisCodigo)}`)
      .then((lista) => { if (vigente) setDepartamentos(lista); });
    return () => { vigente = false; };
  }, [paisCodigo]);

  useEffect(() => {
    let vigente = true;
    if (!departamentoCodigo) { setCiudades([]); return () => { vigente = false; }; }
    api.get(`/catalogos-siesa/ciudades?departamentoCodigo=${encodeURIComponent(departamentoCodigo)}`)
      .then((lista) => { if (vigente) setCiudades(lista); });
    return () => { vigente = false; };
  }, [departamentoCodigo]);

  return (
    <div className="field" style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', padding: 12, gap: 10 }}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <strong>{sucursal.nombre || 'Nueva sucursal'}</strong>
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }} title="Una sucursal inactiva no se usa al facturar pero conserva su código en Siesa">
            <input type="checkbox" checked={sucursal.activo !== false} onChange={(e) => onChange('activo', e.target.checked)} /> Activa
          </label>
          <button type="button" className="btn btn-red btn-sm" onClick={onRemove} title="Quitar sucursal"><Icon name="delete" size={16} /></button>
        </div>
      </div>
      <div className="grid form-3col" style={{ gap: 10 }}>
        <div className="field"><label>Nombre de la sede</label><input value={sucursal.nombre} onChange={(e) => onChange('nombre', e.target.value)} placeholder="Ej. Sede norte" /></div>
        <div className="field"><label>Teléfono</label><input value={sucursal.telefono || ''} onChange={(e) => onChange('telefono', e.target.value)} /></div>
        <div className="field"><label>Correo</label><input type="email" value={sucursal.email || ''} onChange={(e) => onChange('email', e.target.value)} /></div>
        <div className="field"><label>Dirección</label><input value={sucursal.direccion || ''} onChange={(e) => onChange('direccion', e.target.value.toUpperCase())} /></div>
        <div className="field"><label>Barrio</label><input value={sucursal.barrio || ''} onChange={(e) => onChange('barrio', e.target.value.toUpperCase())} /></div>
        <div className="field"><label>País Siesa</label>
          <select value={paisCodigo} onChange={(e) => { setPaisCodigo(e.target.value); setDepartamentoCodigo(''); onChange('municipioSiesaCodigo', ''); onChange('ciudad', ''); }}>
            <option value="">Seleccionar país…</option>
            {paises.map((pais) => <option key={pais.codigo} value={pais.codigo}>{pais.codigo} · {pais.nombre}</option>)}
          </select>
        </div>
        <div className="field"><label>Departamento Siesa</label>
          <BuscadorUbicacionSiesa items={departamentos} value={departamentoCodigo} placeholder="Seleccionar departamento…" placeholderBusqueda="Buscar departamento…" deshabilitado={!paisCodigo}
            onChange={(codigo) => { setDepartamentoCodigo(codigo); onChange('municipioSiesaCodigo', ''); onChange('ciudad', ''); }} />
        </div>
        <div className="field"><label>Municipio Siesa</label>
          <BuscadorUbicacionSiesa items={ciudades} value={sucursal.municipioSiesaCodigo || ''} placeholder="Seleccionar municipio…" placeholderBusqueda="Buscar municipio…" deshabilitado={!departamentoCodigo}
            onChange={(codigo) => { const ciudad = ciudades.find((item) => item.codigo === codigo); onChange('municipioSiesaCodigo', codigo); onChange('ciudad', ciudad?.nombre || ''); }} />
        </div>
      </div>
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
  primerApellido: '',
  segundoApellido: '',
  sucursales: [],
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
  const [confirmacionSiesa, setConfirmacionSiesa] = useState(null);
  const [buscandoSiesa, setBuscandoSiesa] = useState(false);
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
      numeroDocumento: soloDigitos(c.numeroDocumento),
      razonSocial: c.razonSocial || '',
      documento: soloDigitos(c.documento),
      nombres: c.nombres || '',
      apellidos: c.apellidos || '',
      primerApellido: (c.apellidos || '').trim().split(/\s+/)[0] || '',
      segundoApellido: (c.apellidos || '').trim().split(/\s+/).slice(1).join(' '),
      sucursales: (c.sucursales || []).map((sucursal) => ({
        ...sucursal,
        paisSiesaCodigo: sucursal.municipioSiesa?.departamento?.paisCodigo || '169',
        departamentoSiesaCodigo: sucursal.municipioSiesa?.departamentoCodigo || '',
      })),
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

  const actualizarSucursal = (indice, campo, valor) => setForm((actual) => ({
    ...actual,
    sucursales: actual.sucursales.map((sucursal, i) => i === indice ? { ...sucursal, [campo]: valor } : sucursal),
  }));

  const agregarSucursal = () => setForm((actual) => ({
    ...actual,
    sucursales: [...actual.sucursales, { nombre: '', telefono: '', direccion: '', barrio: '', ciudad: '', email: '', municipioSiesaCodigo: '', paisSiesaCodigo: '169', departamentoSiesaCodigo: '' }],
  }));

  // Enter en el documento: trae los datos del tercero desde Siesa para revisarlos y actualizarlos.
  const buscarEnSiesa = async () => {
    const documento = soloDigitos(form.numeroDocumento);
    if (!documento) return notify('Digita la cédula o el NIT', 'err');
    if (DOCUMENTOS_GENERICOS.has(documento)) return notify('El consumidor final no se consulta en Siesa', 'err');
    setBuscandoSiesa(true);
    try {
      const r = await api.get(`/clientes/siesa/tercero/${documento}`);
      if (!r.existe) return notify(`El tercero ${documento} no existe en Siesa`, 'err');
      if (!r.datos) return notify(`El tercero ${documento} existe en Siesa, pero no como cliente: no se pudieron traer sus datos`, 'err');
      // Si el cliente ya esta en el POS se abre en modo edicion para no duplicarlo.
      if (!editando) {
        const locales = await api.get(`/clientes?q=${encodeURIComponent(documento)}`);
        const local = locales.find((c) => soloDigitos(c.numeroDocumento || c.documento) === documento);
        if (local) empezarEdicion(local);
      }
      const d = r.datos;
      // Los NIT de empresa tienen 9 digitos y empiezan por 8 o 9.
      const juridica = /^[89]\d{8}$/.test(documento);
      setForm((actual) => ({
        ...actual,
        tipoCliente: juridica ? 'JURIDICA' : 'NATURAL',
        tipoDocumento: juridica ? 'NIT' : 'CC',
        numeroDocumento: documento,
        ...(juridica
          ? { razonSocial: d.nombre.toUpperCase().slice(0, 50) }
          : {
            primerApellido: d.primerApellido.toUpperCase().slice(0, 15),
            segundoApellido: d.segundoApellido.toUpperCase().slice(0, 15),
            nombres: d.nombres.toUpperCase().slice(0, 20),
          }),
        direccion: (d.direccion || actual.direccion).toUpperCase().slice(0, 40),
        telefono: (d.telefono || actual.telefono).slice(0, 20),
        email: (d.email || actual.email).slice(0, 50),
        municipioSiesaCodigo: d.municipioCodigo || actual.municipioSiesaCodigo,
        ciudad: d.ciudadNombre || actual.ciudad,
      }));
      if (d.departamentoCodigo) setDepartamentoSiesaCodigo(d.departamentoCodigo);
      notify('Datos traídos de Siesa: revísalos y guarda para actualizarlos');
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBuscandoSiesa(false);
    }
  };

  // Persona natural se identifica con cedula y persona juridica con NIT, como lo pide la creacion de terceros.
  const cambiarTipoPersona = (tipoCliente) => setForm((actual) => ({
    ...actual,
    tipoCliente,
    tipoDocumento: tipoCliente === 'JURIDICA' ? 'NIT' : 'CC',
  }));

  // Datos que se guardan y se envian a Siesa: apellidos combinados y solo los nombres del tipo de persona elegido.
  const datosCliente = () => {
    const juridica = form.tipoCliente === 'JURIDICA';
    return {
      ...form,
      tipoDocumento: form.tipoDocumento || (juridica ? 'NIT' : 'CC'),
      razonSocial: juridica ? form.razonSocial.trim() : '',
      nombres: juridica ? '' : form.nombres.trim(),
      apellidos: juridica ? '' : [form.primerApellido, form.segundoApellido].map((s) => s.trim()).filter(Boolean).join(' '),
      primerApellido: juridica ? '' : form.primerApellido.trim(),
      segundoApellido: juridica ? '' : form.segundoApellido.trim(),
    };
  };

  const guardarCliente = async ({ enviarSiesa = false, actualizar = false } = {}) => {
    const datos = datosCliente();
    if (editando) await api.put(`/clientes/${editando}`, datos);
    else await api.post('/clientes', datos);
    const accion = editando ? 'Cliente actualizado' : 'Cliente agregado';
    if (enviarSiesa) {
      try {
        const r = await api.post('/clientes/siesa/tercero', { ...datos, actualizar });
        notify(`${accion} y tercero ${r.accion} en Siesa`);
      } catch (err) {
        notify(`${accion} en el POS, pero Siesa: ${err.message}`, 'err');
      }
    } else {
      notify(accion);
    }
    cancelar();
    cargar(busqueda.trim());
  };

  const guardar = async (e) => {
    e.preventDefault();
    const juridica = form.tipoCliente === 'JURIDICA';
    const documento = String(form.numeroDocumento || '').trim();
    if (!documento) return notify(juridica ? 'Indica el NIT' : 'Indica el número de cédula', 'err');
    if (juridica && !form.razonSocial.trim()) return notify('Indica la razón social', 'err');
    if (!juridica && (!form.primerApellido.trim() || !form.nombres.trim())) return notify('Indica el primer apellido y los nombres', 'err');
    if (!form.direccion.trim()) return notify('Indica la dirección', 'err');
    if (!form.municipioSiesaCodigo) return notify('Selecciona el departamento y la ciudad', 'err');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return notify('Correo inválido', 'err');
    setGuardando(true);
    try {
      let siesa = null;
      if (!DOCUMENTOS_GENERICOS.has(documento)) {
        try {
          siesa = await api.post('/clientes/siesa/consultar', datosCliente());
        } catch (err) {
          if (!confirm(`No se pudo consultar Siesa: ${err.message}\n\n¿Guardar el cliente solo en el POS?`)) return;
        }
      }
      if (siesa?.disponible && siesa.existe) {
        setConfirmacionSiesa(siesa);
        return;
      }
      await guardarCliente({ enviarSiesa: Boolean(siesa?.disponible) });
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  // El tercero ya existe en Siesa: actualizarlo con lo digitado (y guardar el cliente) o volver al formulario.
  const confirmarActualizacionSiesa = async () => {
    setGuardando(true);
    try {
      await guardarCliente({ enviarSiesa: true, actualizar: true });
      setConfirmacionSiesa(null);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const enviarASiesa = async (c) => {
    try {
      const resultado = await api.post(`/clientes/${c.id}/enviar-siesa`, {});
      const bien = ['OK', 'PROGRAMADO'].includes(resultado.estado);
      notify(bien ? resultado.mensaje : `Siesa: ${resultado.mensaje || resultado.estado}`, bien ? 'ok' : 'err');
    } catch (err) {
      notify(err.message, 'err');
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
                      <button className="btn btn-sm" title="Enviar o actualizar en Siesa" onClick={() => enviarASiesa(c)}>Siesa</button>
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
          onClose={confirmacionSiesa ? undefined : cancelar}
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
            <p className="mini" style={{ marginTop: 0 }}>
              Datos del tercero que se envían a Siesa (los campos con * son obligatorios).
            </p>
            <div className="grid form-3col" style={{ gap: 12 }}>
              <div className="field">
                <label>Tipo de persona *</label>
                <select value={form.tipoCliente} onChange={(e) => cambiarTipoPersona(e.target.value)}>
                  <option value="NATURAL">Persona natural (cédula)</option>
                  <option value="JURIDICA">Persona jurídica (NIT)</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>{form.tipoCliente === 'JURIDICA' ? 'NIT *' : 'Número de cédula *'}{buscandoSiesa ? ' · buscando en Siesa…' : ''}</label>
                <input
                  value={form.numeroDocumento}
                  onChange={(e) => setForm({ ...form, numeroDocumento: soloDigitos(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarEnSiesa(); } }}
                  inputMode="numeric"
                  maxLength={MAX_DOCUMENTO}
                  disabled={buscandoSiesa}
                  placeholder="Solo números · Enter para buscar en Siesa"
                />
              </div>
              {form.tipoCliente === 'JURIDICA' ? (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Razón social *</label>
                  <input value={form.razonSocial} maxLength={50} onChange={(e) => setForm({ ...form, razonSocial: e.target.value.toUpperCase() })} placeholder="Razón social de la empresa" />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Primer apellido *</label>
                    <input value={form.primerApellido} maxLength={15} onChange={(e) => setForm({ ...form, primerApellido: e.target.value.toUpperCase() })} placeholder="Primer apellido" />
                  </div>
                  <div className="field">
                    <label>Segundo apellido</label>
                    <input value={form.segundoApellido} maxLength={15} onChange={(e) => setForm({ ...form, segundoApellido: e.target.value.toUpperCase() })} placeholder="Segundo apellido" />
                  </div>
                  <div className="field">
                    <label>Nombres *</label>
                    <input value={form.nombres} maxLength={20} onChange={(e) => setForm({ ...form, nombres: e.target.value.toUpperCase() })} placeholder="Nombres" />
                  </div>
                </>
              )}
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Dirección *</label>
                <input value={form.direccion} maxLength={40} onChange={(e) => setForm({ ...form, direccion: e.target.value.toUpperCase() })} placeholder="Ej. CL 45 # 20-10" />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={form.telefono} maxLength={20} inputMode="tel" onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Número de teléfono" />
              </div>
              <div className="field">
                <label>Departamento *</label>
                <BuscadorUbicacionSiesa
                  items={departamentosSiesa}
                  value={departamentoSiesaCodigo}
                  placeholder="Seleccionar departamento…"
                  placeholderBusqueda="Buscar código o departamento…"
                  onChange={(codigo) => {
                    setDepartamentoSiesaCodigo(codigo);
                    setForm({ ...form, municipioSiesaCodigo: '', ciudad: '' });
                  }}
                />
              </div>
              <div className="field">
                <label>Ciudad *</label>
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
                <label>Correo</label>
                <input type="email" maxLength={50} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {confirmacionSiesa && (
        <Modal
          title="El cliente ya existe en Siesa"
          subtitle={`Documento ${confirmacionSiesa.tercero.nit} · ${confirmacionSiesa.resultado === 2 ? 'existe como tercero y como cliente' : 'existe como tercero'}`}
          onClose={guardando ? undefined : () => setConfirmacionSiesa(null)}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setConfirmacionSiesa(null)} disabled={guardando}>Cancelar</Button>
              <Button variant="primary" onClick={confirmarActualizacionSiesa} loading={guardando}>Actualizar datos en Siesa</Button>
            </>
          )}
        >
          <p style={{ marginTop: 0 }}>
            ¿Deseas reemplazar los datos del tercero en Siesa con la información digitada? Si cancelas, vuelves al formulario y no se guarda nada.
          </p>
          <table>
            <thead><tr><th>Campo</th><th>Hoy en Siesa</th><th>Información digitada</th></tr></thead>
            <tbody>
              {[
                ['Nombre', confirmacionSiesa.existente?.nombre, confirmacionSiesa.tercero.razon_social],
                ['Dirección', confirmacionSiesa.existente?.direccion, confirmacionSiesa.tercero.direccion],
                ['Teléfono', confirmacionSiesa.existente?.telefono, confirmacionSiesa.tercero.telefono],
                ['Correo', confirmacionSiesa.existente?.email, confirmacionSiesa.tercero.correo_electronico],
              ].map(([campo, actual, nuevo]) => (
                <tr key={campo}>
                  <td style={{ fontWeight: 600 }}>{campo}</td>
                  <td className="mini">{actual || '—'}</td>
                  <td className="mini" style={actual && nuevo && String(actual).toUpperCase() !== String(nuevo).toUpperCase() ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{nuevo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!confirmacionSiesa.existente && <p className="mini">No se pudieron leer los datos actuales de Siesa; solo se sabe que el tercero existe.</p>}
        </Modal>
      )}
    </div>
  );
}
