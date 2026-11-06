import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast, useAuth } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const puede = (user, codigo) => user?.__dev === true || (user?.permisos || []).includes(codigo);

// Codigos DIAN de forma de pago (medios de pago mas usados).
const DIAN = [
  '10-Efectivo',
  '20-Cheque',
  '42-Consignación bancaria',
  '47-Transferencia',
  '48-Tarjeta Crédito',
  '49-Tarjeta Débito',
  '71-Bonos',
  'ZZZ-Otro',
];

const DATAFONO = ['Ninguno', 'Redeban', 'Credibanco', 'Otro'];

const VACIO = {
  cptoCaja: '',
  claseConcepto: 'RECOGIDA',
  formaPago: '',
  medioPago: '',
  moneda: 'COP',
  manejaDocumento: false,
  cuenta: '',
  exportado: false,
  consignarEn: '',
  tipoDatafono: 'Ninguno',
  idBodega: 0,
  formaPagoDian: '',
  activo: true,
};

// Parámetros → Medios de pago: maestro de formas de pago (efectivo, transferencia, QR, tarjetas, bancos...).
export default function MediosPago() {
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
      const lista = await api.get('/formas-pago');
      setRows(Array.isArray(lista) ? lista : []);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const nuevo = () => { setEditId(null); setForm(VACIO); setModal(true); };
  const editar = (r) => {
    setEditId(r.id);
    setForm({
      cptoCaja: r.id,
      claseConcepto: r.claseConcepto || 'RECOGIDA',
      formaPago: r.formaPago || '',
      medioPago: r.medioPago || r.id,
      moneda: r.moneda || 'COP',
      manejaDocumento: !!r.manejaDocumento,
      cuenta: r.cuenta || '',
      exportado: !!r.exportado,
      consignarEn: r.consignarEn || '',
      tipoDatafono: r.tipoDatafono || 'Ninguno',
      idBodega: r.idBodega ?? 0,
      formaPagoDian: r.formaPagoDian || '',
      activo: r.activo !== false,
    });
    setModal(true);
  };
  const cerrar = () => { setModal(false); setEditId(null); setForm(VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.cptoCaja.trim() || !form.formaPago.trim() || !form.medioPago.trim() || !form.moneda.trim()) {
      return notify('Completa Cpto. caja, descripción, medio de pago y moneda', 'err');
    }
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/formas-pago/${editId}`, form);
        notify('Forma de pago actualizada');
      } else {
        await api.post('/formas-pago', form);
        notify('Forma de pago creada');
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
    if (!confirm(`¿Eliminar la forma de pago ${r.formaPago}?`)) return;
    try {
      await api.del(`/formas-pago/${r.id}`);
      notify('Forma de pago eliminada');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Medios de pago"
        subtitle="Conceptos de caja y medios de pago."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={nuevo} title="Nueva forma de pago" />}
      />

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Clase cpto.</th>
                <th>Cpto. caja</th>
                <th>Desc. Cpto. caja</th>
                <th>Medio pago</th>
                <th>Moneda</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.claseConcepto === 'ADICION' ? 'Adición' : 'Recogida'}</td>
                  <td style={{ fontWeight: 700 }}>{r.id}</td>
                  <td style={{ fontWeight: 600 }}>{r.formaPago}</td>
                  <td>{r.medioPago}</td>
                  <td>{r.moneda}</td>
                  <td>{r.activo !== false ? 'Sí' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}><EmptyState icon="caja" title="Sin conceptos de caja" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Editar forma de pago' : 'Nueva forma de pago'}
          onClose={cerrar}
          footer={(
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="formapago-form" disabled={guardando}>{editId ? 'Guardar cambios' : 'Crear'}</Button>
            </>
          )}
        >
          <form id="formapago-form" onSubmit={guardar}>
            <div className="grid form-2col">
              <div className="field">
                <label htmlFor="clase-concepto">Clase cpto.</label>
                <select id="clase-concepto" value={form.claseConcepto} onChange={(e) => set('claseConcepto', e.target.value)}>
                  <option value="ADICION">Adición</option>
                  <option value="RECOGIDA">Recogida</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cpto-caja">Cpto. caja</label>
                <input id="cpto-caja" maxLength={10} required readOnly={editId !== null} autoFocus={!editId}
                  value={form.cptoCaja} onChange={(e) => {
                    const codigo = e.target.value.toUpperCase();
                    setForm((actual) => ({ ...actual, cptoCaja: codigo, medioPago: !actual.medioPago || actual.medioPago === actual.cptoCaja ? codigo : actual.medioPago }));
                  }} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="descripcion-concepto">Desc. Cpto. caja</label>
              <input id="descripcion-concepto" maxLength={120} required value={form.formaPago} onChange={(e) => set('formaPago', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="grid form-2col">
              <div className="field">
                <label htmlFor="medio-pago">Medio pago</label>
                <input id="medio-pago" maxLength={10} required value={form.medioPago} onChange={(e) => set('medioPago', e.target.value.toUpperCase())} />
              </div>
              <div className="field">
                <label htmlFor="moneda-pago">Moneda</label>
                <input id="moneda-pago" maxLength={3} required value={form.moneda} onChange={(e) => set('moneda', e.target.value.toUpperCase())} />
              </div>
            </div>
            <details>
              <summary style={{ cursor: 'pointer', marginBottom: 12 }}>Parámetros contables y DIAN</summary>
            <div className="grid grid-2">
              <div className="field">
                <label>Cuenta contable</label>
                <input placeholder="Ej. 1105050100" value={form.cuenta} onChange={(e) => set('cuenta', e.target.value)} />
              </div>
              <div className="field">
                <label>Consignar en</label>
                <input placeholder="Banco / caja destino" value={form.consignarEn} onChange={(e) => set('consignarEn', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Tipo datáfono</label>
                <select value={form.tipoDatafono} onChange={(e) => set('tipoDatafono', e.target.value)}>
                  {DATAFONO.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Id bodega</label>
                <input type="number" min="0" value={form.idBodega} onChange={(e) => set('idBodega', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Forma de pago DIAN</label>
              <select value={form.formaPagoDian} onChange={(e) => set('formaPagoDian', e.target.value)}>
                <option value="">Sin asignar</option>
                {DIAN.map((d) => <option key={d} value={d}>{d}</option>)}
                {form.formaPagoDian && !DIAN.includes(form.formaPagoDian) && <option value={form.formaPagoDian}>{form.formaPagoDian}</option>}
              </select>
            </div>
            <div className="grid grid-2">
              <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.manejaDocumento} onChange={(e) => set('manejaDocumento', e.target.checked)} />
                Maneja documento
              </label>
              <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.exportado} onChange={(e) => set('exportado', e.target.checked)} />
                Exportado
              </label>
            </div>
            </details>
            <div className="field">
              <label className="mini" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
                Activo
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
