import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { api, money } from '../api.js';
import { useToast } from '../App.jsx';
import { LoadingState } from '../components/ui/index.jsx';

// Catálogo de reportes seleccionables
const REPORTES = [
  { id: 'totales', nombre: 'Ventas totales' },
  { id: 'dia', nombre: 'Ventas netas por día' },
  { id: 'semana', nombre: 'Ventas netas por semana' },
  { id: 'mes', nombre: 'Ventas netas por mes' },
  { id: 'prod-dia', nombre: 'Ventas por producto por día' },
  { id: 'prod-semana', nombre: 'Ventas por producto por semana' },
  { id: 'prod-mes', nombre: 'Ventas por producto por mes' },
  { id: 'categoria', nombre: 'Ventas por categoría' },
  { id: 'mesera', nombre: 'Ventas por mesera' },
  { id: 'mesa', nombre: 'Ventas por mesa' },
  { id: 'formapago', nombre: 'Ventas por forma de pago' },
  { id: 'facturas', nombre: 'Detalle de facturas' },
  { id: 'gastos', nombre: 'Gastos de insumos (por producto)' },
  { id: 'insumos', nombre: 'Consumo de insumos' },
  { id: 'compras-insumo', nombre: 'Compras por insumo' },
  { id: 'pedidos-mesa', nombre: 'Pedidos por mesa' },
  { id: 'cocina', nombre: 'Preparación de cocina' },
];

