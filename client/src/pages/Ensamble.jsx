import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Button, EmptyState } from '../components/ui/index.jsx';

const nuevaLinea = () => ({ itemId: '', quantity: '' });

function etiquetaItem(item) {
  return `${item.codigo || 'Sin ref.'} · ${item.nombre} · ${item.unidad} · stock ${item.stock}`;
}

function fechaLocal(value) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function Ensamble() {
  const [items, setItems] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [outputItemId, setOutputItemId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [inputs, setInputs] = useState([nuevaLinea()]);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [inventario, ensambles] = await Promise.all([api.get('/inventario'), api.get('/ensambles')]);
      setItems(inventario);
      setHistorial(ensambles);
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const actualizarLinea = (index, field, value) => {
    setInputs((actuales) => actuales.map((linea, i) => (i === index ? { ...linea, [field]: value } : linea)));
  };

  const guardar = async (event) => {
    event.preventDefault();
    const lineas = inputs
      .filter((linea) => linea.itemId)
      .map((linea) => ({ itemId: Number(linea.itemId), quantity: Number(linea.quantity) }));
    if (!outputItemId) return notify('Selecciona el insumo que vas a producir', 'err');
    if (!Number(outputQuantity) || Number(outputQuantity) <= 0) return notify('Indica la cantidad obtenida', 'err');
    if (lineas.length === 0 || lineas.some((linea) => !Number.isFinite(linea.quantity) || linea.quantity <= 0)) {
      return notify('Completa cada insumo consumido y su cantidad', 'err');
    }

    try {
      setGuardando(true);
      const resultado = await api.post('/ensambles', {
        outputItemId: Number(outputItemId),
        outputQuantity: Number(outputQuantity),
        inputs: lineas,
      });
      notify(`Ensamble registrado: ${resultado.referencia}`);
      setOutputItemId('');
      setOutputQuantity('');
      setInputs([nuevaLinea()]);
      await cargar();
    } catch (error) {
      notify(error.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const insumoProducido = items.find((item) => String(item.id) === outputItemId);
  const insumosDisponibles = items.filter((item) => String(item.id) !== outputItemId);
  const termino = busqueda.trim().toLowerCase();
  const historialFiltrado = termino
    ? historial.filter((ensamble) => [
      ensamble.referencia,
      ensamble.salida?.codigo,
      ensamble.salida?.nombre,
      ...(ensamble.entradas || []).flatMap((entrada) => [entrada.codigo, entrada.nombre]),
    ].some((valor) => String(valor || '').toLowerCase().includes(termino)))
    : historial;

  return (
    <div>
      <PageHeader
        title="Ensamble"
        subtitle="Transforma insumos crudos en insumos preparados y registra el rendimiento."
      />

      <section className="card" style={{ maxWidth: 980 }}>
        <form onSubmit={guardar}>
          <div className="grid form-4col" style={{ gap: 12, alignItems: 'end' }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Insumo producido *</label>
              <select value={outputItemId} onChange={(event) => setOutputItemId(event.target.value)} required>
                <option value="">Selecciona por referencia o nombre...</option>
                {items.map((item) => <option key={item.id} value={item.id}>{etiquetaItem(item)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cantidad obtenida *</label>
              <input type="number" min="0.001" step="0.001" value={outputQuantity} onChange={(event) => setOutputQuantity(event.target.value)} required />
            </div>
            <div className="field">
              <label>Existencia actual</label>
              <input value={insumoProducido ? `${insumoProducido.stock} ${insumoProducido.unidad}` : '—'} readOnly />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Insumos consumidos</div>
            {inputs.map((linea, index) => {
              const item = items.find((actual) => String(actual.id) === linea.itemId);
              return (
                <div className="row" key={index} style={{ gap: 10, marginBottom: 10, alignItems: 'end' }}>
                  <div className="field" style={{ flex: 2, minWidth: 220 }}>
                    <label>Referencia / insumo *</label>
                    <select value={linea.itemId} onChange={(event) => actualizarLinea(index, 'itemId', event.target.value)} required>
                      <option value="">Selecciona insumo...</option>
                      {insumosDisponibles.map((option) => <option key={option.id} value={option.id}>{etiquetaItem(option)}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Cantidad consumida *</label>
                    <input type="number" min="0.001" step="0.001" value={linea.quantity} onChange={(event) => actualizarLinea(index, 'quantity', event.target.value)} required />
                  </div>
                  <div className="mini" style={{ minWidth: 105, paddingBottom: 12 }}>
                    {item ? `Disponible: ${item.stock} ${item.unidad}` : ' '}
                  </div>
                  <button type="button" className="btn btn-red btn-sm" title="Quitar insumo" onClick={() => setInputs((actuales) => actuales.filter((_, i) => i !== index))}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
            <Button variant="secondary" icon="add" onClick={() => setInputs((actuales) => [...actuales, nuevaLinea()])}>
              Agregar insumo
            </Button>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="primary" type="submit" loading={guardando} disabled={cargando || items.length < 2}>
              Registrar ensamble
            </Button>
          </div>
        </form>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Historial de ensambles</h2>
        <div style={{ maxWidth: 450, marginBottom: 10 }}>
          <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por referencia o insumo..." />
        </div>
        {historial.length === 0 ? (
          <EmptyState icon="kits" title="Sin ensambles registrados" description="Los lotes que registres aparecerán aquí." />
        ) : historialFiltrado.length === 0 ? (
          <EmptyState icon="kits" title="Sin resultados" description="Ningún ensamble coincide con la búsqueda." />
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Referencia</th><th>Insumo producido</th><th>Cantidad</th><th>Insumos consumidos</th></tr>
              </thead>
              <tbody>
                {historialFiltrado.map((ensamble) => (
                  <tr key={ensamble.referencia}>
                    <td className="mini">{fechaLocal(ensamble.fecha)}</td>
                    <td className="mini">{ensamble.referencia}</td>
                    <td>{ensamble.salida?.codigo ? `${ensamble.salida.codigo} · ` : ''}{ensamble.salida?.nombre || '—'}</td>
                    <td>{ensamble.salida?.cantidad} {ensamble.salida?.unidad}</td>
                    <td>{ensamble.entradas.map((entrada) => `${entrada.codigo ? `${entrada.codigo} · ` : ''}${entrada.nombre}: ${entrada.cantidad} ${entrada.unidad}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}