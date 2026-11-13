import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { api, money } from '../api.js';
import { useAuth, useToast } from '../App.jsx';
import { Icon } from '../icons.jsx';
import { PageHeader, LoadingState } from '../components/ui/index.jsx';

const porcentaje = (valor) => (valor == null ? '—' : `${valor.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);
const textoCelda = (valor) => {
  if (valor == null) return '';
  if (typeof valor === 'object') return valor.result ?? valor.text ?? valor.richText?.map((parte) => parte.text).join('') ?? '';
  return valor;
};

// Lee la primera hoja: busca las columnas de referencia (o codigo/insumo) y costo en la fila de titulos.
export async function leerExcelCostos(archivo) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  const titulos = (hoja.getRow(1).values || []).map((valor) => String(textoCelda(valor)).trim().toLowerCase());
  const columna = (...nombres) => titulos.findIndex((titulo) => nombres.some((nombre) => titulo.startsWith(nombre)));
  const colReferencia = columna('referencia', 'codigo', 'código', 'insumo', 'nombre');
  const colCosto = columna('costo', 'precio', 'valor');
  if (colReferencia < 1 || colCosto < 1) throw new Error('La primera fila debe tener las columnas "Referencia" y "Costo".');
  const filas = [];
  hoja.eachRow((fila, numero) => {
    if (numero === 1) return;
    const referencia = String(textoCelda(fila.getCell(colReferencia).value)).trim();
    if (referencia) filas.push({ referencia, costo: textoCelda(fila.getCell(colCosto).value) });
  });
  return filas;
}

export default function CosteoPlatos() {
  const { user } = useAuth();
  const notify = useToast();
  const puedeEditar = user?.__dev === true || (user?.permisos || []).includes('costeo.editar');
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState('platos');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [edicion, setEdicion] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [rango, setRango] = useState({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy });
  const [ventas, setVentas] = useState(null);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const archivoRef = useRef(null);

  const consultarVentas = async () => {
    if (!rango.desde || !rango.hasta || rango.desde > rango.hasta) return notify('Selecciona un rango de fechas válido.', 'err');
    setCargandoVentas(true);
    try { setVentas(await api.get(`/costeo/ventas?desde=${rango.desde}&hasta=${rango.hasta}`)); } catch (e) { notify(e.message, 'err'); } finally { setCargandoVentas(false); }
  };
  useEffect(() => { if (vista === 'ventas' && !ventas) consultarVentas(); }, [vista]);

  const cargar = async () => {
    try { setDatos(await api.get('/costeo')); } catch (e) { notify(e.message, 'err'); }
  };
  useEffect(() => { cargar(); }, []);

  const texto = buscar.trim().toUpperCase();
  const platos = useMemo(() => (datos?.platos || []).filter((plato) => !texto
    || plato.nombre.toUpperCase().includes(texto) || String(plato.codigo || '').toUpperCase().includes(texto)
    || plato.receta.some((linea) => linea.nombre.toUpperCase().includes(texto))), [datos, texto]);
  const insumos = useMemo(() => (datos?.insumos || []).filter((insumo) => !texto
    || insumo.nombre.toUpperCase().includes(texto) || String(insumo.codigo || '').toUpperCase().includes(texto)), [datos, texto]);

  if (!datos) return <div><PageHeader title="Costeo de platos" /><LoadingState label="Cargando costeo…" /></div>;

  const objetivo = datos.objetivo;
  const conCosto = datos.platos.filter((plato) => plato.porcentajeCosto != null && plato.costo > 0);
  const promedio = conCosto.length ? conCosto.reduce((suma, plato) => suma + plato.porcentajeCosto, 0) / conCosto.length : null;
  const sobreObjetivo = conCosto.filter((plato) => plato.porcentajeCosto > objetivo).length;
  const insumosSinCosto = datos.insumos.filter((insumo) => !(insumo.costo > 0)).length;

  const guardarCosto = async (insumo) => {
    const valor = edicion[insumo.id];
    if (valor === undefined) return;
    setEdicion(({ [insumo.id]: _quitado, ...resto }) => resto);
    if (valor === '' || Number(valor) === insumo.costo) return;
    try {
      const respuesta = await api.put(`/costeo/insumos/${insumo.id}`, { costo: valor });
      setDatos(respuesta);
      notify(`Costo de ${insumo.nombre} actualizado · ${respuesta.platosActualizados} plato(s) recalculado(s)`);
    } catch (e) { notify(e.message, 'err'); }
  };

  const importar = async (evento) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setOcupado(true);
    try {
      const filas = await leerExcelCostos(archivo);
      const respuesta = await api.post('/costeo/insumos/importar', { filas });
      setDatos(respuesta);
      const avisos = [
        `${respuesta.insumosActualizados} insumo(s) actualizado(s)`,
        `${respuesta.platosActualizados} plato(s) recalculado(s)`,
        respuesta.totalNoEncontrados ? `${respuesta.totalNoEncontrados} referencia(s) no encontrada(s): ${respuesta.noEncontrados.slice(0, 5).join(', ')}${respuesta.totalNoEncontrados > 5 ? '…' : ''}` : '',
        respuesta.invalidos.length ? `${respuesta.invalidos.length} fila(s) con costo inválido` : '',
      ].filter(Boolean);
      notify(avisos.join(' · '), respuesta.totalNoEncontrados || respuesta.invalidos.length ? 'err' : undefined);
    } catch (e) { notify(e.message, 'err'); } finally { setOcupado(false); }
  };

  const descargarPlantilla = async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Costos insumos');
    hoja.columns = [
      { header: 'Referencia', key: 'referencia', width: 16 }, { header: 'Insumo', key: 'nombre', width: 40 },
      { header: 'Unidad', key: 'unidad', width: 12 }, { header: 'Costo', key: 'costo', width: 14 },
    ];
    datos.insumos.forEach((insumo) => hoja.addRow({ referencia: insumo.codigo || insumo.nombre, nombre: insumo.nombre, unidad: insumo.unidad, costo: insumo.costo }));
    hoja.getRow(1).font = { bold: true };
    const blob = new Blob([await libro.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'costos-insumos.xlsx' });
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const exportarExcel = async () => {
    const libro = new ExcelJS.Workbook();
    const formatoMoneda = '"$" #,##0';
    const resumen = libro.addWorksheet('Costeo de platos');
    resumen.columns = [
      { header: 'Código', key: 'codigo', width: 10 }, { header: 'Plato', key: 'nombre', width: 38 },
      { header: 'Categoría', key: 'categoria', width: 18 }, { header: 'Costo receta', key: 'costo', width: 14, style: { numFmt: formatoMoneda } },
      { header: 'Precio venta', key: 'precio', width: 14, style: { numFmt: formatoMoneda } },
      { header: 'Precio neto', key: 'precioNeto', width: 14, style: { numFmt: formatoMoneda } },
      { header: 'Margen', key: 'margen', width: 14, style: { numFmt: formatoMoneda } },
      { header: '% costo', key: 'porcentaje', width: 10, style: { numFmt: '0.0%' } },
      { header: 'Estado', key: 'estado', width: 18 }, { header: 'Insumos sin costo', key: 'sinCosto', width: 16 },
    ];
    datos.platos.forEach((plato) => resumen.addRow({
      ...plato,
      porcentaje: plato.costo > 0 && plato.porcentajeCosto != null ? plato.porcentajeCosto / 100 : null,
      estado: plato.costo === 0 ? 'Sin costo' : plato.porcentajeCosto > objetivo ? `Sobre el ${objetivo} %` : 'Dentro del objetivo',
      sinCosto: plato.insumosSinCosto,
    }));
    const recetas = libro.addWorksheet('Recetas');
    recetas.columns = [
      { header: 'Plato', key: 'plato', width: 38 }, { header: 'Referencia', key: 'codigo', width: 12 },
      { header: 'Insumo', key: 'nombre', width: 34 }, { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Unidad', key: 'unidad', width: 10 }, { header: 'Costo unitario', key: 'costoUnitario', width: 14, style: { numFmt: formatoMoneda } },
      { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: formatoMoneda } },
    ];
    datos.platos.forEach((plato) => plato.receta.forEach((linea) => recetas.addRow({ plato: plato.nombre, ...linea })));
    const hojaInsumos = libro.addWorksheet('Insumos');
    hojaInsumos.columns = [
      { header: 'Referencia', key: 'codigo', width: 12 }, { header: 'Insumo', key: 'nombre', width: 38 },
      { header: 'Unidad', key: 'unidad', width: 10 }, { header: 'Costo unitario', key: 'costo', width: 14, style: { numFmt: formatoMoneda } },
      { header: 'Usado en (platos)', key: 'platos', width: 16 },
    ];
    datos.insumos.forEach((insumo) => hojaInsumos.addRow(insumo));
    for (const hoja of [resumen, recetas, hojaInsumos]) {
      hoja.getRow(1).font = { bold: true };
      hoja.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const blob = new Blob([await libro.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `costeo-platos-${new Date().toISOString().slice(0, 10)}.xlsx` });
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const exportarVentas = async () => {
    if (!ventas?.filas.length) return notify('No hay ventas para exportar en ese rango.', 'err');
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Costo de ventas');
    const formatoMoneda = '"$" #,##0';
    hoja.addRow([`Costo de ventas del ${ventas.desde} al ${ventas.hasta}`]).font = { bold: true, size: 13 };
    hoja.addRow([]);
    const columnas = ['Plato', 'Categoría', 'Unidades', 'Costo unitario', 'Costo total', 'Venta neta', 'Utilidad', '% costo'];
    hoja.addRow(columnas).font = { bold: true };
    const filaDatos = (f) => [f.nombre, f.categoria, f.unidades, f.costoUnitario, f.costoTotal, f.ventaNeta, f.utilidad, f.porcentajeCosto == null ? null : f.porcentajeCosto / 100];
    ventas.filas.forEach((fila) => hoja.addRow(filaDatos(fila)));
    const t = ventas.totales;
    hoja.addRow(['TOTAL', '', t.unidades, null, t.costoTotal, t.ventaNeta, t.utilidad, t.porcentajeCosto == null ? null : t.porcentajeCosto / 100]).font = { bold: true };
    [38, 18, 10, 14, 14, 14, 14, 10].forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
    [4, 5, 6, 7].forEach((col) => { hoja.getColumn(col).numFmt = formatoMoneda; });
    hoja.getColumn(8).numFmt = '0.0%';
    const blob = new Blob([await libro.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `costo-ventas-${ventas.desde}-a-${ventas.hasta}.xlsx` });
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const recalcular = async () => {
    setOcupado(true);
    try {
      const respuesta = await api.post('/costeo/recalcular', {});
      setDatos(respuesta);
      notify(`${respuesta.platosActualizados} plato(s) con costo actualizado`);
    } catch (e) { notify(e.message, 'err'); } finally { setOcupado(false); }
  };

  return (
    <div className="costeo">
      <PageHeader title="Costeo de platos" subtitle="Costo de cada plato según su receta. Al cambiar el costo de un insumo se recalculan los platos que lo usan." />

      <div className="costeo-kpis">
        <div className="card"><span>Platos con receta</span><b>{datos.platos.length}</b></div>
        <div className="card"><span>% costo promedio</span><b className={promedio > objetivo ? 'alto' : ''}>{porcentaje(promedio)}</b></div>
        <div className="card"><span>Sobre el objetivo ({objetivo} %)</span><b className={sobreObjetivo ? 'alto' : ''}>{sobreObjetivo}</b></div>
        <div className="card"><span>Insumos sin costo</span><b className={insumosSinCosto ? 'alto' : ''}>{insumosSinCosto} de {datos.insumos.length}</b></div>
      </div>

      <div className="card">
        <div className="costeo-barra">
          <div className="documento-caja-pestanas" role="tablist">
            <button type="button" role="tab" aria-selected={vista === 'platos'} className={vista === 'platos' ? 'activa' : ''} onClick={() => setVista('platos')}>Platos</button>
            <button type="button" role="tab" aria-selected={vista === 'insumos'} className={vista === 'insumos' ? 'activa' : ''} onClick={() => setVista('insumos')}>Costos de insumos</button>
            <button type="button" role="tab" aria-selected={vista === 'ventas'} className={vista === 'ventas' ? 'activa' : ''} onClick={() => setVista('ventas')}>Costo de ventas (por fechas)</button>
          </div>
          {vista === 'ventas' ? (
            <div className="costeo-acciones" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="costeo-desde">Desde</label>
                <input id="costeo-desde" type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="costeo-hasta">Hasta</label>
                <input id="costeo-hasta" type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
              </div>
              <button type="button" className="btn btn-primary" disabled={cargandoVentas} onClick={consultarVentas}>Consultar</button>
              <button type="button" className="btn btn-export btn-export-xls" onClick={exportarVentas}><Icon name="download" size={16} /> Excel</button>
            </div>
          ) : (<>
          <input className="costeo-buscar" placeholder={vista === 'platos' ? 'Buscar plato o insumo…' : 'Buscar insumo…'} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <button type="button" className="btn btn-export btn-export-xls" onClick={exportarExcel} title="Descarga el costeo de platos, las recetas y los insumos">
            <Icon name="download" size={16} /> Reporte de costos
          </button>
          {puedeEditar && (
            <div className="costeo-acciones">
              <button type="button" className="btn" onClick={descargarPlantilla}><Icon name="download" size={16} /> Plantilla Excel</button>
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => archivoRef.current?.click()}><Icon name="upload" size={16} /> Importar costos</button>
              <button type="button" className="btn" disabled={ocupado} onClick={recalcular} title="Recalcula y guarda el costo de todos los platos">Recalcular</button>
              <input ref={archivoRef} type="file" accept=".xlsx" hidden onChange={importar} />
            </div>
          )}
          </>)}
        </div>

        {vista === 'ventas' ? (
          cargandoVentas || !ventas ? <LoadingState label="Calculando costo de ventas…" /> : (
            <div style={{ overflowX: 'auto' }}>
              <div className="costeo-kpis" style={{ marginTop: 4 }}>
                <div className="card"><span>Venta neta</span><b>{money(ventas.totales.ventaNeta)}</b></div>
                <div className="card"><span>Costo de lo vendido</span><b>{money(ventas.totales.costoTotal)}</b></div>
                <div className="card"><span>Utilidad bruta</span><b className={ventas.totales.utilidad < 0 ? 'alto' : ''}>{money(ventas.totales.utilidad)}</b></div>
                <div className="card"><span>% costo</span><b className={ventas.totales.porcentajeCosto > objetivo ? 'alto' : ''}>{porcentaje(ventas.totales.porcentajeCosto)}</b></div>
              </div>
              <table className="tabla-costeo">
                <thead><tr><th className="izq">Plato</th><th className="izq">Categoría</th><th>Unidades</th><th>Costo unitario</th><th>Costo total</th><th>Venta neta</th><th>Utilidad</th><th>% costo</th></tr></thead>
                <tbody>
                  {ventas.filas.map((fila) => (
                    <tr key={fila.id}>
                      <td className="izq">{fila.nombre}</td><td className="izq">{fila.categoria}</td>
                      <td>{fila.unidades.toLocaleString('es-CO')}</td><td>{fila.costoUnitario > 0 ? money(fila.costoUnitario) : 'Sin costo'}</td>
                      <td><b>{money(fila.costoTotal)}</b></td><td>{money(fila.ventaNeta)}</td>
                      <td className={fila.utilidad < 0 ? 'negativo' : ''}>{money(fila.utilidad)}</td>
                      <td><span className={`badge ${fila.costoTotal === 0 ? '' : fila.porcentajeCosto > objetivo ? 'red' : 'green'}`}>{fila.costoTotal === 0 ? 'Sin costo' : porcentaje(fila.porcentajeCosto)}</span></td>
                    </tr>
                  ))}
                  {!ventas.filas.length && <tr><td colSpan={8} className="empty">No hay platos con receta vendidos entre {ventas.desde} y {ventas.hasta}.</td></tr>}
                </tbody>
              </table>
            </div>
          )
        ) : vista === 'platos' ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-costeo">
              <thead><tr><th className="izq">Plato</th><th className="izq">Categoría</th><th>Costo receta</th><th>Precio venta</th><th>Precio neto</th><th>Margen</th><th>% costo</th><th>Insumos sin costo</th></tr></thead>
              <tbody>
                {platos.map((plato) => (
                  <Fragment key={plato.id}>
                    <tr className="fila-plato" onClick={() => setAbierto(abierto === plato.id ? null : plato.id)} title="Clic para ver la receta">
                      <td className="izq"><Icon name={abierto === plato.id ? 'chevronDown' : 'chevronRight'} size={14} /> {plato.nombre}{!plato.activo && <span className="mini"> (inactivo)</span>}</td>
                      <td className="izq">{plato.categoria}</td>
                      <td><b>{money(plato.costo)}</b></td>
                      <td>{money(plato.precio)}</td>
                      <td>{money(plato.precioNeto)}</td>
                      <td className={plato.margen < 0 ? 'negativo' : ''}>{money(plato.margen)}</td>
                      <td><span className={`badge ${plato.porcentajeCosto == null || plato.costo === 0 ? '' : plato.porcentajeCosto > objetivo ? 'red' : 'green'}`}>{plato.costo === 0 ? 'Sin costo' : porcentaje(plato.porcentajeCosto)}</span></td>
                      <td>{plato.insumosSinCosto ? <span className="badge red">{plato.insumosSinCosto}</span> : '—'}</td>
                    </tr>
                    {abierto === plato.id && (
                      <tr className="fila-receta"><td colSpan={8}>
                        <table className="tabla-costeo receta">
                          <thead><tr><th className="izq">Insumo</th><th>Cantidad</th><th>Unidad</th><th>Costo unitario</th><th>Subtotal</th><th>Participación</th></tr></thead>
                          <tbody>
                            {plato.receta.map((linea) => (
                              <tr key={linea.itemId}>
                                <td className="izq">{linea.codigo ? `${linea.codigo} · ` : ''}{linea.nombre}</td>
                                <td>{linea.cantidad.toLocaleString('es-CO', { maximumFractionDigits: 4 })}</td><td>{linea.unidad}</td>
                                <td className={linea.costoUnitario > 0 ? '' : 'negativo'}>{linea.costoUnitario > 0 ? money(linea.costoUnitario) : 'Sin costo'}</td>
                                <td>{money(linea.subtotal)}</td>
                                <td>{plato.costo > 0 ? porcentaje(linea.subtotal / plato.costo * 100) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {!platos.length && <tr><td colSpan={8} className="empty">No hay platos con receta para mostrar.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-costeo">
              <thead><tr><th className="izq">Referencia</th><th className="izq">Insumo</th><th>Unidad</th><th>Usado en</th><th>Costo unitario</th></tr></thead>
              <tbody>
                {insumos.map((insumo) => (
                  <tr key={insumo.id}>
                    <td className="izq">{insumo.codigo || '—'}</td>
                    <td className="izq">{insumo.nombre}</td>
                    <td>{insumo.unidad}</td>
                    <td>{insumo.platos} plato(s)</td>
                    <td>
                      {puedeEditar ? (
                        <input className={`costeo-input sin-flechas ${insumo.costo > 0 ? '' : 'vacio'}`} type="number" min="0" step="0.01"
                          aria-label={`Costo de ${insumo.nombre}`}
                          value={edicion[insumo.id] ?? insumo.costo}
                          onFocus={(e) => e.target.select()}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => setEdicion((actual) => ({ ...actual, [insumo.id]: e.target.value }))}
                          onBlur={() => guardarCosto(insumo)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                      ) : money(insumo.costo)}
                    </td>
                  </tr>
                ))}
                {!insumos.length && <tr><td colSpan={5} className="empty">No hay insumos para mostrar.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="mini" style={{ marginTop: 10 }}>
          El costo del plato es la suma de cantidad × costo unitario de cada insumo de su receta y queda guardado en el plato.
          El % de costo se calcula sobre el precio neto (precio de venta sin impuesto); en rojo los que superan el {objetivo} %.
          Para importar, usa un Excel con las columnas «Referencia» (código o nombre del insumo) y «Costo».
          En «Costo de ventas» se multiplican las unidades vendidas en el rango por el costo actual de la receta; la venta neta no incluye impuesto ni propina.
        </p>
      </div>
    </div>
  );
}
