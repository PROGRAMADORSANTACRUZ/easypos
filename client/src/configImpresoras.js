// Engranaje de la tirilla en la APK: lista de impresoras del local (Impresora 1, 2, 3...) con las
// categorias que imprime cada una, y la impresora que usa este celular para prefacturas y facturas.
import { guardarImpresorasLocal, obtenerImpresorasLocal } from './impresorasLocal.js';
import {
  elegirImpresoraCelular, impresoraCelularElegida, imprimirTirillaEnRed, leerImpresora,
  SIN_IMPRESORA_DIRECTA, sinImpresionDirecta, TIRILLA_PRUEBA, validarImpresora,
} from './impresoraTirillas.js';

const COLOR = { fondo: '#1E1B18', panel: '#2A2521', texto: '#EDDFCA', borde: '#555', rojo: '#E1362B' };

function el(etiqueta, estilos = {}, propiedades = {}) {
  const nodo = Object.assign(document.createElement(etiqueta), propiedades);
  Object.assign(nodo.style, estilos);
  return nodo;
}

function boton(texto, fondo, color) {
  return el('button', {
    padding: '8px 14px', border: `1px solid ${COLOR.borde}`, borderRadius: '8px', fontWeight: '700', fontSize: '15px', background: fondo, color,
  }, { type: 'button', textContent: texto });
}

const estiloCampo = {
  padding: '10px', borderRadius: '8px', border: `1px solid ${COLOR.borde}`, fontSize: '16px', background: '#141210', color: COLOR.texto, width: '100%', boxSizing: 'border-box',
};

function campo(etiqueta, control) {
  const fila = el('label', { display: 'grid', gap: '4px', fontSize: '13px', fontWeight: '600' });
  fila.append(etiqueta, control);
  return fila;
}

const tirillaPrueba = (nombre) => TIRILLA_PRUEBA.replace('Prueba de impresora', `Prueba: ${nombre}`);

