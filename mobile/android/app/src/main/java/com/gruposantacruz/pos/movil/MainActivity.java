package com.gruposantacruz.pos.movil;

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
    }
}
