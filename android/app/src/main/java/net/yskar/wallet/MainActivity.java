package net.yskar.wallet;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins vor super.onCreate registrieren, sonst kennt die
        // Bruecke sie nicht.
        registerPlugin(MiningServicePlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(OberflaechePlugin.class);
        super.onCreate(savedInstanceState);

        /*
          Der WebView-Renderer ist ein eigener Prozess. Der Vordergrunddienst
          haelt den App-Prozess am Leben -- den Renderer aber bindet Android
          standardmaessig nur solange als wichtig, wie der WebView sichtbar
          ist. Danach darf das System ihn einfrieren, und mit ihm die Worker:
          Im Protokoll (30.09.2026) kamen ~45 s nach dem Wechsel in den
          Hintergrund keine Meldungen mehr, bis die App wieder sichtbar war.
          waivedWhenNotVisible=false: Der Renderer bleibt wichtig, auch wenn
          niemand hinsieht.
        */
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
