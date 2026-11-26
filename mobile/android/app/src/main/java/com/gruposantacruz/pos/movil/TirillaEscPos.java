package com.gruposantacruz.pos.movil;

import java.io.ByteArrayOutputStream;

// Convierte la imagen de una tirilla en comandos ESC/POS de imagen (GS v 0), el formato que entienden
// las impresoras termicas (3nStar, Epson, Xprinter...). Asi se imprime cualquier tirilla HTML tal cual
// se ve, sin un programa intermedio como RawBT.
final class TirillaEscPos {
    static final int UMBRAL_NEGRO = 160;
    // Bloques cortos para no desbordar el bufer de impresoras economicas
    static final int FILAS_POR_BLOQUE = 128;

    private TirillaEscPos() {}

    static byte[] desdePixeles(int[] pixeles, int ancho, int alto) {
        int altoUtil = alto;
        while (altoUtil > 0 && filaBlanca(pixeles, ancho, altoUtil - 1)) altoUtil--;
        int bytesFila = (ancho + 7) / 8;
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        escribir(salida, 0x1B, 0x40); // ESC @: reinicia la impresora
        for (int inicio = 0; inicio < altoUtil; inicio += FILAS_POR_BLOQUE) {
            int filas = Math.min(FILAS_POR_BLOQUE, altoUtil - inicio);
            escribir(salida, 0x1D, 0x76, 0x30, 0x00, bytesFila & 0xFF, (bytesFila >> 8) & 0xFF, filas & 0xFF, (filas >> 8) & 0xFF);
            for (int y = inicio; y < inicio + filas; y++) {
                for (int columna = 0; columna < bytesFila; columna++) {
                    int valor = 0;
                    for (int bit = 0; bit < 8; bit++) {
                        int x = columna * 8 + bit;
                        if (x < ancho && esNegro(pixeles[y * ancho + x])) valor |= 0x80 >> bit;
                    }
                    salida.write(valor);
                }
            }
        }
        escribir(salida, 0x1B, 0x64, 0x04); // avanza 4 lineas para que el corte no muerda el texto
        escribir(salida, 0x1D, 0x56, 0x42, 0x00); // corte parcial
        return salida.toByteArray();
    }

    static boolean esNegro(int argb) {
        if (((argb >>> 24) & 0xFF) < 128) return false; // transparente = papel
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        return (r * 299 + g * 587 + b * 114) / 1000 < UMBRAL_NEGRO;
    }

    private static boolean filaBlanca(int[] pixeles, int ancho, int y) {
        for (int x = 0; x < ancho; x++) {
            if (esNegro(pixeles[y * ancho + x])) return false;
        }
        return true;
    }

    // La tirilla se dibuja con el ancho CSS del papel y Android la ajusta a los puntos de la impresora
    static String conViewport(String html, int anchoCss) {
        String cabecera = "<meta name=\"viewport\" content=\"width=" + anchoCss + "\">"
            + "<style>html,body{background:#fff !important;}</style>";
        int indice = html.toLowerCase().indexOf("<head>");
        if (indice < 0) return cabecera + html;
        return html.substring(0, indice + 6) + cabecera + html.substring(indice + 6);
    }

    private static void escribir(ByteArrayOutputStream salida, int... bytes) {
        for (int b : bytes) salida.write(b);
    }
}
