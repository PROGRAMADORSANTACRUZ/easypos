const { execFile } = require('node:child_process');

const PULSO_CAJON = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
const SCRIPT_POWERSHELL = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class RawPrinterCajon {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", ExactSpelling = true, SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr printer, int level, ref DOCINFO1 info);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", ExactSpelling = true, SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", ExactSpelling = true, SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", ExactSpelling = true, SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", ExactSpelling = true, SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printer, byte[] data, int count, out int written);

    public static void Send(string name, byte[] data) {
        IntPtr printer;
        if (!OpenPrinter(name, out printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
        bool document = false;
        bool page = false;
        try {
            DOCINFO1 info = new DOCINFO1 { pDocName = "POS - Abrir cajon", pOutputFile = null, pDataType = "RAW" };
            if (StartDocPrinter(printer, 1, ref info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            document = true;
            if (!StartPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());
            page = true;
            int written;
            if (!WritePrinter(printer, data, data.Length, out written) || written != data.Length) {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
        } finally {
            if (page) EndPagePrinter(printer);
            if (document) EndDocPrinter(printer);
            ClosePrinter(printer);
        }
    }
}
'@
[RawPrinterCajon]::Send(
    [Environment]::GetEnvironmentVariable('POS_DRAWER_PRINTER'),
    [Convert]::FromBase64String([Environment]::GetEnvironmentVariable('POS_DRAWER_PAYLOAD'))
)
`;

function enviarPulsoCajon(printerName) {
  if (process.platform !== 'win32') throw new Error('La apertura del cajón USB solo está disponible en Windows');
  if (typeof printerName !== 'string' || !printerName.trim()) throw new TypeError('Selecciona una impresora térmica');

  const encodedScript = Buffer.from(SCRIPT_POWERSHELL, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedScript,
    ], {
      windowsHide: true,
      timeout: 15_000,
      env: {
        ...process.env,
        POS_DRAWER_PRINTER: printerName,
        POS_DRAWER_PAYLOAD: PULSO_CAJON.toString('base64'),
      },
    }, (error, _stdout, stderr) => {
      if (error) {
        console.error('[cajon] No se pudo enviar el pulso a la impresora:', stderr.trim() || error.message);
        reject(new Error('No se pudo enviar la apertura a la impresora seleccionada.'));
        return;
      }
      resolve();
    });
  });
}

module.exports = { enviarPulsoCajon };
