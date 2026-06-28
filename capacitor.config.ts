import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.kovina.opensend',
  appName: 'OpenSend',
  webDir: 'out',
  android: {
    backgroundColor: '#1a0422',
  },
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
      clientId: '932918847607-dpo001dflibtevemp2lk13usrh2fq7og.apps.googleusercontent.com',
    },
  },
};

export default config;
