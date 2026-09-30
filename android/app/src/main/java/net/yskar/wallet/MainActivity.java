package net.yskar.wallet;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins vor super.onCreate registrieren, sonst kennt die
        // Bruecke sie nicht.
        registerPlugin(MiningServicePlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
