package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

// Campana de recepcion de hotel: dos toques, una sola vez, al maximo volumen (canal de alarma: suena
// aunque el telefono este en silencio) con dos pulsos de vibracion fuerte, uno por toque. Se apaga sola.
class SirenaAlarma {
    private static final int MUESTRAS_POR_SEGUNDO = 44100;
    private static final long[] PATRON_VIBRACION = {0, 400, 100, 400};
    private static final int[] AMPLITUDES_VIBRACION = {0, 255, 0, 255};
    private static final long DURACION_TOTAL_MS = 1500;
    // Campana de recepcion: fundamental brillante y parciales no armonicos que decaen mas rapido
    private static final double FRECUENCIA_CAMPANA = 2200;
    private static final double[] PARCIALES = {1.0, 2.76, 5.40, 8.93};
    private static final double[] AMPLITUDES = {1.0, 0.6, 0.35, 0.2};
    private static final int GOLPES = 2;
    private static final double SEPARACION_GOLPES = 0.5;
    private static final double DURACION_SONIDO = 1.4;

    private final Context contexto;
    private final Handler manejador = new Handler(Looper.getMainLooper());
    private final Runnable apagar = this::detener;
    private AudioTrack sirena;
    private Vibrator vibrador;
    private int volumenAnterior = -1;
    private boolean sonando = false;

    SirenaAlarma(Context contexto) {
        this.contexto = contexto.getApplicationContext();
    }

    synchronized boolean estaSonando() {
        return sonando;
    }

    synchronized void iniciar() {
        if (sonando) return;
        sonando = true;
        subirVolumen();
        iniciarSirena();
        iniciarVibracion();
        manejador.postDelayed(apagar, DURACION_TOTAL_MS);
    }

    synchronized void detener() {
        if (!sonando) return;
        sonando = false;
        manejador.removeCallbacks(apagar);
        if (sirena != null) {
            try { sirena.stop(); } catch (IllegalStateException ignorada) { }
            sirena.release();
            sirena = null;
        }
        if (vibrador != null) {
            vibrador.cancel();
            vibrador = null;
        }
        AudioManager audio = audio();
        if (audio != null && volumenAnterior >= 0) {
            try { audio.setStreamVolume(AudioManager.STREAM_ALARM, volumenAnterior, 0); } catch (SecurityException ignorada) { }
        }
        volumenAnterior = -1;
    }

    private AudioManager audio() {
        return (AudioManager) contexto.getSystemService(Context.AUDIO_SERVICE);
    }

    private void subirVolumen() {
        AudioManager audio = audio();
        if (audio == null) return;
        try {
            volumenAnterior = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        } catch (SecurityException ignorada) {
            volumenAnterior = -1;
        }
    }

    // Dos golpes de campana generados en memoria y reproducidos una sola vez
    private void iniciarSirena() {
        double[] mezcla = new double[(int) (DURACION_SONIDO * MUESTRAS_POR_SEGUNDO)];
        for (int golpe = 0; golpe < GOLPES; golpe++) {
            int inicio = (int) (golpe * SEPARACION_GOLPES * MUESTRAS_POR_SEGUNDO);
            for (int i = inicio; i < mezcla.length; i++) {
                double s = (double) (i - inicio) / MUESTRAS_POR_SEGUNDO;
                if (s > 0.9) break;
                double ataque = Math.min(1, s / 0.002);
                for (int k = 0; k < PARCIALES.length; k++) {
                    mezcla[i] += ataque * AMPLITUDES[k] * Math.exp(-(5 + 2 * k) * s)
                        * Math.sin(2 * Math.PI * FRECUENCIA_CAMPANA * PARCIALES[k] * s);
                }
            }
        }
        double pico = 0;
        for (double valor : mezcla) pico = Math.max(pico, Math.abs(valor));
        short[] datos = new short[mezcla.length];
        for (int i = 0; i < datos.length; i++) {
            // Saturacion suave: sube el volumen percibido sin distorsion fea
            datos[i] = (short) (Math.tanh(2.2 * mezcla[i] / pico) * Short.MAX_VALUE * 0.95);
        }
        AudioAttributes atributos = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        AudioFormat formato = new AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(MUESTRAS_POR_SEGUNDO)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build();
        sirena = new AudioTrack(atributos, formato, datos.length * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
        sirena.write(datos, 0, datos.length);
        sirena.setVolume(AudioTrack.getMaxVolume());
        sirena.play();
    }

    @SuppressWarnings("deprecation")
    private void iniciarVibracion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager gestor = (VibratorManager) contexto.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrador = gestor != null ? gestor.getDefaultVibrator() : null;
        } else {
            vibrador = (Vibrator) contexto.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrador == null || !vibrador.hasVibrator()) return;
        AudioAttributes alarma = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            vibrador.vibrate(PATRON_VIBRACION, -1);
            return;
        }
        VibrationEffect efecto = vibrador.hasAmplitudeControl()
            ? VibrationEffect.createWaveform(PATRON_VIBRACION, AMPLITUDES_VIBRACION, -1)
            : VibrationEffect.createWaveform(PATRON_VIBRACION, -1);
        vibrador.vibrate(efecto, alarma);
    }
}
