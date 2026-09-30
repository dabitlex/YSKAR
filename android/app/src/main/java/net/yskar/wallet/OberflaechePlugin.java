package net.yskar.wallet;

import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Systemleisten passend zum Thema der Oberflaeche.
 *
 *   leisten({ dunkel })  -> helle Symbole auf dunklem Grund, sonst dunkle.
 *
 * Die Oberflaeche ruft das bei jedem Themenwechsel; die Voreinstellung
 * aus capacitor.config.ts (dunkle Symbole) gilt bis dahin.
 */
@CapacitorPlugin(name = "Oberflaeche")
public class OberflaechePlugin extends Plugin {

    @PluginMethod
    public void leisten(PluginCall call) {
        final boolean dunkel = Boolean.TRUE.equals(call.getBoolean("dunkel", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            View wurzel = w.getDecorView();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, wurzel);
            c.setAppearanceLightStatusBars(!dunkel);
            c.setAppearanceLightNavigationBars(!dunkel);
            call.resolve();
        });
    }
}
