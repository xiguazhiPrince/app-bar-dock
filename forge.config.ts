import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Setting `packagerConfig.ignore` makes the Vite plugin skip installing its own
 * filter (it only keeps `/.vite`), so this has to spell out everything the
 * packaged app needs on disk:
 *
 * - `/.vite` - the Vite bundles themselves.
 * - `koffi` and its `@koromix` platform package - koffi is marked external in
 *   vite.main.config.ts and resolved with `require('koffi')` at runtime, and it
 *   locates its .node binary relative to its own directory on disk. Bundling it
 *   is not an option, so the package tree has to survive packaging.
 *
 * This relies on pnpm's `node-linker=hoisted` (.npmrc): with the default
 * symlinked layout these paths would have to point into `/node_modules/.pnpm`.
 */
function shouldKeepPackagedFile(file: string): boolean {
  if (file.startsWith('/.vite')) return true;
  if (file === '/node_modules') return true;
  if (file === '/node_modules/koffi' || file.startsWith('/node_modules/koffi/')) return true;
  if (file === '/node_modules/@koromix' || file.startsWith('/node_modules/@koromix/')) return true;
  return false;
}

const config: ForgeConfig = {
  packagerConfig: {
    // `AutoUnpackNativesPlugin` adds the `**/*.node` unpack pattern, which is
    // what lifts koffi's binary out of the archive. The icon worker needs no
    // such treatment: Electron loads worker_threads scripts through the asar
    // shim, so it runs straight out of app.asar.
    asar: true,
    ignore: (file: string) => {
      if (!file) return false;
      return !shouldKeepPackagedFile(file);
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // Runs the Win32 icon extraction off the main thread; see icon-native.ts.
          // Emitted next to the main bundle as `.vite/build/icon-worker.js`.
          entry: 'src/main/icon-worker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
