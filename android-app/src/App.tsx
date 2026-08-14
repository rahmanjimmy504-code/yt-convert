/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import ConverterScreen from '@/screens/converter';
import FaqScreen from '@/screens/faq';
import PrivacyScreen from '@/screens/privacy';
import TermsScreen from '@/screens/terms';
import LicenceScreen from '@/screens/licence';

/**
 * HashRouter, not BrowserRouter: the WebView loads index.html from the APK,
 * so there is no server to resolve deep paths on reload.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ConverterScreen />} />
        <Route path="/faq" element={<FaqScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route path="/terms" element={<TermsScreen />} />
        <Route path="/licence" element={<LicenceScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
