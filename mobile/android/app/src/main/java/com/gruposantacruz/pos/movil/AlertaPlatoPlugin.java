package com.gruposantacruz.pos.movil;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Vigilancia de "plato listo" para las meseras: arranca/detiene el servicio en primer plano que hace sonar
// la alarma (ver VigilanciaPlatoService) y pide los permisos que necesita para funcionar con la pantalla apagada.
@CapacitorPlugin(
    name = "AlertaPlato",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notificaciones") }
)
public class AlertaPlatoPlugin extends Plugin {

    @PluginMethod
    public void vigilar(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la url del servidor");
            return;
        }
        VigilanciaPlatoService.iniciar(getContext(), url, call.getString("tenant", ""));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notificaciones") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificaciones", call, "trasNotificaciones");
        } else {
            pedirExencionBateria();
            call.resolve();
        }
    }

    @PermissionCallback
    private void trasNotificaciones(PluginCall call) {
        pedirExencionBateria();
        call.resolve();
    }

    @PluginMethod
    public void detener(PluginCall call) {
        VigilanciaPlatoService.detener(getContext());
        call.resolve();
    }

    // Sin esta exencion Android puede cortar la red del servicio con la pantalla apagada (modo Doze)
    private void pedirExencionBateria() {
        Context contexto = getContext();
        PowerManager energia = (PowerManager) contexto.getSystemService(Context.POWER_SERVICE);
        if (energia == null || energia.isIgnoringBatteryOptimizations(contexto.getPackageName())) return;
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + contexto.getPackageName()));
            getActivity().startActivity(intent);
        } catch (RuntimeException ignorada) {
            // El telefono no soporta el dialogo: se puede activar a mano en los ajustes de bateria
        }
    }
}
