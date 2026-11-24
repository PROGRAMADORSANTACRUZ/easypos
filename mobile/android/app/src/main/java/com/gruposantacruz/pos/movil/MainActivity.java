package com.gruposantacruz.pos.movil;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(BiometricoPlugin.class);
        registerPlugin(ImpresionPlugin.class);
        registerPlugin(AlertaPlatoPlugin.class);
        super.onCreate(savedInstanceState);
        mostrarSobreBloqueo(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        mostrarSobreBloqueo(intent);
    }

    // La alarma de plato listo abre la app encendiendo la pantalla y por encima del bloqueo
    private void mostrarSobreBloqueo(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(VigilanciaPlatoService.EXTRA_ALARMA, false)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }
}
