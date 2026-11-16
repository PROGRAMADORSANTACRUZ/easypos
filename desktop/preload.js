const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
  cashDrawer: {
    listPrinters: () => ipcRenderer.invoke('pos:cash-drawer:list-printers'),
    open: (request) => ipcRenderer.invoke('pos:cash-drawer:open', request),
  },
});
