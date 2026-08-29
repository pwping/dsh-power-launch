import { defineConfig } from 'tsdown'

/**
 * dsh-power-launch plugin build config (mirrors the dsh-wx-typesetting layout).
 *
 * Node half: cordis host plugin (lib/index.js) mounting the status + shutdown
 * routes onto the dsh web server. The dsh host process supplies the host SDK
 * + cordis at mount time.
 *
 * Browser half: the dsh client bundle (lib/client.js) — a CJS module wrapped
 * as a closure-factory handed to `window.__ModuleLoader__.load`, with the
 * shell's frozen module table kept external and everything else inlined.
 */

/** Plugin identity stamped into the client bundle handoff (must equal the package name). */
const PLUGIN_ID = 'dsh-power-launch'

/**
 * The shell's frozen client module table (dsh-web-frontend staticModules):
 * these specifiers are external and resolved through the loader's injected
 * `require`; anything not listed is inlined into the bundle.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig([
  {
    name: PLUGIN_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    // Keep the `.js` extension so `main`/`exports` (".") resolve exactly
    // `lib/index.js`; the dsh host resolves deps at mount time.
    fixedExtension: false,
    // The dsh host process supplies these at mount time; never bundle them.
    external: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-host-webserver',
    ],
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => CLIENT_EXTERNALS.includes(id) ? undefined : true,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
