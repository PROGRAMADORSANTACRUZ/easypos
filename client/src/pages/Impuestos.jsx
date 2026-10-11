import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { CRUD_ENTIDADES } from '../crudConfig.js';
import CrudPage from '../components/CrudPage.jsx';
import { Icon } from '../icons.jsx';
import { useAuth, useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const IMPUESTOS_CFG = CRUD_ENTIDADES.find((entidad) => entidad.ruta === '/impuestos')?.cfg;
const VACIO = {
  impuestoId: '',
  companiaCodigo: '',
  centroOperacionCodigo: '',
  porcentaje: '',
  ctaCreditoVentas: '',
  ctaDebitoVentas: '',
  cuentasBase: '',
  cuentasBaseDevoluciones: '',
  ctaDebitoCompras: '',
  ctaCreditoCompras: '',
};

const puede = (user, accion) => user?.__dev === true || (user?.permisos || []).includes(`impuestos.${accion}`);

export default function Impuestos() {
  const { user } = useAuth();
  const notify = useToast();
  const [configuraciones, setConfiguraciones] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [companias, setCompanias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const [lista, listaImpuestos, listaCompanias] = await Promise.all([
        api.get('/impuestos/cuentas-centro'),
        api.get('/impuestos'),
        api.get('/impuestos/alcances'),
      ]);
      setConfiguraciones(Array.isArray(lista) ? lista : []);
      setImpuestos((Array.isArray(listaImpuestos) ? listaImpuestos : []).filter((impuesto) => impuesto.activo !== false));
      setCompanias(Array.isArray(listaCompanias) ? listaCompanias : []);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const centrosDisponibles = companias.find((compania) => compania.codigo === form.companiaCodigo)?.centrosOperacion || [];
  const impuestoBaseSeleccionado = impuestos.find((impuesto) => impuesto.id === form.impuestoId);
  const filasUnificadas = impuestos.flatMap((impuesto) => {
    const cuentasCentro = configuraciones.filter((configuracion) => configuracion.impuestoId === impuesto.id);
    const filasBase = cuentasCentro.length ? [] : [
      {
        id: `general-${impuesto.id}`,
        alcance: 'General',
        impuesto,
        porcentaje: impuesto.porcentaje,
        ctaCreditoVentas: impuesto.ctaCreditoVentas,
        cuentasBase: impuesto.cuentasBase,
        ctaDebitoVentas: impuesto.ctaDebitoVentas,
        cuentasBaseDevoluciones: impuesto.cuentasBaseDevoluciones,
      },
    ];
    return [
      ...filasBase,
      ...cuentasCentro.map((configuracion) => ({
        ...configuracion,
        alcance: `${configuracion.compania.codigo} · ${configuracion.compania.razonSocial}`,
        porcentaje: configuracion.porcentaje ?? impuesto.porcentaje,
      })),
    ];
  });
  const cambiarCompania = (companiaCodigo) => setForm((actual) => ({ ...actual, companiaCodigo, centroOperacionCodigo: '' }));
  const abrirNueva = (impuestoId = '') => {
    setEditId(null);
    setForm({ ...VACIO, impuestoId });
    setModalAbierto(true);
  };
  const editar = (configuracion) => {
    setEditId(configuracion.id);
    setForm({
      impuestoId: configuracion.impuestoId,
      companiaCodigo: configuracion.companiaCodigo,
      centroOperacionCodigo: configuracion.centroOperacionCodigo,
      porcentaje: configuracion.porcentaje ?? '',
      ctaCreditoVentas: configuracion.ctaCreditoVentas || '',
      ctaDebitoVentas: configuracion.ctaDebitoVentas || '',
      cuentasBase: configuracion.cuentasBase || '',
      cuentasBaseDevoluciones: configuracion.cuentasBaseDevoluciones || '',
      ctaDebitoCompras: configuracion.ctaDebitoCompras || '',
      ctaCreditoCompras: configuracion.ctaCreditoCompras || '',
    });
    setModalAbierto(true);
  };
  const cerrar = () => { setModalAbierto(false); setEditId(null); setForm(VACIO); };

  const guardar = async (event) => {
    event.preventDefault();
    if (!form.impuestoId || !form.companiaCodigo || !form.centroOperacionCodigo) {
      return notify('Selecciona impuesto, compañía y centro de operaciones', 'err');
    }
    if (!form.ctaCreditoVentas.trim() || !form.cuentasBase.trim()) {
      return notify('Completa la cuenta de impuesto y la cuenta base de ventas', 'err');
    }
    const payload = {
      ...form,
      porcentaje: form.porcentaje === '' ? null : Number(form.porcentaje),
      ctaCreditoVentas: form.ctaCreditoVentas.trim(),
      ctaDebitoVentas: form.ctaDebitoVentas.trim() || null,
      cuentasBase: form.cuentasBase.trim(),
      cuentasBaseDevoluciones: form.cuentasBaseDevoluciones.trim() || null,
      ctaDebitoCompras: form.ctaDebitoCompras.trim() || null,
      ctaCreditoCompras: form.ctaCreditoCompras.trim() || null,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/impuestos/cuentas-centro/${editId}`, payload);
        notify('Cuentas por centro actualizadas');
      } else {
        await api.post('/impuestos/cuentas-centro', payload);
        notify('Cuentas asignadas al centro');
      }
      cerrar();
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (configuracion) => {
    if (!confirm(`¿Eliminar la configuración de ${configuracion.impuesto.nombre} para ${configuracion.companiaCodigo}/${configuracion.centroOperacionCodigo}?`)) return;
    try {
      await api.del(`/impuestos/cuentas-centro/${configuracion.id}`);
      notify('Configuración eliminada');
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    }
  };

  if (!IMPUESTOS_CFG) return null;

  return (
    <div>
      <PageHeader
        title="Impuestos"
        subtitle="Impuesto, compañía, centro, porcentaje y cuentas contables en una sola vista. Las filas generales son la configuración base."
        actions={puede(user, 'crear') && <Button variant="primary" icon="add" onClick={abrirNueva} title="Nueva configuración por compañía y centro" />}
      />
      <div className="card crud-table-scroll" role="region" aria-label="Impuestos y cuentas por compañía y centro" tabIndex={0}>
        {cargando ? <div className="empty">Cargando configuraciones...</div> : filasUnificadas.length === 0 ? (
          <EmptyState title="Sin impuestos" description="Crea primero un impuesto base y luego podrás asignar cuentas por compañía y centro." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Impuesto</th><th>Alcance</th><th>Centro</th><th>% aplicado</th><th>Cuenta impuesto ventas</th><th>Cuenta base</th><th>Cuenta impuesto devolución</th><th>Cuenta base devolución</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filasUnificadas.map((fila) => {
                const esGeneral = fila.alcance === 'General';
                return (
                  <tr key={fila.id}>
                    <td>{fila.impuesto.nombre}</td>
                    <td>{fila.alcance}</td>
                    <td>{esGeneral ? 'Todos / predeterminado' : `${fila.centroOperacion.codigo} · ${fila.centroOperacion.descripcion}`}</td>
                    <td>{fila.porcentaje}%{esGeneral ? ' · base' : ''}</td>
                    <td>{fila.ctaCreditoVentas || '—'}</td>
                    <td>{fila.cuentasBase || '—'}</td>
                    <td>{fila.ctaDebitoVentas || '—'}</td>
                    <td>{fila.cuentasBaseDevoluciones || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {esGeneral ? (
                        <button type="button" className="btn btn-sm" title="Asignar a compañía y centro" onClick={() => abrirNueva(fila.impuesto.id)}>
                          <Icon name="edit" size={16} />
                        </button>
                      ) : (
                        <>
                          {puede(user, 'editar') && <button className="btn btn-sm" title="Editar" onClick={() => editar(fila)}><Icon name="edit" size={16} /></button>}
                          {puede(user, 'eliminar') && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(fila)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <details id="impuestos-base-details" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, padding: '10px 0' }}>Administrar definiciones base de impuestos</summary>
        <CrudPage cfg={IMPUESTOS_CFG} />
      </details>

      {modalAbierto && (
        <Modal
          title={editId ? 'Editar cuentas por centro' : 'Configurar cuentas por centro'}
          onClose={cerrar}
          size="lg"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="impuesto-centro-form" loading={guardando}>{editId ? 'Guardar cambios' : 'Guardar configuración'}</Button>
            </>
          )}
        >
          <form id="impuesto-centro-form" onSubmit={guardar}>
            <div className="grid grid-2">
              <div className="field">
                <label>Impuesto base *</label>
                <select value={form.impuestoId} onChange={(event) => setForm((actual) => ({ ...actual, impuestoId: event.target.value }))}>
                  <option value="">Seleccionar impuesto...</option>
                  {impuestos.map((impuesto) => <option key={impuesto.id} value={impuesto.id}>{impuesto.nombre} · {impuesto.porcentaje}%</option>)}
                </select>
              </div>
              <div className="field">
                <label>Compañía *</label>
                <select value={form.companiaCodigo} onChange={(event) => cambiarCompania(event.target.value)}>
                  <option value="">Seleccionar compañía...</option>
                  {companias.map((compania) => <option key={compania.codigo} value={compania.codigo}>{compania.codigo} · {compania.razonSocial}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Centro de operaciones *</label>
                <select value={form.centroOperacionCodigo} onChange={(event) => setForm((actual) => ({ ...actual, centroOperacionCodigo: event.target.value }))} disabled={!form.companiaCodigo}>
                  <option value="">Seleccionar centro...</option>
                  {centrosDisponibles.map((centro) => <option key={centro.codigo} value={centro.codigo}>{centro.codigo} · {centro.descripcion}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Porcentaje para este centro (opcional)</label>
                <input type="number" min="0" max="100" step="0.01" value={form.porcentaje} onChange={(event) => setForm((actual) => ({ ...actual, porcentaje: event.target.value }))} placeholder={`Usar tasa base${impuestoBaseSeleccionado ? `: ${impuestoBaseSeleccionado.porcentaje}%` : ''}`} />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field"><label>Cuenta impuesto ventas *</label><input value={form.ctaCreditoVentas} onChange={(event) => setForm((actual) => ({ ...actual, ctaCreditoVentas: event.target.value }))} /></div>
              <div className="field"><label>Cuenta base ventas *</label><input value={form.cuentasBase} onChange={(event) => setForm((actual) => ({ ...actual, cuentasBase: event.target.value }))} /></div>
              <div className="field"><label>Cuenta impuesto devolución</label><input value={form.ctaDebitoVentas} onChange={(event) => setForm((actual) => ({ ...actual, ctaDebitoVentas: event.target.value }))} /></div>
              <div className="field"><label>Cuenta base devolución</label><input value={form.cuentasBaseDevoluciones} onChange={(event) => setForm((actual) => ({ ...actual, cuentasBaseDevoluciones: event.target.value }))} /></div>
              <div className="field"><label>Cuenta débito compras</label><input value={form.ctaDebitoCompras} onChange={(event) => setForm((actual) => ({ ...actual, ctaDebitoCompras: event.target.value }))} /></div>
              <div className="field"><label>Cuenta crédito compras</label><input value={form.ctaCreditoCompras} onChange={(event) => setForm((actual) => ({ ...actual, ctaCreditoCompras: event.target.value }))} /></div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
