/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

package io.github.rahmanjimmy504.ytconvert;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the native extractor bridge before the WebView loads, so
        // the UI's first getStatus() call always finds the plugin.
        registerPlugin(YTExtractorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
