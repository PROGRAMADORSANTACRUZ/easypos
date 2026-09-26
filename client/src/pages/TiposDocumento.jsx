import { useEffect, useState, Fragment } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);

// Clases de documento que se parametrizan (facturas, cortesías, documentos soporte, notas, factura de venta, etc.).
const CLASES = [
  'FACTURA ELECTRONICA DE VENTA',
  'CORTESIA',
  'DOCUMENTO SOPORTE',
  'NOTA CREDITO',
  'NOTA DEBITO',
  'FACTURA DE VENTA (NO ELECTRONICA)',
  'OTRO',
];

const VACIO = {
  clase: CLASES[0],
  esElectronico: true,
  codigo: '',
  automatico: false,
  consInicial: '',
  consFinal: '',
  consProximo: '',
  nroResolucion: '',
  fechaResolucion: '',
  nroMaxItems: '',
  prefijo: '',
  consFormato: '',
  fechaResolucionVcto: '',
  diasAvisoVcto: '',
  tipoIdentificacion: '',
  activo: true,
};

const fecha = (v) => (v ? String(v).slice(0, 10) : '');

// Clases que la DIAN considera documento electrónico (se reportan a Factus). Las demás son documentos internos.
const CLASES_ELECTRONICAS = ['FACTURA ELECTRONICA DE VENTA', 'NOTA CREDITO', 'NOTA DEBITO', 'DOCUMENTO SOPORTE'];

