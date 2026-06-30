import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built PWA (`dist/`) as a native iOS/Android shell.
 * Run `pnpm --filter @orbital/web build` then `npx cap add ios` / `cap sync`.
 * The native projects themselves are generated and git-ignored.
 */
const config: CapacitorConfig = {
  appId: 'app.orbitaltraffic',
  appName: 'Orbital Traffic',
  webDir: 'dist',
  backgroundColor: '#05060b',
  ios: {
    contentInset: 'always',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
