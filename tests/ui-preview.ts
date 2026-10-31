import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Development-only preview: production providers and APIs are never loaded.
const server = await createServer({
  configFile: false,
  plugins: [
    {
      name: 'isolated-ui-fixtures',
      enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('/context/DashboardContext')) return path.resolve('tests/ui-preview/context.tsx');
        if (source.endsWith('/lib/firebase')) return path.resolve('tests/ui-preview/firebase.ts');
      },
      configureServer(instance) {
        instance.middlewares.use('/api', (_request, response) => {
          response.statusCode = 503;
          response.end('UI preview: API access disabled');
        });
      },
    },
    react(), tailwindcss(),
  ],
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
});
await server.listen();
console.log('Isolated UI preview: http://127.0.0.1:4175/tests/ui-preview/index.html');
