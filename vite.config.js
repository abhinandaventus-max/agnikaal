import { defineConfig } from 'vite';

// Serve the Vercel function locally so `npm run dev` has the live feed too.
const localApi = () => ({
  name: 'local-api',
  configureServer(server) {
    server.middlewares.use('/api/nrt', async (req, res) => {
      const { default: handler } = await server.ssrLoadModule('/api/nrt.js');
      const url = new URL(req.url, 'http://localhost');
      const shim = {
        statusCode: 200,
        setHeader: (k, v) => res.setHeader(k, v),
        status(c) { this.statusCode = c; return this; },
        json(o) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); },
      };
      await handler({ query: Object.fromEntries(url.searchParams), url: req.url }, shim);
    });
  },
});

export default defineConfig({
  plugins: [localApi()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', deck: 'deck.html' } },
  },
});
