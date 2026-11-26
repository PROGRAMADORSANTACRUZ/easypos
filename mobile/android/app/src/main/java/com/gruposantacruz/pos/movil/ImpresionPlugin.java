package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
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
    // Unos 2,5 m de papel a 203 ppp: tope para no agotar la memoria con un documento enorme
    private static final int MAX_ALTO_PUNTOS = 20000;
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
        enviar(call, ip, puerto, contenido);
    }

    // La red no se puede usar en el hilo de la interfaz.
    private void enviar(PluginCall call, String ip, int puerto, byte[] contenido) {
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

    // Imprime una tirilla HTML directo en una impresora térmica de red (ESC/POS por TCP), sin RawBT:
    // la dibuja fuera de pantalla al ancho del papel, la convierte en imagen y la envía.
    @PluginMethod
    public void imprimirTirillaRed(PluginCall call) {
        final String html = call.getString("html");
        final String ip = call.getString("ip", "");
        final int puerto = call.getInt("puerto", 9100);
        final int anchoPuntos = call.getInt("anchoPuntos", 384);
        final int anchoCss = call.getInt("anchoCss", 219);
        if (html == null || html.isEmpty()) {
            call.reject("Sin contenido");
            return;
        }
        if (!esIpPrivada(ip)) {
            call.reject("La impresora debe tener una IP de la red local");
            return;
        }
        if (puerto < 1 || puerto > 65535 || anchoPuntos < 128 || anchoPuntos > 832 || anchoCss < 100 || anchoCss > 1000) {
            call.reject("Configuración de impresora inválida");
            return;
        }
        getActivity().runOnUiThread(() -> {
            // Se monta fuera de la vista (no visible para el usuario) para que Android la dibuje completa
            final ViewGroup raiz = getActivity().findViewById(android.R.id.content);
            final WebView vista = new WebView(getContext());
            WebSettings ajustes = vista.getSettings();
            ajustes.setUseWideViewPort(true);
            ajustes.setLoadWithOverviewMode(true);
            vista.setBackgroundColor(Color.WHITE);
            vista.setVerticalScrollBarEnabled(false);
            vista.setTranslationX(-anchoPuntos * 4f);
            raiz.addView(vista, new FrameLayout.LayoutParams(anchoPuntos, anchoPuntos));
            final boolean[] cargada = {false};
            vista.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView v, String url) {
                    if (cargada[0]) return;
                    cargada[0] = true;
                    // Margen para que el logo y las fuentes terminen de pintarse
                    vista.postDelayed(() -> ajustarAlto(call, raiz, vista, ip, puerto, anchoPuntos), 400);
                }
            });
            vista.loadDataWithBaseURL(BASE, TirillaEscPos.conViewport(html, anchoCss), "text/html", "UTF-8", null);
        });
    }

    @SuppressWarnings("deprecation")
    private void ajustarAlto(PluginCall call, ViewGroup raiz, WebView vista, String ip, int puerto, int anchoPuntos) {
        int alto = (int) Math.ceil(vista.getContentHeight() * vista.getScale());
        if (alto <= 0) {
            descartar(raiz, vista);
            call.reject("No se pudo preparar la tirilla");
            return;
        }
        final int altoFinal = Math.min(alto, MAX_ALTO_PUNTOS);
        vista.setLayoutParams(new FrameLayout.LayoutParams(anchoPuntos, altoFinal));
        vista.postDelayed(() -> {
            byte[] datos;
            try {
                Bitmap mapa = Bitmap.createBitmap(anchoPuntos, altoFinal, Bitmap.Config.ARGB_8888);
                Canvas lienzo = new Canvas(mapa);
                lienzo.drawColor(Color.WHITE);
                vista.draw(lienzo);
                int[] pixeles = new int[anchoPuntos * altoFinal];
                mapa.getPixels(pixeles, 0, anchoPuntos, 0, 0, anchoPuntos, altoFinal);
                mapa.recycle();
                datos = TirillaEscPos.desdePixeles(pixeles, anchoPuntos, altoFinal);
            } catch (Exception | OutOfMemoryError e) {
                call.reject("No se pudo preparar la tirilla");
                return;
            } finally {
                descartar(raiz, vista);
            }
            enviar(call, ip, puerto, datos);
        }, 300);
    }

    private static void descartar(ViewGroup raiz, WebView vista) {
        raiz.removeView(vista);
        vista.destroy();
    }
}
