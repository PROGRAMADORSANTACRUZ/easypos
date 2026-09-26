import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { api, money } from '../api.js';
import { Icon } from '../icons.jsx';
import { useToast } from '../App.jsx';
import { PageHeader, Modal, Button, EmptyState } from '../components/ui/index.jsx';

const vacio = { codigo: '', nombre: '', unidad: 'unidad', stock: 0, stockMinimo: 0, costo: 0, cuentaContableId: '' };

// Columnas y filas del inventario para exportar
function datosInventario(items) {
  return {
    columnas: ['Insumo', 'Unidad', 'Stock', 'Stock mínimo', 'Estado', 'Costo unit.', 'Valor total'],
    filas: (items || []).map((i) => [
      i.nombre,
      i.unidad,
      String(i.stock),
      String(i.stockMinimo),
      i.stock <= i.stockMinimo ? 'BAJO' : 'OK',
      money(i.costo),
      money(i.stock * i.costo),
    ]),
  };
}

async function exportarExcel(items, notify) {
  const { columnas, filas } = datosInventario(items);
  if (!filas.length) return notify('No hay insumos para exportar', 'err');
  const ultima = columnas.length - 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Asados Santacruz';
  wb.created = new Date();
  const ws = wb.addWorksheet('Inventario actual', { views: [{ state: 'frozen', ySplit: 5 }] });

  const nCols = columnas.length;
  const lastCol = String.fromCharCode(64 + nCols);

  ws.mergeCells(`A1:${lastCol}1`);
  const cMarca = ws.getCell('A1');
  cMarca.value = 'ASADOS SANTACRUZ';
  cMarca.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFE13626' } };
  cMarca.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastCol}2`);
  const cTit = ws.getCell('A2');
  cTit.value = 'Inventario actual';
  cTit.font = { size: 14, bold: true, color: { argb: 'FF111827' } };

  ws.mergeCells(`A3:${lastCol}3`);
  const cSub = ws.getCell('A3');
  cSub.value = `Generado: ${new Date().toLocaleString('es-CO')}`;
  cSub.font = { size: 10, italic: true, color: { argb: 'FF6B7280' } };

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

  filas.forEach((f, r) => {
    const fila = ws.getRow(filaEncabezado + 1 + r);
    const bg = r % 2 === 0 ? 'FFFFFFFF' : 'FFFFF4EC';
    f.forEach((valor, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = valor;
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      celda.alignment = { horizontal: i === ultima ? 'right' : 'left' };
      const esBajo = f[4] === 'BAJO';
      celda.font = i === ultima
        ? { bold: true, color: { argb: 'FFB45309' } }
        : i === 4
          ? { bold: true, color: { argb: esBajo ? 'FFDC2626' : 'FF16A34A' } }
          : { color: { argb: 'FF1F2937' } };
      celda.border = {
        bottom: { style: 'thin', color: { argb: 'FFF1D3BD' } },
        left: { style: 'thin', color: { argb: 'FFF1D3BD' } },
        right: { style: 'thin', color: { argb: 'FFF1D3BD' } },
      };
    });
  });

  columnas.forEach((col, i) => {
    let max = String(col).length;
    filas.forEach((f) => { max = Math.max(max, String(f[i] ?? '').length); });
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 4, 12), 40);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Inventario actual.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function exportarPDF(items, notify) {
  const { columnas, filas } = datosInventario(items);
  if (!filas.length) return notify('No hay insumos para exportar', 'err');
  const ultima = columnas.length - 1;
  const th = columnas.map((c, i) => `<th class="${i === ultima ? 'r' : ''}">${c}</th>`).join('');
  const tr = filas
    .map((f) => `<tr>${f.map((c, i) => `<td class="${i === ultima ? 'r' : ''} ${i === 4 ? (c === 'BAJO' ? 'bajo' : 'ok') : ''}">${String(c).replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventario actual</title>
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
    th.r { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f8fafc; }
    .r { text-align: right; }
    .bajo { color: #dc2626; font-weight: 700; }
    .ok { color: #16a34a; font-weight: 700; }
    .pie { margin-top: 18px; color: #888; font-size: 11px; text-align: center; }
  </style></head><body>
    <div class="head">
      <img class="marca-logo" src="${window.location.origin}/logo-oscuro.png" alt="Asados Santacruz">
      <h1>Inventario actual</h1>
      <div class="sub">Generado: ${new Date().toLocaleString('es-CO')}</div>
    </div>
    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    <div class="pie">Asados Santacruz · Reporte de inventario</div>
  </body></html>`;
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return notify('Permite las ventanas emergentes para exportar', 'err');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => { win.print(); };
}

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editCosto, setEditCosto] = useState(null); // id del insumo con costo en edicion
  const [costoVal, setCostoVal] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const notify = useToast();

  const cargar = async () => {
    try {
      const [ins, cts] = await Promise.all([api.get('/inventario'), api.get('/cuentas-contables')]);
      setItems(ins);
      setCuentas(cts);
    } catch (e) {
      notify(e.message, 'err');
    }
  };
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      setGuardando(true);
      await api.post('/inventario', form);
      setForm(vacio);
      setModalAbierto(false);
      notify('Insumo creado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };
  const abrirNuevo = () => { setForm(vacio); setModalAbierto(true); };

  // Amarra (o cambia) la cuenta contable de un insumo existente
  const cambiarCuenta = async (item, cuentaContableId) => {
    try {
      await api.put(`/inventario/${item.id}`, { cuentaContableId: cuentaContableId || null });
      notify('Cuenta contable actualizada');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const ajustar = async (item, cantidad) => {
    try {
      await api.post(`/inventario/${item.id}/ajuste`, { cantidad });
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const abrirCosto = (item) => { setEditCosto(item.id); setCostoVal(String(item.costo)); };

  const guardarCosto = async (item) => {
    setEditCosto(null);
    if (Number(costoVal) === item.costo) return;
    try {
      await api.put(`/inventario/${item.id}`, { costo: Number(costoVal) });
      notify('Costo actualizado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const eliminar = async (item) => {
    if (!confirm(`¿Eliminar "${item.nombre}"?`)) return;
    try {
      await api.del(`/inventario/${item.id}`);
      notify('Insumo eliminado');
      cargar();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Insumos que consumen los productos (kits). El stock baja al facturar."
        actions={(
          <>
            <button className="btn-export btn-export-xls" title="Exportar inventario a Excel" onClick={() => exportarExcel(items, notify)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><path fill="#fff" d="m8.5 12 1.6 2.4L11.7 12h1.6l-2.4 3.4 2.5 3.6h-1.7l-1.7-2.6-1.7 2.6H6.6l2.5-3.6L6.8 12h1.7Z"/></svg>
              Excel
            </button>
            <button className="btn-export btn-export-pdf" title="Exportar inventario a PDF" onClick={() => exportarPDF(items, notify)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/><text x="12" y="18" font-size="7" font-weight="700" text-anchor="middle" fill="#fff">PDF</text></svg>
              PDF
            </button>
            <Button variant="primary" icon="add" onClick={abrirNuevo} title="Nuevo insumo" />
          </>
        )}
      />

      <div className="card">
        {items.length === 0 ? (
          <EmptyState
            icon="inventario"
            title="Sin insumos"
            description="Crea tu primer insumo con el botón “+” de arriba."
          />
        ) : (
          <table>
            <thead>
              <tr><th>Referencia</th><th>Desc. Item</th><th>U.M.</th><th>Existencia</th><th>Costo</th><th>Cuenta contable</th><th>Ajuste</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const bajo = it.stock <= it.stockMinimo;
                return (
                  <tr key={it.id}>
                    <td className="mini">{it.codigo || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                      <div className="mini">mín. {it.stockMinimo}</div>
                    </td>
                    <td className="mini">{it.unidad}</td>
                    <td>
                      <span className={`badge ${bajo ? 'red' : 'green'}`}>{it.stock}</span>
                    </td>
                    <td>
                      {editCosto === it.id ? (
                        <input
                          type="number"
                          autoFocus
                          style={{ width: 90 }}
                          value={costoVal}
                          onChange={(e) => setCostoVal(e.target.value)}
                          onBlur={() => guardarCosto(it)}
                          onKeyDown={(e) => e.key === 'Enter' && guardarCosto(it)}
                        />
                      ) : (
                        <button className="btn btn-sm" title="Editar costo" onClick={() => abrirCosto(it)}>
                          {money(it.costo)} <Icon name="edit" size={14} />
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        value={it.cuentaContableId || ''}
                        onChange={(e) => cambiarCuenta(it, e.target.value)}
                        style={{ maxWidth: 170 }}
                        title={it.cuentaContable ? `${it.cuentaContable.codigo} · ${it.cuentaContable.nombre}` : 'Sin cuenta contable'}
                      >
                        <option value="">— Sin cuenta —</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn btn-sm" onClick={() => ajustar(it, -1)}>−</button>
                        <button className="btn btn-sm" onClick={() => ajustar(it, 1)}>+</button>
                        <button className="btn btn-sm" onClick={() => ajustar(it, 10)}>+10</button>
                      </div>
                    </td>
                    <td><button className="btn btn-red btn-sm" title="Eliminar" onClick={() => eliminar(it)}><Icon name="delete" size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalAbierto && (
        <Modal
          title="Nuevo insumo"
          onClose={() => setModalAbierto(false)}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setModalAbierto(false)}>Cancelar</Button>
              <Button variant="primary" type="submit" form="inv-form" loading={guardando}>Crear insumo</Button>
            </>
          )}
        >
          <form id="inv-form" onSubmit={crear}>
            <div className="field">
              <label>Referencia</label>
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Código / referencia" />
            </div>
            <div className="field">
              <label>Desc. Item *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })} required />
            </div>
            <div className="field">
              <label>U.M.</label>
              <input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value.toUpperCase() })} placeholder="unidad, gramo, ml..." />
            </div>
            <div className="field">
              <label>Existencia</label>
              <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div className="field">
              <label>Costo</label>
              <input type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
            </div>
            <div className="field">
              <label>Stock mínimo</label>
              <input type="number" value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })} />
            </div>
            <div className="field">
              <label>Cuenta contable</label>
              <select value={form.cuentaContableId} onChange={(e) => setForm({ ...form, cuentaContableId: e.target.value })}>
                <option value="">— Sin cuenta —</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
