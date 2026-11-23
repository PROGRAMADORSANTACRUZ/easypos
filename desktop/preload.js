const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
  appVersion: () => ipcRenderer.invoke('pos:app-version'),
  imprimirRed: (comanda) => ipcRenderer.invoke('pos:imprimir-red', comanda),
  cashDrawer: {
    listPrinters: () => ipcRenderer.invoke('pos:cash-drawer:list-printers'),
    open: (request) => ipcRenderer.invoke('pos:cash-drawer:open', request),
  },
});
