import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState, LoadingState } from '../components/ui/index.jsx';

const NUEVO_VACIO = {
  slug: '', nombre: '', nit: '', nombreComercial: '', direccion: '', telefono: '', correo: '',
  ambienteDIAN: 'PRUEBAS', adminUsuario: 'admin', adminPassword: '',
};

const EMPRESA_VACIA = {
  nit: '', razonSocial: '', nombreComercial: '', direccion: '', telefono: '', correo: '', ambienteDIAN: 'PRUEBAS',
};

const RESOLUCION_VACIA = {
  prefijo: '', numeroResolucion: '', rangoInicial: '', rangoFinal: '', siguienteNumero: '', fechaInicio: '', fechaFin: '',
};

const MODULOS_RESTAURANTE = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'inventario', label: 'Inventario y Compras' },
  { id: 'dian', label: 'Facturación DIAN' },
  { id: 'parametros', label: 'Parámetros' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'maestros', label: 'Maestros / DIAN' },
  { id: 'admin', label: 'Administración' },
];
const MODULOS_TODOS = MODULOS_RESTAURANTE.map(({ id }) => id);

const aDia = (f) => (f ? new Date(f).toISOString().slice(0, 10) : '');

// Panel de plataforma: administra los restaurantes (cada uno con su propia base de datos),
// su informacion de facturacion (Empresa: nombre, NIT, etc.) y sus resoluciones DIAN.
export default function Restaurantes() {
  const notify = useToast();

  const [restaurantes, setRestaurantes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [creando, setCreando] = useState(false);
  const [credenciales, setCredenciales] = useState(null);

  const [empresaForm, setEmpresaForm] = useState(EMPRESA_VACIA);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [modulosForm, setModulosForm] = useState(MODULOS_TODOS);
  const [guardandoModulos, setGuardandoModulos] = useState(false);

  const [resModalAbierto, setResModalAbierto] = useState(false);
  const [resForm, setResForm] = useState(RESOLUCION_VACIA);
  const [guardandoRes, setGuardandoRes] = useState(false);

  const cargarLista = async () => {
    try {
      setRestaurantes(await api.get('/plataforma/restaurantes'));
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargarLista(); }, []);

  const cargarDetalle = async (id) => {
    setSelId(id);
    setCargandoDetalle(true);
    try {
      const d = await api.get(`/plataforma/restaurantes/${id}/detalle`);
      setDetalle(d);
      setModulosForm(d.restaurante?.modulos || MODULOS_TODOS);
      setEmpresaForm({
        nit: d.empresa?.nit || '',
        razonSocial: d.empresa?.razonSocial || '',
        nombreComercial: d.empresa?.nombreComercial || '',
        direccion: d.empresa?.direccion || '',
        telefono: d.empresa?.telefono || '',
        correo: d.empresa?.correo || '',
        ambienteDIAN: d.empresa?.ambienteDIAN || 'PRUEBAS',
      });
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const guardarModulos = async () => {
    if (!selId) return;
    setGuardandoModulos(true);
    try {
      const restaurante = await api.put(`/plataforma/restaurantes/${selId}/modulos`, { modulos: modulosForm });
      setDetalle((d) => ({ ...d, restaurante }));
      setRestaurantes((lista) => lista.map((r) => (r.id === restaurante.id ? restaurante : r)));
      notify('Módulos del restaurante actualizados');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setGuardandoModulos(false);
    }
  };

  const crearRestaurante = async (e) => {
    e.preventDefault();
    if (!nuevo.nombre.trim()) return notify('El nombre del restaurante es obligatorio', 'err');
    setCreando(true);
    try {
      const r = await api.post('/plataforma/restaurantes', nuevo);
      notify('Restaurante creado con su propia base de datos');
      setCredenciales(r.credencialesAdmin);
      setNuevo(NUEVO_VACIO);
      setNuevoAbierto(false);
      await cargarLista();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setCreando(false);
    }
  };

  const guardarEmpresa = async (e) => {
    e.preventDefault();
    if (!selId) return;
    setGuardandoEmpresa(true);
    try {
      const empresa = await api.put(`/plataforma/restaurantes/${selId}/empresa`, empresaForm);
      setDetalle((d) => ({ ...d, empresa }));
      notify('Datos de facturación actualizados');
      cargarLista();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setGuardandoEmpresa(false);
    }
  };

  const crearResolucion = async (e) => {
    e.preventDefault();
    if (!selId) return;
    if (!resForm.prefijo.trim()) return notify('El prefijo es obligatorio', 'err');
    setGuardandoRes(true);
    try {
      const payload = {
        prefijo: resForm.prefijo.trim(),
        numeroResolucion: resForm.numeroResolucion.trim() || null,
        rangoInicial: resForm.rangoInicial === '' ? null : Number(resForm.rangoInicial),
        rangoFinal: resForm.rangoFinal === '' ? null : Number(resForm.rangoFinal),
        siguienteNumero: resForm.siguienteNumero === '' ? undefined : Number(resForm.siguienteNumero),
        fechaInicio: resForm.fechaInicio || null,
        fechaFin: resForm.fechaFin || null,
      };
      const r = await api.post(`/plataforma/restaurantes/${selId}/resoluciones`, payload);
      setDetalle((d) => ({ ...d, resoluciones: [r, ...(d?.resoluciones || [])] }));
      notify('Resolución agregada');
      setResForm(RESOLUCION_VACIA);
      setResModalAbierto(false);
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setGuardandoRes(false);
    }
  };

  const cambiarEstado = async (r) => {
    const nuevoEstado = r.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    try {
      await api.put(`/plataforma/restaurantes/${r.id}/estado`, { estado: nuevoEstado });
      notify(`Restaurante ${nuevoEstado === 'ACTIVO' ? 'activado' : 'suspendido'}`);
      cargarLista();
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  if (cargando) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Restaurantes"
        subtitle="Cada restaurante tiene su propia base de datos. Administra su información de facturación y resoluciones DIAN."
        actions={<Button variant="primary" icon="add" onClick={() => setNuevoAbierto(true)} title="Nuevo restaurante" />}
      />

      <div className="grid grid-2">
        {/* Lista de restaurantes */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Restaurantes ({restaurantes.length})</h3>
          {restaurantes.length === 0 ? (
            <EmptyState title="Sin restaurantes" description="Crea el primero para empezar." />
          ) : (
            <div className="repartidor-lista">
              {restaurantes.map((r) => (
                <button
                  key={r.id}
                  className={`repartidor-item ${selId === r.id ? 'sel' : ''}`}
                  onClick={() => cargarDetalle(r.id)}
                >
                  <div className="ri-top">
                    <strong>{r.nombre}</strong>
                    <span className={`badge ${r.estado === 'ACTIVO' ? 'green' : 'red'}`}>{r.estado}</span>
                  </div>
                  <div className="mini">{r.nit ? `NIT ${r.nit} · ` : ''}Base: {r.dbNombre}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalle: info de facturacion + resoluciones */}
        <div className="card">
          {!selId ? (
            <p className="empty">Selecciona un restaurante para ver su información.</p>
          ) : cargandoDetalle ? (
            <LoadingState />
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{detalle?.restaurante?.nombre}</h3>
                <button
                  className={`btn btn-sm ${detalle?.restaurante?.estado === 'ACTIVO' ? 'btn-danger' : 'btn-ok'}`}
                  onClick={() => cambiarEstado(detalle.restaurante)}
                >
                  <Icon name={detalle?.restaurante?.estado === 'ACTIVO' ? 'ban' : 'check'} size={14} />
                  {detalle?.restaurante?.estado === 'ACTIVO' ? ' Suspender' : ' Activar'}
                </button>
              </div>

              <h4 style={{ marginBottom: 8 }}>Información que sale en la factura</h4>
              <form onSubmit={guardarEmpresa}>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div className="field">
                    <label>NIT</label>
                    <input value={empresaForm.nit} onChange={(e) => setEmpresaForm((f) => ({ ...f, nit: e.target.value }))} placeholder="NIT" />
                  </div>
                  <div className="field">
                    <label>Razón social</label>
                    <input value={empresaForm.razonSocial} onChange={(e) => setEmpresaForm((f) => ({ ...f, razonSocial: e.target.value }))} placeholder="Razón social" />
                  </div>
                  <div className="field">
                    <label>Nombre comercial</label>
                    <input value={empresaForm.nombreComercial} onChange={(e) => setEmpresaForm((f) => ({ ...f, nombreComercial: e.target.value }))} placeholder="Nombre comercial" />
                  </div>
                  <div className="field">
                    <label>Teléfono</label>
                    <input value={empresaForm.telefono} onChange={(e) => setEmpresaForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Dirección</label>
                    <input value={empresaForm.direccion} onChange={(e) => setEmpresaForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Dirección" />
                  </div>
                  <div className="field">
                    <label>Correo</label>
                    <input type="email" value={empresaForm.correo} onChange={(e) => setEmpresaForm((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@ejemplo.com" />
                  </div>
                  <div className="field">
                    <label>Ambiente DIAN</label>
                    <select value={empresaForm.ambienteDIAN} onChange={(e) => setEmpresaForm((f) => ({ ...f, ambienteDIAN: e.target.value }))}>
                      <option value="PRUEBAS">Pruebas</option>
                      <option value="PRODUCCION">Producción</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={guardandoEmpresa}>
                  <Icon name="save" size={15} /> {guardandoEmpresa ? 'Guardando...' : 'Guardar información'}
                </button>
              </form>

              <div style={{ marginTop: 18 }}>
                <h4 style={{ marginBottom: 8 }}>Módulos habilitados</h4>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  {MODULOS_RESTAURANTE.map(({ id, label }) => (
                    <label key={id} className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={modulosForm.includes(id)}
                        onChange={(e) => setModulosForm((actual) => (
                          e.target.checked ? [...actual, id] : actual.filter((modulo) => modulo !== id)
                        ))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={guardandoModulos || modulosForm.length === 0} onClick={guardarModulos}>
                  <Icon name="save" size={15} /> {guardandoModulos ? 'Guardando...' : 'Guardar módulos'}
                </button>
              </div>

              <div className="row between" style={{ marginTop: 18, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>Resoluciones / documentos DIAN</h4>
                <button className="btn btn-sm" onClick={() => setResModalAbierto(true)}>
                  <Icon name="add" size={14} /> Nueva
                </button>
              </div>
              {(!detalle?.resoluciones || detalle.resoluciones.length === 0) ? (
                <p className="empty">Sin resoluciones registradas.</p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Prefijo</th><th># Resolución</th><th>Rango</th><th>Vigencia</th></tr>
                  </thead>
                  <tbody>
                    {detalle.resoluciones.map((r) => (
                      <tr key={r.id}>
                        <td>{r.prefijo}</td>
                        <td>{r.numeroResolucion || '—'}</td>
                        <td>{r.rangoInicial ?? '—'} - {r.rangoFinal ?? '—'}</td>
                        <td>{aDia(r.fechaInicio)} a {aDia(r.fechaFin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {nuevoAbierto && (
        <Modal
          title="Nuevo restaurante"
          subtitle="Se creará una base de datos independiente para este restaurante."
          onClose={() => setNuevoAbierto(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setNuevoAbierto(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="nuevo-restaurante-form" loading={creando}>Crear restaurante</Button>
            </>
          )}
        >
          <form id="nuevo-restaurante-form" onSubmit={crearRestaurante}>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Nombre del restaurante *</label>
                <input value={nuevo.nombre} onChange={(e) => setNuevo((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Pizzería Don Luigi" />
              </div>
              <div className="field">
                <label>Identificador (slug)</label>
                <input value={nuevo.slug} onChange={(e) => setNuevo((f) => ({ ...f, slug: e.target.value }))} placeholder="Se genera del nombre si lo dejas vacío" />
              </div>
              <div className="field">
                <label>NIT</label>
                <input value={nuevo.nit} onChange={(e) => setNuevo((f) => ({ ...f, nit: e.target.value }))} placeholder="NIT" />
              </div>
              <div className="field">
                <label>Nombre comercial</label>
                <input value={nuevo.nombreComercial} onChange={(e) => setNuevo((f) => ({ ...f, nombreComercial: e.target.value }))} placeholder="Nombre comercial" />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input value={nuevo.telefono} onChange={(e) => setNuevo((f) => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono" />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Dirección</label>
                <input value={nuevo.direccion} onChange={(e) => setNuevo((f) => ({ ...f, direccion: e.target.value }))} placeholder="Dirección" />
              </div>
              <div className="field">
                <label>Correo</label>
                <input type="email" value={nuevo.correo} onChange={(e) => setNuevo((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@ejemplo.com" />
              </div>
              <div className="field">
                <label>Ambiente DIAN</label>
                <select value={nuevo.ambienteDIAN} onChange={(e) => setNuevo((f) => ({ ...f, ambienteDIAN: e.target.value }))}>
                  <option value="PRUEBAS">Pruebas</option>
                  <option value="PRODUCCION">Producción</option>
                </select>
              </div>
              <div className="field">
                <label>Usuario administrador</label>
                <input value={nuevo.adminUsuario} onChange={(e) => setNuevo((f) => ({ ...f, adminUsuario: e.target.value }))} placeholder="admin" />
              </div>
              <div className="field">
                <label>Contraseña administrador</label>
                <input value={nuevo.adminPassword} onChange={(e) => setNuevo((f) => ({ ...f, adminPassword: e.target.value }))} placeholder="Por defecto: admin123" />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {credenciales && (
        <Modal title="Restaurante creado" onClose={() => setCredenciales(null)} footer={<Button variant="primary" onClick={() => setCredenciales(null)}>Entendido</Button>}>
          <p>Usa estas credenciales para iniciar sesión por primera vez en ese restaurante:</p>
          <div className="mesera-card sel" style={{ padding: 12 }}>
            <div><strong>Usuario:</strong> {credenciales.usuario}</div>
            <div><strong>Contraseña:</strong> {credenciales.password}</div>
          </div>
        </Modal>
      )}

      {resModalAbierto && (
        <Modal
          title="Nueva resolución"
          onClose={() => setResModalAbierto(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setResModalAbierto(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="nueva-resolucion-form" loading={guardandoRes}>Guardar</Button>
            </>
          )}
        >
          <form id="nueva-resolucion-form" onSubmit={crearResolucion}>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="field">
                <label>Prefijo *</label>
                <input value={resForm.prefijo} onChange={(e) => setResForm((f) => ({ ...f, prefijo: e.target.value }))} placeholder="Ej. FER" />
              </div>
              <div className="field">
                <label># Resolución DIAN</label>
                <input value={resForm.numeroResolucion} onChange={(e) => setResForm((f) => ({ ...f, numeroResolucion: e.target.value }))} placeholder="180000001" />
              </div>
              <div className="field">
                <label>Rango inicial</label>
                <input type="number" value={resForm.rangoInicial} onChange={(e) => setResForm((f) => ({ ...f, rangoInicial: e.target.value }))} placeholder="1" />
              </div>
              <div className="field">
                <label>Rango final</label>
                <input type="number" value={resForm.rangoFinal} onChange={(e) => setResForm((f) => ({ ...f, rangoFinal: e.target.value }))} placeholder="5000" />
              </div>
              <div className="field">
                <label>Fecha inicio</label>
                <input type="date" value={resForm.fechaInicio} onChange={(e) => setResForm((f) => ({ ...f, fechaInicio: e.target.value }))} />
              </div>
              <div className="field">
                <label>Fecha fin</label>
                <input type="date" value={resForm.fechaFin} onChange={(e) => setResForm((f) => ({ ...f, fechaFin: e.target.value }))} />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
