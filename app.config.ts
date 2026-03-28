import { defineConfig } from '@tanstack/react-start/config';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';

export default defineConfig({
  vite: {
    plugins: [
      react(),
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
    resolve: {
      alias: {
        '@': '/src',
        '@convex': '/convex',
      },
    },
  },
  server: {
    preset: 'node-server',
    port: 3000,
  },
});
