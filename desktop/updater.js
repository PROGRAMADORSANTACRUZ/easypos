// Actualizaciones automaticas desde GitHub Releases (electron-updater).
// Se revisa al abrir la app y cada pocas horas; la actualizacion se descarga sola y,
// para no cortar una venta, el usuario decide si reinicia ya o al cerrar la app.
const REVISION_CADA_MS = 4 * 60 * 60 * 1000;

function iniciarActualizaciones({ autoUpdater, dialog, getWindow, log = console }) {
  let descargada = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;

  autoUpdater.on('error', (err) => log.error?.('[POS] actualizador:', err?.message || err));

  autoUpdater.on('update-downloaded', async (info) => {
    descargada = true;
    const { response } = await dialog.showMessageBox(getWindow() || undefined, {
      type: 'info',
      title: 'Actualizacion lista',
      message: `Hay una nueva version del POS (${info.version}).`,
      detail: 'Reinicia ahora para instalarla. Si eliges "Mas tarde", se instalara al cerrar la aplicacion.',
      buttons: ['Reiniciar ahora', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });

  const revisar = () => {
    if (descargada) return;
    autoUpdater.checkForUpdates().catch((err) => log.error?.('[POS] actualizador:', err?.message || err));
  };

  revisar();
  const timer = setInterval(revisar, REVISION_CADA_MS);
  timer.unref?.();
  return { revisar };
}

module.exports = { iniciarActualizaciones, REVISION_CADA_MS };
