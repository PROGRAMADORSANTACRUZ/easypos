package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

// Sirena al maximo volumen (canal de alarma: suena aunque el telefono este en silencio) y vibracion
// continua. Se apaga solo con detener().
class SirenaAlarma {
    private static final int MUESTRAS_POR_SEGUNDO = 22050;
    private static final long[] PATRON_VIBRACION = {0, 900, 250, 900, 250, 400, 150, 400, 250};

    private final Context contexto;
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
    }

    synchronized void detener() {
        if (!sonando) return;
        sonando = false;
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

    // Sirena que sube y baja entre 900 y 2300 Hz, generada en memoria y repetida en bucle
    private void iniciarSirena() {
        short[] datos = new short[MUESTRAS_POR_SEGUNDO];
        double fase = 0;
        for (int i = 0; i < datos.length; i++) {
            double t = (double) i / MUESTRAS_POR_SEGUNDO;
            double frecuencia = 1600 + 700 * Math.sin(2 * Math.PI * 2 * t);
            fase += 2 * Math.PI * frecuencia / MUESTRAS_POR_SEGUNDO;
            datos[i] = (short) (Math.signum(Math.sin(fase)) * Short.MAX_VALUE * 0.95);
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
        sirena.setLoopPoints(0, datos.length, -1);
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
        vibrador.vibrate(VibrationEffect.createWaveform(PATRON_VIBRACION, 0), alarma);
    }
}
