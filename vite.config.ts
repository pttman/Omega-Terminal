import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'external-refresh-preamble',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<script type="module">import [\s\S]*?from "\/@react-refresh";[\s\S]*?<\/script>/, '<script type="module" src="/src/refresh.ts"></script>');
      },
    },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
