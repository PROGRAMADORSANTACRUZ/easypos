package com.gruposantacruz.pos.movil;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

public class TirillaEscPosTest {
    private static final int NEGRO = 0xFF000000;
    private static final int BLANCO = 0xFFFFFFFF;

    @Test
    public void codificaLaImagenEnEscPosYRecortaElBlancoFinal() {
        // 10 x 4: fila 0 con los dos primeros puntos negros, fila 1 con el ultimo, filas 2-3 en blanco
        int ancho = 10;
        int[] pixeles = new int[ancho * 4];
        Arrays.fill(pixeles, BLANCO);
        pixeles[0] = NEGRO;
        pixeles[1] = NEGRO;
        pixeles[ancho + 9] = NEGRO;

        byte[] datos = TirillaEscPos.desdePixeles(pixeles, ancho, 4);

        byte[] esperado = {
            0x1B, 0x40,
            0x1D, 0x76, 0x30, 0x00, 2, 0, 2, 0, // 2 bytes por fila, 2 filas (las blancas se recortan)
            (byte) 0xC0, 0x00,
            0x00, 0x40,
            0x1B, 0x64, 0x04,
            0x1D, 0x56, 0x42, 0x00,
        };
        assertArrayEquals(esperado, datos);
    }

    @Test
    public void divideLasImagenesLargasEnBloques() {
        int ancho = 8;
        int alto = TirillaEscPos.FILAS_POR_BLOQUE + 5;
        int[] pixeles = new int[ancho * alto];
        Arrays.fill(pixeles, NEGRO);
        byte[] datos = TirillaEscPos.desdePixeles(pixeles, ancho, alto);
        int cabeceras = 0;
        for (int i = 0; i + 2 < datos.length; i++) {
            if (datos[i] == 0x1D && datos[i + 1] == 0x76 && datos[i + 2] == 0x30) cabeceras++;
        }
        assertEquals(2, cabeceras);
    }

    @Test
    public void grisClaroYTransparenteSonPapel() {
        assertTrue(TirillaEscPos.esNegro(0xFF333333));
        assertEquals(false, TirillaEscPos.esNegro(0xFFDDDDDD));
        assertEquals(false, TirillaEscPos.esNegro(0x00000000));
    }

    @Test
    public void insertaElViewportDentroDelHead() {
        String html = TirillaEscPos.conViewport("<html><head><title>x</title></head><body>hola</body></html>", 219);
        assertTrue(html.startsWith("<html><head><meta name=\"viewport\" content=\"width=219\">"));
        assertTrue(TirillaEscPos.conViewport("<div>sin head</div>", 302).startsWith("<meta name=\"viewport\" content=\"width=302\">"));
    }
}
