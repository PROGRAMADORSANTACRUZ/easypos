package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Imprime una tirilla/recibo (HTML) con el servicio de impresión de Android: sirve para guardar en PDF
// o enviar a cualquier impresora instalada en el teléfono.
@CapacitorPlugin(name = "Impresion")
public class ImpresionPlugin extends Plugin {
    private static final String BASE = "https://pos.grupo-santacruz.com/";
    private WebView vistaImpresion;

    @PluginMethod
    public void imprimir(PluginCall call) {
        final String html = call.getString("html");
        final String nombre = call.getString("nombre", "POS Santacruz");
        if (html == null || html.isEmpty()) {
            call.reject("Sin contenido");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (vistaImpresion != null) vistaImpresion.destroy();
            final boolean[] impreso = {false};
            vistaImpresion = new WebView(getContext());
            vistaImpresion.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView vista, String url) {
                    if (impreso[0]) return;
                    impreso[0] = true;
                    try {
                        PrintManager gestor = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adaptador = vista.createPrintDocumentAdapter(nombre);
                        gestor.print(nombre, adaptador, new PrintAttributes.Builder().build());
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("No se pudo imprimir");
                    }
                }
            });
            vistaImpresion.loadDataWithBaseURL(BASE, html, "text/html", "UTF-8", null);
        });
    }
}
