package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

// Imprime una tirilla/recibo (HTML) con el servicio de impresión de Android: sirve para guardar en PDF
// o enviar a cualquier impresora instalada en el teléfono. También envía comandas ESC/POS directo a una
// impresora de red del local (TCP, puerto 9100), que el servidor en la nube no puede alcanzar.
@CapacitorPlugin(name = "Impresion")
public class ImpresionPlugin extends Plugin {
    private static final String BASE = "https://pos.grupo-santacruz.com/";
    private static final int TIEMPO_ESPERA_MS = 5000;
    private static final int MAX_BYTES = 256 * 1024;
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

    // Solo IPv4 privadas (red del local): 10.x, 172.16-31.x y 192.168.x.
    static boolean esIpPrivada(String ip) {
        if (ip == null || !ip.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) return false;
        String[] partes = ip.split("\\.");
        int[] o = new int[4];
        for (int i = 0; i < 4; i++) {
            o[i] = Integer.parseInt(partes[i]);
            if (o[i] > 255) return false;
        }
        return o[0] == 10 || (o[0] == 172 && o[1] >= 16 && o[1] <= 31) || (o[0] == 192 && o[1] == 168);
    }

    @PluginMethod
    public void imprimirRed(PluginCall call) {
        final String ip = call.getString("ip", "");
        final int puerto = call.getInt("puerto", 9100);
        final String datos = call.getString("datos", "");
        if (!esIpPrivada(ip)) {
            call.reject("La impresora debe tener una IP de la red local");
            return;
        }
        if (puerto < 1 || puerto > 65535) {
            call.reject("Puerto de impresora inválido");
            return;
        }
        final byte[] contenido;
        try {
            contenido = Base64.decode(datos, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Comanda inválida");
            return;
        }
        if (contenido.length == 0 || contenido.length > MAX_BYTES) {
            call.reject("Comanda vacía o demasiado grande");
            return;
        }
        // La red no se puede usar en el hilo de la interfaz.
        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(ip, puerto), TIEMPO_ESPERA_MS);
                socket.setSoTimeout(TIEMPO_ESPERA_MS);
                OutputStream salida = socket.getOutputStream();
                salida.write(contenido);
                salida.flush();
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo conectar con la impresora " + ip + ":" + puerto);
            }
        }).start();
    }
}
