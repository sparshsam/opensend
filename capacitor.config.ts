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
      backgroundColor: '#1a0422',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a0422',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
    },
  },
};

export default config;
