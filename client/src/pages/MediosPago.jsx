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
  formaPago: '',
  manejaDocumento: false,
  cuenta: '',
  exportado: false,
  consignarEn: '',
  tipoDatafono: 'Ninguno',
  idBodega: 0,
  formaPagoDian: DIAN[0],
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
      formaPago: r.formaPago || '',
      manejaDocumento: !!r.manejaDocumento,
      cuenta: r.cuenta || '',
      exportado: !!r.exportado,
      consignarEn: r.consignarEn || '',
      tipoDatafono: r.tipoDatafono || 'Ninguno',
      idBodega: r.idBodega ?? 0,
      formaPagoDian: r.formaPagoDian || DIAN[0],
      activo: r.activo !== false,
    });
    setModal(true);
  };
  const cerrar = () => { setModal(false); setEditId(null); setForm(VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.formaPago.trim()) return notify('El nombre de la forma de pago es obligatorio', 'err');
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
        subtitle="Maestro de formas de pago: efectivo, transferencia, QR, tarjetas, bancos, datáfono, etc."
        actions={puedeCrear && <Button variant="primary" icon="add" onClick={nuevo} title="Nueva forma de pago" />}
      />

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Forma de pago</th>
                <th>Maneja documento</th>
                <th>Cuenta</th>
                <th>Exportado</th>
                <th>Consignar en</th>
                <th>Tipo datáfono</th>
                <th>Id bodega</th>
                <th>Forma pago DIAN</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.formaPago}</td>
                  <td>{r.manejaDocumento ? 'S' : 'N'}</td>
                  <td>{r.cuenta || ''}</td>
                  <td>{r.exportado ? 'S' : 'N'}</td>
                  <td>{r.consignarEn || ''}</td>
                  <td>{r.tipoDatafono || ''}</td>
                  <td>{r.idBodega ?? 0}</td>
                  <td>{r.formaPagoDian || ''}</td>
                  <td>{r.activo !== false ? 'Sí' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {puedeEditar && <button className="btn btn-sm" title="Editar" onClick={() => editar(r)}><Icon name="edit" size={16} /></button>}
                    {puedeEliminar && <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(r)} style={{ marginLeft: 6 }}><Icon name="delete" size={16} /></button>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10}><EmptyState icon="caja" title="Sin formas de pago" description="Crea la primera forma de pago (ej. EFECTIVO, TRANSFERENCIA, QR)." /></td></tr>}
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
            <div className="field">
              <label>Forma de pago</label>
              <input placeholder="Ej. EFECTIVO, TRANSFERENCIA, QR" value={form.formaPago} onChange={(e) => set('formaPago', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} autoFocus />
            </div>
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
