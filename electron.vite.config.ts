import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig(async ({ command }): Promise<any> => {
  const prod = command === 'build';
  // dev 下使用 swc 加速，构建时使用 babel + react compiler
  const rendererPlugins = prod
    ? [
        react({
          babel: {
            plugins: ['babel-plugin-react-compiler'],
          },
        }),
      ]
    : [(await import('@vitejs/plugin-react-swc')).default()];

  return {
    main: {
      build: {
        outDir: 'release/app/dist/main',
        minify: prod,
        rollupOptions: {
          output: {
            format: 'es',
          },
        },
      },
    },
    preload: {
      build: {
        outDir: 'release/app/dist/preload',
        minify: prod,
        rollupOptions: {
          output: {
            format: 'cjs',
          },
        },
      },
      define: {
        __BUILD_DATE__: Date.now(),
      },
    },
    renderer: {
      build: {
        outDir: 'release/app/dist/renderer',
        minify: prod,
        cssCodeSplit: false,
        assetsInlineLimit: 1024 * 20,
        rollupOptions: {
          output: {
            manualChunks(id: string) {
              if (id.includes('node_modules')) {
                return 'vendor';
              }
              return null;
            },
          },
        },
      },
      server: {
        port: 3456,
        strictPort: true,
      },
      plugins: rendererPlugins,
      resolve: {
        alias: {
          '@': path.resolve('src/renderer'),
        },
      },
    },
  };
});
