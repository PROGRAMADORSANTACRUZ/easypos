package com.gruposantacruz.pos.movil;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

// Actualiza la propia APK: descarga la nueva versión del sitio, verifica su huella SHA-256
// y abre el instalador de Android (que además exige la misma firma que la app instalada).
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String ORIGEN_PERMITIDO = "https://pos.grupo-santacruz.com/";

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject resultado = new JSObject();
            resultado.put("versionCode", info.getLongVersionCode());
            resultado.put("versionName", info.versionName);
            call.resolve(resultado);
        } catch (Exception e) {
            call.reject("No se pudo leer la versión instalada");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");
        if (url == null || !url.startsWith(ORIGEN_PERMITIDO) || sha256 == null || sha256.length() != 64) {
            call.reject("Actualización no permitida");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent ajustes = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            ajustes.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ajustes);
            JSObject resultado = new JSObject();
            resultado.put("estado", "permiso");
            call.resolve(resultado);
            return;
        }
        new Thread(() -> descargarEInstalar(call, url, sha256)).start();
    }

    private void descargarEInstalar(PluginCall call, String url, String sha256Esperado) {
        File carpeta = new File(getContext().getCacheDir(), "actualizaciones");
        if (!carpeta.exists() && !carpeta.mkdirs()) {
            call.reject("No se pudo preparar la descarga");
            return;
        }
        File apk = new File(carpeta, "POS-Santacruz.apk");
        try {
            HttpURLConnection conexion = (HttpURLConnection) new URL(url).openConnection();
            conexion.setConnectTimeout(20000);
            conexion.setReadTimeout(60000);
            if (conexion.getResponseCode() != 200 || !conexion.getURL().toString().startsWith(ORIGEN_PERMITIDO)) {
                call.reject("No se pudo descargar la actualización");
                return;
            }
            MessageDigest huella = MessageDigest.getInstance("SHA-256");
            try (InputStream entrada = conexion.getInputStream(); FileOutputStream salida = new FileOutputStream(apk)) {
                byte[] buffer = new byte[16384];
                int leidos;
                while ((leidos = entrada.read(buffer)) != -1) {
                    huella.update(buffer, 0, leidos);
                    salida.write(buffer, 0, leidos);
                }
            }
            StringBuilder calculada = new StringBuilder();
            for (byte b : huella.digest()) calculada.append(String.format("%02x", b));
            if (!calculada.toString().equalsIgnoreCase(sha256Esperado)) {
                apk.delete();
                call.reject("La actualización descargada no es válida");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent instalar = new Intent(Intent.ACTION_VIEW);
            instalar.setDataAndType(uri, "application/vnd.android.package-archive");
            instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(instalar);
            JSObject resultado = new JSObject();
            resultado.put("estado", "instalando");
            call.resolve(resultado);
        } catch (Exception e) {
            apk.delete();
            call.reject("No se pudo actualizar: " + e.getMessage());
        }
    }
}
