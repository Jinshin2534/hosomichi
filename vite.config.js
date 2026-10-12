import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5730, strictPort: true },
  test: { include: ['test/**/*.test.js'] },
});
