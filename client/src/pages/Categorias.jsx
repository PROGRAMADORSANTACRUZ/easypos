import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const VACIO = { nombre: '', impresoraIp: '', impresoraPuerto: '9100' };

// Parámetros → Categorías: agrupan los platos/productos para diferenciarlos al
// seleccionarlos en Mesas y Facturación (ej. Bebidas, Especialidades, Combos).
// Cada categoría puede tener su propia impresora de cocina (ESC/POS por red) para que
// la comanda de cada plato salga en la estación correcta (cocina, bar, postres...).
export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(null);
  const notify = useToast();

  const cargar = async () => {
    try {
      setCategorias(await api.get('/productos/categorias'));
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const nuevo = () => { setEditId(null); setForm(VACIO); setModal(true); };
  const editar = (c) => {
    setEditId(c.id);
    setForm({ nombre: c.nombre, impresoraIp: c.impresoraIp || '', impresoraPuerto: c.impresoraPuerto ? String(c.impresoraPuerto) : '9100' });
    setModal(true);
  };
  const cerrar = () => { setModal(false); setEditId(null); setForm(VACIO); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return notify('El nombre es obligatorio', 'err');
    const payload = {
      nombre: form.nombre.trim(),
      impresoraIp: form.impresoraIp.trim() || null,
      impresoraPuerto: Number(form.impresoraPuerto) || 9100,
    };
    try {
      setGuardando(true);
      if (editId) {
        await api.put(`/productos/categorias/${editId}`, payload);
        notify('Categoría actualizada');
      } else {
        await api.post('/productos/categorias', payload);
        notify('Categoría creada');
      }
      cerrar();
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    try {
      await api.del(`/productos/categorias/${c.id}`);
      notify('Categoría eliminada');
      await cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const probarImpresora = async (c) => {
    try {
      setProbando(c.id);
      await api.post(`/productos/categorias/${c.id}/probar-impresora`, {});
      notify(`Ticket de prueba enviado a ${c.impresoraIp}`);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setProbando(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle="Agrupa los platos/productos y asigna la impresora de cocina de cada estación (cocina, bar, postres...)."
        actions={<Button variant="primary" icon="add" onClick={nuevo} title="Nueva categoría" />}
      />

      <div className="card">
        {categorias.length === 0 ? (
          <EmptyState
            icon="tags"
            title="Sin categorías"
            description="Crea la primera categoría con el botón “+” de arriba."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Id</th>
                <th>Nombre</th>
                <th>Productos</th>
                <th>Impresora (IP:puerto)</th>
                <th style={{ width: 170 }}></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo}</td>
                  <td>{c.nombre}</td>
                  <td>{c._count?.productos ?? 0}</td>
                  <td>{c.impresoraIp ? `${c.impresoraIp}:${c.impresoraPuerto || 9100}` : <span className="mini">Sin asignar</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {c.impresoraIp && (
                        <button className="btn btn-sm" title="Enviar ticket de prueba" disabled={probando === c.id} onClick={() => probarImpresora(c)}>
                          <Icon name="receipt" size={16} />
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => editar(c)}><Icon name="edit" size={16} /></button>
                      <button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(c)}><Icon name="delete" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={editId ? 'Editar categoría' : 'Nueva categoría'}
          onClose={cerrar}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button variant="primary" type="submit" form="cat-form" loading={guardando}>Guardar</Button>
            </>
          )}
        >
          <form id="cat-form" onSubmit={guardar}>
            {editId && (
              <div className="field">
                <label>Id</label>
                <input value={categorias.find((c) => c.id === editId)?.codigo || ''} disabled />
              </div>
            )}
            <div className="field">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Bebidas" autoFocus required />
            </div>
            <div className="grid form-2col" style={{ gap: 12 }}>
              <div className="field">
                <label>IP de la impresora</label>
                <input value={form.impresoraIp} onChange={(e) => set('impresoraIp', e.target.value)} placeholder="Ej: 192.168.1.50" />
              </div>
              <div className="field">
                <label>Puerto</label>
                <input type="number" value={form.impresoraPuerto} onChange={(e) => set('impresoraPuerto', e.target.value)} placeholder="9100" />
              </div>
            </div>
            <p className="mini">Opcional. Si la dejas vacía, los productos de esta categoría no imprimen comanda automática por estación.</p>
          </form>
        </Modal>
      )}
    </div>
  );
}

