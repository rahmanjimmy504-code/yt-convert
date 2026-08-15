// SPDX-License-Identifier: GPL-3.0-or-later
package io.github.rahmanjimmy504.ytconvert;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import io.github.rahmanjimmy504.ytconvert.plugins.ytextractor.YTExtractorPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // In-app Capacitor plugins must be registered before the bridge is
        // created. The web bundle discovers YTExtractor via
        // Capacitor.isPluginAvailable() (src/lib/runtime.ts) and only enables
        // the real download button when it is present.
        registerPlugin(YTExtractorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
