import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Custom Vite plugin so flat Root uploads on GitHub + Vercel work with 0 errors
 * even when mobile browsers flatten src/, components/, utils/, and public/audio/ into the Root (/)!
 */
function flatRootSupportPlugin(): Plugin {
  const extensions = ['', '.ts', '.tsx', '.css', '.js', '.jsx', '.json'];

  const findInRootOrSrc = (baseName: string): string | null => {
    const candidates = [
      path.resolve(__dirname, baseName),
      path.resolve(__dirname, 'src', baseName),
      path.resolve(__dirname, 'src/components', baseName),
      path.resolve(__dirname, 'src/utils', baseName),
    ];
    for (const cand of candidates) {
      for (const ext of extensions) {
        const full = cand + ext;
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          return full;
        }
      }
    }
    return null;
  };

  return {
    name: 'flat-root-support-plugin',
    enforce: 'pre',
    resolveId(source, importer) {
      // Handle entry point /src/main.tsx or ./main.tsx or /main.tsx
      if (
        source === '/src/main.tsx' ||
        source === './main.tsx' ||
        source === '/main.tsx' ||
        source.endsWith('/src/main.tsx')
      ) {
        return findInRootOrSrc('main.tsx');
      }

      // Handle relative imports inside project files
      if (source.startsWith('.') && importer && !importer.includes('node_modules')) {
        const importerDir = path.dirname(importer);
        const directTarget = path.resolve(importerDir, source);
        for (const ext of extensions) {
          const full = directTarget + ext;
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            return full;
          }
        }
        // Fallback: look up by filename at Root or src/
        const baseName = path.basename(source);
        const fallback = findInRootOrSrc(baseName);
        if (fallback) {
          return fallback;
        }
      }
      return null;
    },
    closeBundle() {
      // Copy all .mp3, .png, .svg, and manifest.json from Root (/) into dist/ and dist/audio/
      const distDir = path.resolve(__dirname, 'dist');
      const distAudioDir = path.resolve(distDir, 'audio');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      if (!fs.existsSync(distAudioDir)) {
        fs.mkdirSync(distAudioDir, { recursive: true });
      }

      const rootFiles = fs.readdirSync(__dirname);
      for (const file of rootFiles) {
        const srcPath = path.resolve(__dirname, file);
        if (!fs.statSync(srcPath).isFile()) continue;

        if (file.endsWith('.mp3')) {
          fs.copyFileSync(srcPath, path.resolve(distDir, file));
          fs.copyFileSync(srcPath, path.resolve(distAudioDir, file));
        } else if (
          file.endsWith('.png') ||
          file.endsWith('.svg') ||
          file === 'manifest.json'
        ) {
          fs.copyFileSync(srcPath, path.resolve(distDir, file));
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      flatRootSupportPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Google Phone - CBE 951 AI',
          short_name: 'Phone',
          description:
            'የኢትዮጵያ ንግድ ባንክ (951) የደንበኞች አገልግሎት - በGoogle Phone ዲዛይን የተሰራ በአማርኛ የሚሰማና የሚናገር AI',
          theme_color: '#1A73E8',
          background_color: '#FFFFFF',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});