export async function abrirConfigImpresoras() {
  const fondo = el('div', {
    position: 'fixed', inset: '0', zIndex: '2100', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12px', overflowY: 'auto',
  });
  const caja = el('div', {
    background: COLOR.fondo, color: COLOR.texto, borderRadius: '12px', padding: '16px', width: '100%', maxWidth: '440px', display: 'grid', gap: '12px', boxSizing: 'border-box',
  });
  fondo.append(caja);
  document.body.append(fondo);
  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (evento) => { if (evento.target === fondo) cerrar(); });
  caja.append(el('div', {}, { textContent: 'Cargando impresoras…' }));

  let datos;
  try {
    datos = await obtenerImpresorasLocal({ refrescar: true });
  } catch (error) {
    caja.replaceChildren(el('div', {}, { textContent: `No se pudieron cargar las impresoras: ${error.message}` }));
    const salir = boton('Cerrar', COLOR.texto, COLOR.fondo);
    salir.addEventListener('click', cerrar);
    caja.append(salir);
    return;
  }

  const { categorias = [], puedeEditar = false } = datos;
  let siguienteClave = 0;
  const lista = (datos.impresoras || []).map((impresora) => ({ ...impresora, clave: impresora.id }));
  const anterior = leerImpresora();
  let seleccion = impresoraCelularElegida() || (anterior ? 'celular' : '');

  const mensaje = el('div', { fontSize: '13px', minHeight: '18px' });
  const avisar = (texto, error = false) => { mensaje.textContent = texto; mensaje.style.color = error ? '#ff8a80' : '#9be7a3'; };
  const contenedorLista = el('div', { display: 'grid', gap: '10px' });
  const selectorCelular = el('select', estiloCampo);

  const pintarSelector = () => {
    selectorCelular.replaceChildren();
    const delLocal = lista.find((impresora) => impresora.tirillas);
    selectorCelular.append(new Option(delLocal ? `La del local: ${delLocal.nombre || delLocal.ip}` : '— Elige una impresora —', ''));
    lista.forEach((impresora, indice) => selectorCelular.append(new Option(impresora.nombre || `Impresora ${indice + 1}`, impresora.clave)));
    if (anterior) selectorCelular.append(new Option(`Configuración anterior (${anterior.ip})`, 'celular'));
    selectorCelular.append(new Option('Diálogo de Android (RawBT)', SIN_IMPRESORA_DIRECTA));
    selectorCelular.value = [...selectorCelular.options].some((o) => o.value === seleccion) ? seleccion : '';
  };
  selectorCelular.addEventListener('change', () => { seleccion = selectorCelular.value; });

  const pintarLista = () => {
    contenedorLista.replaceChildren();
    if (!lista.length) contenedorLista.append(el('div', { fontSize: '13px', opacity: '.8' }, { textContent: 'Aún no hay impresoras. Agrega la primera.' }));
    lista.forEach((impresora, indice) => {
      const tarjeta = el('div', { background: COLOR.panel, borderRadius: '10px', padding: '12px', display: 'grid', gap: '8px' });
      const titulo = el('strong', {}, { textContent: `Impresora ${indice + 1}` });
      const nombre = el('input', estiloCampo, { value: impresora.nombre || '', placeholder: 'Ej: Cocina, Bar, Caja', disabled: !puedeEditar });
      nombre.addEventListener('input', () => { impresora.nombre = nombre.value; pintarSelector(); });
      const ip = el('input', estiloCampo, { value: impresora.ip || '', placeholder: '192.168.0.95', inputMode: 'decimal', disabled: !puedeEditar });
      ip.addEventListener('input', () => { impresora.ip = ip.value.trim(); });
      const puerto = el('input', estiloCampo, { value: String(impresora.puerto || 9100), inputMode: 'numeric', disabled: !puedeEditar });
      puerto.addEventListener('input', () => { impresora.puerto = puerto.value; });
      const papel = el('select', estiloCampo, { disabled: !puedeEditar });
      papel.append(new Option('80 mm', '80'), new Option('58 mm', '58'));
      papel.value = String(impresora.papel || 80);
      papel.addEventListener('change', () => { impresora.papel = Number(papel.value); });
      const fila = el('div', { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '6px' });
      fila.append(campo('IP', ip), campo('Puerto', puerto), campo('Papel', papel));

      const chips = el('div', { display: 'flex', flexWrap: 'wrap', gap: '6px' });
      const elegidas = new Set(impresora.categoriaIds || []);
      for (const categoria of categorias) {
        // Cada categoría va en una sola impresora: si otra la tiene, aquí se ve atenuada y tocarla la mueve
        const otra = lista.find((x) => x !== impresora && (x.categoriaIds || []).includes(categoria.id));
        const activa = elegidas.has(categoria.id);
        const chip = el('button', {
          padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', border: `1px solid ${COLOR.borde}`,
          background: activa ? COLOR.rojo : 'transparent', color: activa ? '#fff' : COLOR.texto, opacity: otra ? '.45' : '1',
        }, {
          type: 'button',
          textContent: otra ? `${categoria.nombre} · ${otra.nombre || 'otra'}` : categoria.nombre,
          title: otra ? `Está en ${otra.nombre}. Tócala para moverla aquí.` : '',
          disabled: !puedeEditar,
        });
        chip.setAttribute('aria-pressed', String(activa));
        chip.addEventListener('click', () => {
          if (activa) {
            impresora.categoriaIds = (impresora.categoriaIds || []).filter((id) => id !== categoria.id);
          } else {
            for (const x of lista) x.categoriaIds = (x.categoriaIds || []).filter((id) => id !== categoria.id);
            impresora.categoriaIds = [...(impresora.categoriaIds || []), categoria.id];
          }
          pintarLista();
        });
        chips.append(chip);
      }

      const acciones = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
      const tirillas = el('label', { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', fontWeight: '600' });
      const marcaTirillas = el('input', { width: '20px', height: '20px' }, { type: 'checkbox', checked: Boolean(impresora.tirillas), disabled: !puedeEditar });
      marcaTirillas.addEventListener('change', () => {
        // Solo una impresora es la de prefacturas y facturas
        for (const x of lista) x.tirillas = false;
        impresora.tirillas = marcaTirillas.checked;
        pintarLista();
        pintarSelector();
      });
      tirillas.append(marcaTirillas, 'Imprime prefacturas y facturas (todos los celulares)');
      const probar = boton('Probar', COLOR.texto, COLOR.fondo);
      probar.addEventListener('click', async () => {
        try {
          const config = validarImpresora(impresora);
          avisar(`Enviando prueba a ${impresora.nombre || `Impresora ${indice + 1}`}…`);
          await imprimirTirillaEnRed(tirillaPrueba(impresora.nombre || `Impresora ${indice + 1}`), config);
          avisar('Prueba enviada. Revisa que haya salido en la impresora correcta.');
        } catch (error) {
          avisar(sinImpresionDirecta(error) ? 'Actualiza la APK para imprimir directo.' : error.message, true);
        }
      });
      acciones.append(probar);
      if (puedeEditar) {
        const quitar = boton('Eliminar', 'transparent', COLOR.texto);
        quitar.addEventListener('click', () => { lista.splice(indice, 1); pintarLista(); pintarSelector(); });
        acciones.append(quitar);
      }
      tarjeta.append(titulo, campo('Nombre', nombre), fila, tirillas, campo('Categorías que imprime', chips), acciones);
      contenedorLista.append(tarjeta);
    });
  };

  const agregar = boton('+ Agregar impresora', 'transparent', COLOR.texto);
  agregar.addEventListener('click', () => {
    siguienteClave += 1;
    lista.push({ clave: `nueva-${siguienteClave}`, nombre: `Impresora ${lista.length + 1}`, ip: '', puerto: 9100, papel: 80, categoriaIds: [] });
    pintarLista();
    pintarSelector();
  });

  const guardar = boton('Guardar', COLOR.rojo, '#fff');
  guardar.addEventListener('click', async () => {
    guardar.disabled = true;
    try {
      let claveElegida = seleccion;
      if (puedeEditar) {
        const indiceElegido = lista.findIndex((impresora) => impresora.clave === seleccion);
        const { impresoras } = await guardarImpresorasLocal(lista.map(({ clave, ...impresora }) => impresora));
        // Las impresoras nuevas reciben su id al guardar: el servidor las devuelve en el mismo orden
        if (indiceElegido >= 0) claveElegida = impresoras[indiceElegido]?.id || '';
      }
      elegirImpresoraCelular(claveElegida);
      cerrar();
    } catch (error) {
      avisar(error.message, true);
      guardar.disabled = false;
    }
  });
  const cancelar = boton('Cancelar', 'transparent', COLOR.texto);
  cancelar.addEventListener('click', cerrar);

  const ayuda = puedeEditar
    ? 'Configúralas una vez y quedan para todos los celulares. Cada categoría va en una sola impresora: al imprimir un pedido, cada producto sale solo en la impresora de su categoría.'
    : 'Solo un administrador puede cambiar las impresoras. Aquí puedes probarlas y elegir la de este celular.';
  const pie = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' });
  pie.append(cancelar, guardar);

  caja.replaceChildren(
    el('strong', { fontSize: '17px' }, { textContent: 'Impresoras del local' }),
    el('div', { fontSize: '13px', opacity: '.8' }, { textContent: ayuda }),
    contenedorLista,
    ...(puedeEditar ? [agregar] : []),
    campo('Este celular imprime prefacturas y facturas en:', selectorCelular),
    mensaje,
    pie,
  );
  pintarLista();
  pintarSelector();
}
