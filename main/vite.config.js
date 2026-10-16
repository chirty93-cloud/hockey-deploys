import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Precache the complete build, including Pixi's lazy renderer chunks, on the first visit.
const offlineBuild = {
  name: 'air-hockey-offline-build',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle)
      .filter((name) => /\.(js|css)$/.test(name))
      .sort();
    const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
    this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    const worker = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8').replace(
      '__BUILD_VERSION__',
      version,
    );
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineBuild],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
