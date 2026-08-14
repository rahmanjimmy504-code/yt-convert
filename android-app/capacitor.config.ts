import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.rahmanjimmy504.ytconvert',
  appName: 'YT Convert',
  webDir: 'dist',
  android: {
    // Debug builds are installed by sideloading, so mixed content stays off
    // and cleartext is disabled: every request the WebView makes is HTTPS.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
