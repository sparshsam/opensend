import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.kovina.opensend',
  appName: 'OpenSend',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#bc3fde',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a0422',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
    },
    GoogleAuth: {
      clientId: '', // ← Set your Web OAuth client ID here (e.g. "xxxxx.apps.googleusercontent.com")
    },
  },
};

export default config;
