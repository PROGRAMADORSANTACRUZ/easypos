package com.gruposantacruz.pos.movil;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

// Vigilancia de "plato listo" para las meseras, al estilo WhatsApp: servicio en primer plano (con su
// notificacion fija) que consulta al servidor cada pocos segundos con la sesion de la app, aunque la
// pantalla este apagada o la app cerrada, y hace sonar la campana (dos toques y vibracion) cada vez que
// aparece un plato listo nuevo; el aviso en la notificacion queda hasta que se entregue.
public class VigilanciaPlatoService extends Service {
    static final String PREFS = "pos_vigilancia";
    static final String EXTRA_URL = "url";
    static final String EXTRA_TENANT = "tenant";
    static final String EXTRA_ALARMA = "alarma_plato";
    private static final String CANAL_VIGILANCIA = "vigilancia_platos";
    private static final String CANAL_ALARMA = "alarma_plato_listo";
    private static final int ID_VIGILANCIA = 4201;
    private static final int ID_ALARMA = 4202;
    private static final long CADA_SEGUNDOS = 5;

    private ScheduledExecutorService ejecutor;
    private PowerManager.WakeLock wakeLock;
    private SirenaAlarma sirena;
    private String urlBase;
    private String tenant;
    private String avisoActual = "";
    private boolean sesionVencida = false;

    static void iniciar(Context contexto, String url, String tenant) {
        contexto.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putBoolean("activa", true).putString(EXTRA_URL, url).putString(EXTRA_TENANT, tenant == null ? "" : tenant).apply();
        Intent intent = new Intent(contexto, VigilanciaPlatoService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) contexto.startForegroundService(intent);
        else contexto.startService(intent);
    }

    static void detener(Context contexto) {
        contexto.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("activa", false).apply();
        contexto.stopService(new Intent(contexto, VigilanciaPlatoService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        urlBase = prefs.getString(EXTRA_URL, "");
        tenant = prefs.getString(EXTRA_TENANT, "");
        if (!prefs.getBoolean("activa", false) || urlBase.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        crearCanales();
        int tipo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, ID_VIGILANCIA, notificacionVigilancia("Atento a los platos listos de tus mesas"), tipo);
        if (ejecutor == null) {
            sirena = new SirenaAlarma(this);
            PowerManager energia = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = energia.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pos:vigilancia");
            wakeLock.acquire();
            ejecutor = Executors.newSingleThreadScheduledExecutor();
            ejecutor.scheduleWithFixedDelay(this::consultar, 0, CADA_SEGUNDOS, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (ejecutor != null) ejecutor.shutdownNow();
        ejecutor = null;
        if (sirena != null) sirena.detener();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        notificaciones().cancel(ID_ALARMA);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private NotificationManager notificaciones() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void crearCanales() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel vigilancia = new NotificationChannel(CANAL_VIGILANCIA, "Vigilancia de platos", NotificationManager.IMPORTANCE_LOW);
        vigilancia.setDescription("Mantiene la app atenta a los platos listos con la pantalla apagada");
        NotificationChannel alarma = new NotificationChannel(CANAL_ALARMA, "Plato listo", NotificationManager.IMPORTANCE_HIGH);
        alarma.setDescription("Aviso cuando cocina termina un plato");
        alarma.setSound(null, null);
        alarma.enableVibration(false);
        alarma.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificaciones().createNotificationChannel(vigilancia);
        notificaciones().createNotificationChannel(alarma);
    }

    private PendingIntent abrirApp() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ALARMA, true);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notificacionVigilancia(String texto) {
        return new NotificationCompat.Builder(this, CANAL_VIGILANCIA)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("POS Santacruz")
            .setContentText(texto)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(abrirApp())
            .build();
    }

    private void mostrarAlarma(String texto) {
        PendingIntent abrir = abrirApp();
        Notification alarma = new NotificationCompat.Builder(this, CANAL_ALARMA)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("¡PLATO LISTO!")
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(abrir)
            .setFullScreenIntent(abrir, true)
            .build();
        try {
            notificaciones().notify(ID_ALARMA, alarma);
        } catch (SecurityException ignorada) {
            // Sin permiso de notificaciones igual suena la campana
        }
    }

    // Consulta las mesas con platos listos; sin conexion momentanea conserva el estado actual.
    private void consultar() {
        try {
            String direccion = urlBase + "/api/mesas/platos-listos";
            String cookie = CookieManager.getInstance().getCookie(direccion);
            HttpURLConnection conexion = (HttpURLConnection) new URL(direccion).openConnection();
            conexion.setConnectTimeout(8000);
            conexion.setReadTimeout(8000);
            conexion.setRequestProperty("Accept", "application/json");
            if (cookie != null) conexion.setRequestProperty("Cookie", cookie);
            if (!tenant.isEmpty()) conexion.setRequestProperty("x-tenant-id", tenant);
            int codigo = conexion.getResponseCode();
            if (codigo == 401 || codigo == 403) {
                conexion.disconnect();
                alSesionVencida();
                return;
            }
            if (codigo != 200) {
                conexion.disconnect();
                return;
            }
            StringBuilder cuerpo = new StringBuilder();
            try (BufferedReader lector = new BufferedReader(new InputStreamReader(conexion.getInputStream(), StandardCharsets.UTF_8))) {
                String linea;
                while ((linea = lector.readLine()) != null) cuerpo.append(linea);
            } finally {
                conexion.disconnect();
            }
            alResultado(new JSONArray(cuerpo.toString()));
        } catch (Exception ignorada) {
            // Se reintenta en el siguiente ciclo
        }
    }

    private void alSesionVencida() {
        if (sirena.estaSonando()) sirena.detener();
        notificaciones().cancel(ID_ALARMA);
        avisoActual = "";
        if (!sesionVencida) {
            sesionVencida = true;
            notificaciones().notify(ID_VIGILANCIA, notificacionVigilancia("Sesión vencida: abre la app e inicia sesión"));
        }
    }

    private void alResultado(JSONArray mesas) throws Exception {
        if (sesionVencida) {
            sesionVencida = false;
            notificaciones().notify(ID_VIGILANCIA, notificacionVigilancia("Atento a los platos listos de tus mesas"));
        }
        if (mesas.length() == 0) {
            if (sirena.estaSonando()) sirena.detener();
            if (!avisoActual.isEmpty()) notificaciones().cancel(ID_ALARMA);
            avisoActual = "";
            return;
        }
        StringBuilder texto = new StringBuilder();
        for (int i = 0; i < mesas.length(); i++) {
            JSONObject mesa = mesas.getJSONObject(i);
            JSONArray platos = mesa.getJSONArray("platos");
            if (texto.length() > 0) texto.append('\n');
            texto.append("Mesa ").append(mesa.getInt("numero"));
            for (int j = 0; j < platos.length(); j++) texto.append(j == 0 ? ": " : " · ").append(platos.getString(j));
        }
        String aviso = texto.toString();
        if (!aviso.equals(avisoActual)) {
            avisoActual = aviso;
            mostrarAlarma(aviso);
            sirena.iniciar();
        }
    }
}