// Tabla simple de ventas por periodo
function TablaPeriodo({ datos, maxTotal }) {
  if (!datos?.length) return <p className="empty">Aún no hay ventas.</p>;
  return (
    <table>
      <thead><tr><th>Periodo</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
      <tbody>
        {datos.map((v) => (
          <tr key={v.clave}>
            <td>
              <div style={{ fontWeight: 600 }}>{v.clave}</div>
              <div className="barra"><span style={{ width: `${(v.total / maxTotal) * 100}%` }} /></div>
            </td>
            <td>{v.facturas}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(v.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Bloques de productos agrupados por periodo
function TablaProductos({ bloques }) {
  if (!bloques?.length) return <p className="empty">Aún no hay ventas.</p>;
  return bloques.map((bloque) => (
    <div key={bloque.clave} style={{ marginBottom: 14 }}>
      <div className="mini" style={{ fontWeight: 700, marginBottom: 4 }}>{bloque.clave}</div>
      <table>
        <tbody>
          {bloque.items.map((it) => (
            <tr key={it.nombre}>
              <td style={{ textTransform: 'uppercase' }}>{it.nombre}</td>
              <td style={{ textAlign: 'center' }}>×{it.cantidad}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
}

export default function Reportes() {
  const [rep, setRep] = useState(null);
  const [pedidosMesa, setPedidosMesa] = useState([]);
  const [cocina, setCocina] = useState([]);
  const [searchParams] = useSearchParams();
  const sel = searchParams.get('r') || 'totales';
  const hoy = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const notify = useToast();

  const cargar = () => {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    const qs = params.toString();
    api.get(`/reportes${qs ? `?${qs}` : ''}`).then(setRep).catch((e) => notify(e.message, 'err'));
    api.get(`/reportes/pedidos-mesa${qs ? `?${qs}` : ''}`).then(setPedidosMesa).catch(() => setPedidosMesa([]));
    api.get(`/reportes/cocina${qs ? `?${qs}` : ''}`).then(setCocina).catch(() => setCocina([]));
  };

  const limpiar = () => {
    setDesde(hoy);
    setHasta(hoy);
    api.get(`/reportes?desde=${hoy}&hasta=${hoy}`).then(setRep).catch((e) => notify(e.message, 'err'));
    api.get(`/reportes/pedidos-mesa?desde=${hoy}&hasta=${hoy}`).then(setPedidosMesa).catch(() => setPedidosMesa([]));
    api.get(`/reportes/cocina?desde=${hoy}&hasta=${hoy}`).then(setCocina).catch(() => setCocina([]));
  };

  useEffect(() => { cargar(); }, []);

  const maxDia = useMemo(() => Math.max(1, ...(rep?.ventasPorDia || []).map((v) => v.total)), [rep]);
  const maxSemana = useMemo(() => Math.max(1, ...(rep?.ventasPorSemana || []).map((v) => v.total)), [rep]);
  const maxMes = useMemo(() => Math.max(1, ...(rep?.ventasPorMes || []).map((v) => v.total)), [rep]);

  if (!rep) return <LoadingState label="Cargando reportes…" />;
  const t = rep.totales;
  const actual = REPORTES.find((r) => r.id === sel);

  // Construye { columnas, filas } del reporte actual para exportar
  const datosReporte = () => {
    switch (sel) {
      case 'totales':
        return {
          columnas: ['Concepto', 'Valor'],
          filas: [
            ['Ventas totales', money(t.total)],
            ['Facturas', String(t.facturas)],
            ['Unidades vendidas', String(t.unidades)],
            ['Subtotal (neto)', money(t.subtotal)],
            ['Impuesto', money(t.impuesto)],
            ...(t.notasCredito > 0 ? [['Notas crédito', `-${money(t.notasCredito)}`]] : []),
            ...(t.notasDebito > 0 ? [['Notas débito', `+${money(t.notasDebito)}`]] : []),
            ...(t.retenciones > 0 ? [['Retenciones', `-${money(t.retenciones)}`]] : []),
            ...(t.notasCredito > 0 || t.notasDebito > 0 || t.retenciones > 0 ? [['Ventas netas', money(t.totalNeto)]] : []),
          ],
        };
      case 'dia':
      case 'semana':
      case 'mes': {
        const fuente = sel === 'dia' ? rep.ventasPorDia : sel === 'semana' ? rep.ventasPorSemana : rep.ventasPorMes;
        return {
          columnas: ['Periodo', 'Facturas', 'Total'],
          filas: (fuente || []).map((v) => [v.clave, String(v.facturas), money(v.total)]),
        };
      }
      case 'prod-dia':
      case 'prod-semana':
      case 'prod-mes': {
        const bloques = sel === 'prod-dia' ? rep.productos.dia : sel === 'prod-semana' ? rep.productos.semana : rep.productos.mes;
        const filas = [];
        (bloques || []).forEach((b) => {
          b.items.forEach((it) => filas.push([b.clave, it.nombre, String(it.cantidad), money(it.total)]));
        });
        return { columnas: ['Periodo', 'Producto', 'Cantidad', 'Total'], filas };
      }
      case 'categoria':
        return {
          columnas: ['Categoría', 'Unidades', 'Total'],
          filas: (rep.porCategoria || []).map((c) => [c.nombre, String(c.cantidad), money(c.total)]),
        };
      case 'mesera':
        return {
          columnas: ['Mesera', 'Facturas', 'Total'],
          filas: (rep.porMesera || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'mesa':
        return {
          columnas: ['Mesa', 'Facturas', 'Total'],
          filas: (rep.porMesa || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'formapago':
        return {
          columnas: ['Forma de pago', 'Facturas', 'Total'],
          filas: (rep.porFormaPago || []).map((m) => [m.nombre, String(m.facturas), money(m.total)]),
        };
      case 'facturas':
        return {
          columnas: ['# Factura', 'Fecha', 'Mesa/Cliente', 'Forma de pago', 'Total'],
          filas: (rep.detalle || []).map((d) => [
            `#${d.numero}`,
            new Date(d.fecha).toLocaleString('es-CO'),
            d.ubicacion === 'Directa' ? d.cliente : d.ubicacion,
            d.formaPago,
            money(d.total),
          ]),
        };
      case 'gastos':
        return {
          columnas: ['Producto', 'Unidades', 'Costo insumos unit.', 'Costo total', 'Venta', 'Utilidad'],
          filas: (rep.gastos?.porProducto || []).map((p) => [
            p.nombre,
            String(p.unidades),
            money(p.costoUnit),
            money(p.costoTotal),
            money(p.ventaTotal),
            money(p.utilidad),
          ]),
        };
      case 'insumos':
        return {
          columnas: ['Insumo', 'Unidad', 'Cantidad consumida', 'Costo total', 'Venta', 'Ganancia', '% Ganancia'],
          filas: (rep.gastos?.porInsumo || []).map((i) => [
            i.nombre,
            i.unidad,
            String(i.cantidad),
            money(i.costoTotal),
            money(i.ventaTotal),
            money(i.utilidad),
            `${(i.ventaTotal > 0 ? (i.utilidad / i.ventaTotal) * 100 : 0).toFixed(1)}%`,
          ]),
        };
      case 'compras-insumo':
        return {
          columnas: ['Insumo', 'Cantidad comprada', 'Costo total'],
          filas: (rep.compras?.porInsumo || []).map((i) => [
            i.nombre,
            String(i.cantidad),
            money(i.costo),
          ]),
        };
      case 'pedidos-mesa':
        return {
          columnas: ['Fecha/Hora', 'Mesa', 'Mesero', 'Producto', 'Cantidad', 'Editado', 'Qué cambió', 'Observaciones'],
          filas: pedidosMesa.map((p) => [
            new Date(p.fecha).toLocaleString('es-CO'),
            p.mesa != null ? `Mesa ${p.mesa}` : '-',
            p.mesera || '-',
            p.producto || '-',
            String(p.cantidad),
            p.editado ? 'Sí' : 'No',
            p.cambios || '',
            p.observaciones || '',
          ]),
        };
      case 'cocina':
        return {
          columnas: ['Hora listo', 'Mesa', 'Productos', 'Cocinero', 'Listo'],
          filas: cocina.map((c) => [
            c.fechaListo ? new Date(c.fechaListo).toLocaleString('es-CO') : '-',
            c.mesa != null ? `Mesa ${c.mesa}` : '-',
            c.productos || '',
            c.cocinero || '-',
            c.listo ? 'Sí' : 'No',
          ]),
        };
      default:
        return { columnas: [], filas: [] };
    }
  };

  const rangoTexto = desde || hasta ? `${desde || '...'} a ${hasta || '...'}` : 'Todo el histórico';

  const exportarExcel = async () => {
    const { columnas, filas } = datosReporte();
    if (!filas.length) return notify('No hay datos para exportar', 'err');
    const ultima = columnas.length - 1;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Asados Santacruz';
    wb.created = new Date();
    const ws = wb.addWorksheet(actual?.nombre?.slice(0, 31) || 'Reporte', {
      views: [{ state: 'frozen', ySplit: 5 }],
    });

    const nCols = columnas.length;
    const lastCol = String.fromCharCode(64 + nCols); // A, B, C...

    // Título EASYPOS
    ws.mergeCells(`A1:${lastCol}1`);
    const cMarca = ws.getCell('A1');
    cMarca.value = 'ASADOS SANTACRUZ';
    cMarca.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFE13626' } };
    cMarca.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Nombre del reporte
    ws.mergeCells(`A2:${lastCol}2`);
    const cTit = ws.getCell('A2');
    cTit.value = actual?.nombre || 'Reporte';
    cTit.font = { size: 14, bold: true, color: { argb: 'FF111827' } };

    // Rango y fecha de generación
    ws.mergeCells(`A3:${lastCol}3`);
    const cSub = ws.getCell('A3');
    cSub.value = `Rango: ${rangoTexto}  ·  Generado: ${new Date().toLocaleString('es-CO')}`;
    cSub.font = { size: 10, italic: true, color: { argb: 'FF6B7280' } };

    // Fila 4 vacía como separador
    const filaEncabezado = 5;
    const header = ws.getRow(filaEncabezado);
    columnas.forEach((col, i) => {
      const celda = header.getCell(i + 1);
      celda.value = col;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
      celda.alignment = { horizontal: i === ultima ? 'right' : 'left', vertical: 'middle' };
      celda.border = {
        top: { style: 'thin', color: { argb: 'FFD97706' } },
        bottom: { style: 'thin', color: { argb: 'FFD97706' } },
        left: { style: 'thin', color: { argb: 'FFD97706' } },
        right: { style: 'thin', color: { argb: 'FFD97706' } },
      };
    });
    header.height = 22;

    // Filas de datos con estilo cebra
    filas.forEach((f, r) => {
      const fila = ws.getRow(filaEncabezado + 1 + r);
      const bg = r % 2 === 0 ? 'FFFFFFFF' : 'FFFFF4EC';
      f.forEach((valor, i) => {
        const celda = fila.getCell(i + 1);
        celda.value = valor;
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        celda.alignment = { horizontal: i === ultima ? 'right' : 'left' };
        celda.font = i === ultima
          ? { bold: true, color: { argb: 'FFB45309' } }
          : { color: { argb: 'FF1F2937' } };
        celda.border = {
          bottom: { style: 'thin', color: { argb: 'FFF1D3BD' } },
          left: { style: 'thin', color: { argb: 'FFF1D3BD' } },
          right: { style: 'thin', color: { argb: 'FFF1D3BD' } },
        };
      });
    });

    // Ancho automático por columna
    columnas.forEach((col, i) => {
      let max = String(col).length;
      filas.forEach((f) => { max = Math.max(max, String(f[i] ?? '').length); });
      ws.getColumn(i + 1).width = Math.min(Math.max(max + 4, 12), 40);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${actual?.nombre || 'reporte'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const { columnas, filas } = datosReporte();
    if (!filas.length) return notify('No hay datos para exportar', 'err');
    const th = columnas.map((c, i) => `<th class="${i === columnas.length - 1 ? 'r' : ''}">${c}</th>`).join('');
    const tr = filas
      .map((f) => `<tr>${f.map((c, i) => `<td class="${i === f.length - 1 ? 'r' : ''}">${String(c).replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${actual?.nombre || 'Reporte'}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; }
      .head { border-bottom: 3px solid #E13626; padding-bottom: 8px; margin-bottom: 16px; }
      .marca { font-size: 22px; font-weight: 900; color: #E13626; letter-spacing: 1px; }
      .marca-logo { height: 30px; display: block; margin-bottom: 4px; }
      h1 { font-size: 18px; margin: 4px 0 2px; }
      .sub { color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
      th { background: #E13626; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; }
      td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #f8fafc; }
      .r { text-align: right; }
      .pie { margin-top: 18px; color: #888; font-size: 11px; text-align: center; }
    </style></head><body>
      <div class="head">
        <img class="marca-logo" src="${window.location.origin}/logo-oscuro.png" alt="Asados Santacruz">
        <h1>${actual?.nombre || 'Reporte'}</h1>
        <div class="sub">Rango: ${rangoTexto} · Generado: ${new Date().toLocaleString('es-CO')}</div>
      </div>
      <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
      <div class="pie">Asados Santacruz · Reporte de ventas</div>
    </body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return notify('Permite las ventanas emergentes para exportar', 'err');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => { win.print(); };
  };

  const contenido = () => {
    switch (sel) {
      case 'totales':
        return (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="card metric"><div className="metric-label">Ventas totales</div><div className="metric-value">{money(t.total)}</div></div>
            <div className="card metric"><div className="metric-label">Facturas</div><div className="metric-value">{t.facturas}</div></div>
            <div className="card metric"><div className="metric-label">Unidades vendidas</div><div className="metric-value">{t.unidades}</div></div>
            <div className="card metric"><div className="metric-label">Subtotal (neto)</div><div className="metric-value">{money(t.subtotal)}</div></div>
            <div className="card metric"><div className="metric-label">Impuesto</div><div className="metric-value">{money(t.impuesto)}</div></div>
            {t.notasCredito > 0 && <div className="card metric"><div className="metric-label">Notas crédito</div><div className="metric-value">−{money(t.notasCredito)}</div></div>}
            {t.notasDebito > 0 && <div className="card metric"><div className="metric-label">Notas débito</div><div className="metric-value">+{money(t.notasDebito)}</div></div>}
            {t.retenciones > 0 && <div className="card metric"><div className="metric-label">Retenciones</div><div className="metric-value">−{money(t.retenciones)}</div></div>}
            {(t.notasCredito > 0 || t.notasDebito > 0 || t.retenciones > 0) && <div className="card metric"><div className="metric-label">Ventas netas</div><div className="metric-value">{money(t.totalNeto)}</div></div>}
            {rep.compras?.total > 0 && <div className="card metric"><div className="metric-label">Compras ({rep.compras.cantidad})</div><div className="metric-value">−{money(rep.compras.total)}</div></div>}
          </div>
        );
      case 'dia': return <TablaPeriodo datos={rep.ventasPorDia} maxTotal={maxDia} />;
      case 'semana': return <TablaPeriodo datos={rep.ventasPorSemana} maxTotal={maxSemana} />;
      case 'mes': return <TablaPeriodo datos={rep.ventasPorMes} maxTotal={maxMes} />;
      case 'prod-dia': return <TablaProductos bloques={rep.productos.dia} />;
      case 'prod-semana': return <TablaProductos bloques={rep.productos.semana} />;
      case 'prod-mes': return <TablaProductos bloques={rep.productos.mes} />;
      case 'categoria':
        return rep.porCategoria.length === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Categoría</th><th>Unidades</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porCategoria.map((c) => (
                <tr key={c.nombre}><td style={{ fontWeight: 600 }}>{c.nombre}</td><td>{c.cantidad}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'mesera':
        return rep.porMesera.length === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Mesera</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porMesera.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'mesa':
        return (rep.porMesa?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Mesa</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porMesa.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'formapago':
        return (rep.porFormaPago?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Forma de pago</th><th>Facturas</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.porFormaPago.map((m) => (
                <tr key={m.nombre}><td style={{ fontWeight: 600 }}>{m.nombre}</td><td>{m.facturas}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        );
      case 'facturas':
        return (rep.detalle?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th># Factura</th><th>Fecha</th><th>Mesa/Cliente</th><th>Forma de pago</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rep.detalle.map((d) => (
                <tr key={d.numero}>
                  <td style={{ fontWeight: 700 }}>#{d.numero}</td>
                  <td className="mini">{new Date(d.fecha).toLocaleString('es-CO')}</td>
                  <td>{d.ubicacion === 'Directa' ? d.cliente : d.ubicacion}</td>
                  <td>{d.formaPago}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'gastos': {
        const g = rep.gastos || {};
        return (
          <div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
              <div className="card metric"><div className="metric-label">Gasto en insumos</div><div className="metric-value">{money(g.totalGasto || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Ventas</div><div className="metric-value">{money(g.totalVenta || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Utilidad bruta</div><div className="metric-value">{money(g.utilidad || 0)}</div></div>
              <div className="card metric"><div className="metric-label">Margen</div><div className="metric-value">{(g.margen || 0).toFixed(1)}%</div></div>
            </div>
            {(g.porProducto?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
              <table>
                <thead><tr><th>Producto</th><th>Unid.</th><th style={{ textAlign: 'right' }}>Costo unit.</th><th style={{ textAlign: 'right' }}>Costo total</th><th style={{ textAlign: 'right' }}>Venta</th><th style={{ textAlign: 'right' }}>Utilidad</th></tr></thead>
                <tbody>
                  {g.porProducto.map((p) => (
                    <tr key={p.nombre}>
                      <td style={{ fontWeight: 600, textTransform: 'uppercase' }}>{p.nombre}</td>
                      <td>{p.unidades}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.costoUnit)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.costoTotal)}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.ventaTotal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.utilidad >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(p.utilidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="nota" style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              * El costo se calcula con la receta (insumos) de cada producto. Los productos sin receta cargada aparecen con costo $0.
            </p>
          </div>
        );
      }
      case 'insumos':
        return (rep.gastos?.porInsumo?.length ?? 0) === 0 ? <p className="empty">Sin datos.</p> : (
          <table>
            <thead><tr><th>Insumo</th><th>Unidad</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Costo total</th><th style={{ textAlign: 'right' }}>Venta</th><th style={{ textAlign: 'right' }}>Ganancia</th><th style={{ textAlign: 'right' }}>% Gan.</th></tr></thead>
            <tbody>
              {rep.gastos.porInsumo.map((i) => {
                const pct = i.ventaTotal > 0 ? (i.utilidad / i.ventaTotal) * 100 : 0;
                return (
                  <tr key={i.nombre}>
                    <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                    <td className="mini">{i.unidad}</td>
                    <td style={{ textAlign: 'right' }}>{i.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{money(i.costoTotal)}</td>
                    <td style={{ textAlign: 'right' }}>{money(i.ventaTotal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: i.utilidad >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(i.utilidad)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: pct >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      case 'compras-insumo':
        return (rep.compras?.porInsumo?.length ?? 0) === 0 ? <p className="empty">Sin compras en el periodo.</p> : (
          <table>
            <thead><tr><th>Insumo</th><th style={{ textAlign: 'right' }}>Cantidad comprada</th><th style={{ textAlign: 'right' }}>Costo total</th></tr></thead>
            <tbody>
              {rep.compras.porInsumo.map((i) => (
                <tr key={i.nombre}>
                  <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                  <td style={{ textAlign: 'right' }}>{i.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(i.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'pedidos-mesa':
        return pedidosMesa.length === 0 ? <p className="empty">Sin pedidos en el periodo.</p> : (
          <table>
            <thead><tr><th>Fecha/Hora</th><th>Mesa</th><th>Mesero</th><th>Producto</th><th>Cant.</th><th>Editado</th><th>Qué cambió</th><th>Observaciones</th></tr></thead>
            <tbody>
              {pedidosMesa.map((p) => (
                <tr key={p.consecutivo}>
                  <td className="mini">{new Date(p.fecha).toLocaleString('es-CO')}</td>
                  <td>{p.mesa != null ? `Mesa ${p.mesa}` : '-'}</td>
                  <td>{p.mesera || '-'}</td>
                  <td style={{ textTransform: 'uppercase' }}>{p.producto || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{p.cantidad}</td>
                  <td>{p.editado ? <span className="badge orange">Sí</span> : 'No'}</td>
                  <td className="mini">{p.cambios || ''}</td>
                  <td className="mini">{p.observaciones || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'cocina':
        return cocina.length === 0 ? <p className="empty">Sin preparaciones en el periodo.</p> : (
          <table>
            <thead><tr><th>Hora listo</th><th>Mesa</th><th>Productos</th><th>Cocinero</th><th>Listo</th></tr></thead>
            <tbody>
              {cocina.map((c) => (
                <tr key={c.consecutivo}>
                  <td className="mini">{c.fechaListo ? new Date(c.fechaListo).toLocaleString('es-CO') : '—'}</td>
                  <td>{c.mesa != null ? `Mesa ${c.mesa}` : '-'}</td>
                  <td>{c.productos}</td>
                  <td>{c.cocinero || '-'}</td>
                  <td>{c.listo ? <span className="badge green">Sí</span> : <span className="badge red">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      default: return null;
    }
  };

  return (
    <div>
      <h1>Reportes de ventas</h1>
      <p className="subtitle">Selecciona un reporte en el menú lateral para verlo.</p>

      <div className="reportes-layout">
        {/* Reporte seleccionado */}
        <div className="card">
          <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{actual?.nombre}</h3>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Desde</label>
                <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Hasta</label>
                <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={cargar}>Consultar</button>
              {(desde !== hoy || hasta !== hoy) && (
                <button className="btn btn-sm" onClick={limpiar}>Hoy</button>
              )}
              <button className="btn-export btn-export-xls" title="Exportar a Excel" onClick={exportarExcel}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><path fill="#fff" d="m8.5 12 1.6 2.4L11.7 12h1.6l-2.4 3.4 2.5 3.6h-1.7l-1.7-2.6-1.7 2.6H6.6l2.5-3.6L6.8 12h1.7Z"/></svg>
                Excel
              </button>
              <button className="btn-export btn-export-pdf" title="Exportar a PDF" onClick={exportarPDF}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><text x="12" y="18" font-size="7" font-weight="700" text-anchor="middle" fill="#fff">PDF</text></svg>
                PDF
              </button>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>{contenido()}</div>
        </div>
      </div>
    </div>
  );
}
