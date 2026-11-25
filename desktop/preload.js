const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
  appVersion: () => ipcRenderer.invoke('pos:app-version'),
  imprimirRed: (comanda) => ipcRenderer.invoke('pos:imprimir-red', comanda),
  cashDrawer: {
    listPrinters: () => ipcRenderer.invoke('pos:cash-drawer:list-printers'),
    open: (request) => ipcRenderer.invoke('pos:cash-drawer:open', request),
  },
  bascula: {
    perfiles: () => ipcRenderer.invoke('pos:bascula:perfiles'),
    puertos: () => ipcRenderer.invoke('pos:bascula:puertos'),
    estado: () => ipcRenderer.invoke('pos:bascula:estado'),
    conectar: (config) => ipcRenderer.invoke('pos:bascula:conectar', config),
    desconectar: () => ipcRenderer.invoke('pos:bascula:desconectar'),
    detectar: () => ipcRenderer.invoke('pos:bascula:detectar'),
    // Cada suscripcion devuelve una funcion para cancelarla
    onPeso: (fn) => suscribir('pos:bascula:peso', fn),
    onEstado: (fn) => suscribir('pos:bascula:estado', fn),
    onProgreso: (fn) => suscribir('pos:bascula:progreso', fn),
  },
});

function suscribir(canal, fn) {
  const oyente = (_event, dato) => fn(dato);
  ipcRenderer.on(canal, oyente);
  return () => ipcRenderer.removeListener(canal, oyente);
}
