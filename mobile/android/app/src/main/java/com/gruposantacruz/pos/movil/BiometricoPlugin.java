package com.gruposantacruz.pos.movil;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// Ingreso con huella: guarda un texto (las credenciales) cifrado con una llave del Keystore de Android
// que solo se puede usar tras una autenticación biométrica (CryptoObject). Si cambian las huellas
// registradas en el teléfono, la llave se invalida y hay que volver a activarlo.
@CapacitorPlugin(name = "Biometrico")
public class BiometricoPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "pos_biometria_v1";
    private static final String PREFS = "pos_biometria";
    private static final String TRANSFORMACION = "AES/GCM/NoPadding";

    private interface AccionCifrado {
        void ejecutar(Cipher cipher) throws Exception;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject resultado = new JSObject();
        resultado.put("disponible", hayBiometria());
        resultado.put("activada", prefs().contains("dato"));
        call.resolve(resultado);
    }

    private boolean hayBiometria() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
        Context contexto = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            BiometricManager gestor = contexto.getSystemService(BiometricManager.class);
            return gestor != null
                && gestor.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS;
        }
        return contexto.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        final String texto = call.getString("texto");
        if (texto == null || texto.isEmpty() || !hayBiometria()) {
            call.reject("No disponible");
            return;
        }
        try {
            final Cipher cipher = Cipher.getInstance(TRANSFORMACION);
            cipher.init(Cipher.ENCRYPT_MODE, crearLlave());
            autenticar(call, cipher, "Activar ingreso con huella", cifrador -> {
                byte[] cifrado = cifrador.doFinal(texto.getBytes(StandardCharsets.UTF_8));
                prefs().edit()
                    .putString("iv", Base64.encodeToString(cifrador.getIV(), Base64.NO_WRAP))
                    .putString("dato", Base64.encodeToString(cifrado, Base64.NO_WRAP))
                    .apply();
                call.resolve();
            });
        } catch (Exception e) {
            call.reject("No se pudo activar la huella");
        }
    }

    @PluginMethod
    public void leer(PluginCall call) {
        String iv = prefs().getString("iv", null);
        final String dato = prefs().getString("dato", null);
        if (iv == null || dato == null || !hayBiometria()) {
            call.reject("NO_ACTIVADA");
            return;
        }
        try {
            KeyStore almacen = KeyStore.getInstance(KEYSTORE);
            almacen.load(null);
            SecretKey llave = (SecretKey) almacen.getKey(ALIAS, null);
            if (llave == null) {
                borrarTodo();
                call.reject("INVALIDADA");
                return;
            }
            final Cipher cipher = Cipher.getInstance(TRANSFORMACION);
            cipher.init(Cipher.DECRYPT_MODE, llave, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            autenticar(call, cipher, "Ingresar con huella", cifrador -> {
                byte[] claro = cifrador.doFinal(Base64.decode(dato, Base64.NO_WRAP));
                JSObject resultado = new JSObject();
                resultado.put("texto", new String(claro, StandardCharsets.UTF_8));
                call.resolve(resultado);
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            borrarTodo();
            call.reject("INVALIDADA");
        } catch (Exception e) {
            call.reject("No se pudo leer la huella");
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        borrarTodo();
        call.resolve();
    }

    private void borrarTodo() {
        prefs().edit().clear().apply();
        try {
            KeyStore almacen = KeyStore.getInstance(KEYSTORE);
            almacen.load(null);
            almacen.deleteEntry(ALIAS);
        } catch (Exception ignorada) {
            // Sin llave que borrar.
        }
    }

    private SecretKey crearLlave() throws Exception {
        KeyStore almacen = KeyStore.getInstance(KEYSTORE);
        almacen.load(null);
        almacen.deleteEntry(ALIAS);
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
            ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        KeyGenerator generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generador.init(spec.build());
        return generador.generateKey();
    }

    private void autenticar(PluginCall call, Cipher cipher, String titulo, AccionCifrado accion) {
        getActivity().runOnUiThread(() -> autenticarEnPantalla(call, cipher, titulo, accion));
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private void autenticarEnPantalla(PluginCall call, Cipher cipher, String titulo, AccionCifrado accion) {
        Executor ejecutor = getContext().getMainExecutor();
        final boolean[] terminado = {false};
        BiometricPrompt dialogo = new BiometricPrompt.Builder(getContext())
            .setTitle(titulo)
            .setSubtitle("POS Santacruz")
            .setNegativeButton("Cancelar", ejecutor, (d, w) -> {
                if (!terminado[0]) { terminado[0] = true; call.reject("CANCELADO"); }
            })
            .build();
        dialogo.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), ejecutor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationError(int codigo, CharSequence mensaje) {
                    if (!terminado[0]) { terminado[0] = true; call.reject("CANCELADO"); }
                }

                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult resultado) {
                    if (terminado[0]) return;
                    terminado[0] = true;
                    try {
                        accion.ejecutar(resultado.getCryptoObject().getCipher());
                    } catch (Exception e) {
                        call.reject("No se pudo completar");
                    }
                }
            });
    }
}
