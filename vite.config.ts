import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const hosted = process.env.FORMA_HOSTED === '1';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'forma-hosted-meta',
      transformIndexHtml(html) {
        if (!hosted || html.includes('name="forma-hosted"')) return html;
        return html.replace('<head>', '<head>\n    <meta name="forma-hosted" content="1">');
      },
    },
  ],
  base: hosted ? '/' : './',
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
