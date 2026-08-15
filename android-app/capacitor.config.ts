// SPDX-License-Identifier: GPL-3.0-or-later
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.rahmanjimmy504.ytconvert',
  appName: 'YT Convert',
  webDir: 'dist',
  android: {
    // Debug builds get their own applicationId suffix (see build.gradle) so a
    // CI debug APK can sit alongside a signed release on the same phone.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