// Parámetros → Tipos de documentos: clases DIAN con rango de consecutivos, resolución y prefijo.
export default function TiposDocumento() {
  const { user } = useAuth();
  const notify = useToast();

  const puedeCrear = puede(user, 'empresa.crear') || puede(user, 'empresa.ver');
  const puedeEditar = puede(user, 'empresa.editar') || puede(user, 'empresa.ver');
  const puedeEliminar = puede(user, 'empresa.eliminar') || puede(user, 'empresa.ver');

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const lista = await api.get('/tipos-documento');
      setRows(Array.isArray(lista) ? lista : []);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  // Al elegir la clase, sugiere automáticamente si es electrónica (el usuario puede cambiarlo después).
  const cambiarClase = (clase) => setForm((f) => ({ ...f, clase, esElectronico: CLASES_ELECTRONICAS.includes(clase) }));

  const nuevo = () => { setEditId(null); setForm(VACIO); setModal(true); };
  const editar = (r) => {
    setEditId(r.id);
    setForm({
      clase: r.clase || '',
      esElectronico: r.esElectronico !== false,
      codigo: r.codigo || '',
      automatico: !!r.automatico,
      consInicial: r.consInicial ?? '',
      consFinal: r.consFinal ?? '',
      consProximo: r.consProximo ?? '',
      nroResolucion: r.nroResolucion || '',
      fechaResolucion: fecha(r.fechaResolucion),
      nroMaxItems: r.nroMaxItems ?? '',
      prefijo: r.prefijo || '',
      consFormato: r.consFormato || '',
      fechaResolucionVcto: fecha(r.fechaResolucionVcto),
      diasAvisoVcto: r.diasAvisoVcto ?? '',
      tipoIdentificacion: r.tipoIdentificacion || '',
      activo: r.activo !== false,
    });
    setModal(true);
  };
  const cerrar = () => { setModal(false); setEditId(null); setForm(VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.clase.trim()) return notify('La clase es obligatoria', 'err');
    if (!form.codigo.trim()) return notify('El código (C.O) es obligatorio', 'err');
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/tipos-documento/${editId}`, form);
        notify('Tipo de documento actualizado');
      } else {
        await api.post('/tipos-documento', form);
        notify('Tipo de documento creado');
      }
      cerrar();
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar el tipo de documento ${r.codigo}?`)) return;
    try {
      await api.del(`/tipos-documento/${r.id}`);
      notify('Tipo de documento eliminado');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Tipos de documentos"
        subtitle="Clases de documento DIAN con su rango de consecutivos, resolución y prefijo."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={nuevo} title="Nuevo tipo" />}
      />

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Automático</th>
                <th>Electrónico</th>
                <th>C.O</th>
                <th>Cons inicial</th>
                <th>Cons final</th>
                <th>Cons próximo</th>
                <th>Nro resolución</th>
                <th>Fecha resolución</th>
                <th>Nro max items</th>
                <th>Prefijo</th>
                <th>Fecha resolución vcto</th>
                <th>Días aviso vcto</th>
                <th>Tipo identificación</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const esNuevaClase = i === 0 || rows[i - 1].clase !== r.clase;
                return (
                  <Fragment key={r.id}>
                    {esNuevaClase && (
                      <tr className="fila-grupo">
                        <td colSpan={14} style={{ fontWeight: 700, background: 'var(--panel-2, #f2f4f8)' }}>{r.clase}</td>
                      </tr>
                    )}
                    <tr>
                      <td>{r.automatico ? 'Sí' : 'No'}</td>
                      <td>
                        <span className={`badge ${r.esElectronico !== false ? 'green' : 'gray'}`}>
                          {r.esElectronico !== false ? 'Electrónico' : 'No electrónico'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.codigo}</td>
                      <td>{r.consInicial ?? ''}</td>
                      <td>{r.consFinal?.toLocaleString?.('es-CO') ?? ''}</td>
                      <td>{r.consProximo?.toLocaleString?.('es-CO') ?? ''}</td>
                      <td>{r.nroResolucion || ''}</td>
                      <td>{fecha(r.fechaResolucion)}</td>
                      <td>{r.nroMaxItems ?? ''}</td>
                      <td>{r.prefijo || ''}</td>
                      <td>{fecha(r.fechaResolucionVcto)}</td>
                      <td>{r.diasAvisoVcto ?? ''}</td>
                      <td>{r.tipoIdentificacion || ''}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>}
                        {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {!rows.length && <tr><td colSpan={14}><EmptyState icon="resoluciones" title="Sin tipos de documento" description="Crea el primer tipo de documento (ej. 01F - FACTURA ELECTRONICA DE VENTA)." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}
          onClose={cerrar}
          footer={(
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="tipodoc-form" disabled={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="tipodoc-form" onSubmit={guardar}>
            <div className="field">
              <label>Clase</label>
              <select value={form.clase} onChange={(e) => cambiarClase(e.target.value)} autoFocus>
                {CLASES.map((c) => <option key={c} value={c}>{c}</option>)}
                {form.clase && !CLASES.includes(form.clase) && <option value={form.clase}>{form.clase}</option>}
              </select>
            </div>
            <div
              className="field"
              style={{
                border: `1px solid ${form.esElectronico ? 'var(--green)' : 'var(--border-strong)'}`,
                borderRadius: 8,
                padding: 12,
                background: form.esElectronico ? 'var(--green-soft, rgba(31,157,85,.08))' : 'var(--panel-2)',
              }}
            >
              <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={!!form.esElectronico} onChange={(e) => set('esElectronico', e.target.checked)} />
                <b>¿Es un documento electrónico (DIAN)?</b>
              </label>
              <div className="mini" style={{ color: 'var(--muted)' }}>
                {form.esElectronico
                  ? 'Sí: este documento se reporta a la DIAN a través de Factus (CUFE, QR, etc.).'
                  : 'No: es un documento interno de la empresa, no se envía a la DIAN ni a Factus.'}
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>C.O (código)</label>
                <input placeholder="Ej. 402" value={form.codigo} onChange={(e) => set('codigo', e.target.value)} />
              </div>
              <div className="field">
                <label>Prefijo</label>
                <input placeholder="Ej. MA1C" value={form.prefijo} onChange={(e) => set('prefijo', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Cons inicial</label>
                <input type="number" value={form.consInicial} onChange={(e) => set('consInicial', e.target.value)} />
              </div>
              <div className="field">
                <label>Cons final</label>
                <input type="number" value={form.consFinal} onChange={(e) => set('consFinal', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Cons próximo</label>
                <input type="number" value={form.consProximo} onChange={(e) => set('consProximo', e.target.value)} />
              </div>
              <div className="field">
                <label>Nro max items</label>
                <input type="number" value={form.nroMaxItems} onChange={(e) => set('nroMaxItems', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Nro resolución</label>
              <input placeholder="Ej. 18764103045112" value={form.nroResolucion} onChange={(e) => set('nroResolucion', e.target.value)} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Fecha resolución</label>
                <input type="date" value={form.fechaResolucion} onChange={(e) => set('fechaResolucion', e.target.value)} />
              </div>
              <div className="field">
                <label>Fecha resolución vcto</label>
                <input type="date" value={form.fechaResolucionVcto} onChange={(e) => set('fechaResolucionVcto', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Días aviso vcto</label>
                <input type="number" value={form.diasAvisoVcto} onChange={(e) => set('diasAvisoVcto', e.target.value)} />
              </div>
              <div className="field">
                <label>Cons formato</label>
                <input value={form.consFormato} onChange={(e) => set('consFormato', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Tipo identificación</label>
              <input value={form.tipoIdentificacion} onChange={(e) => set('tipoIdentificacion', e.target.value)} />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.automatico} onChange={(e) => set('automatico', e.target.checked)} />
                  Automático
                </label>
              </div>
              <div className="field">
                <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.activo} onChange={(e) => set('activo', e.target.checked)} />
                  Activo
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
