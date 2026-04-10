import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In dev: proxy /api → localhost:8080 (set VITE_API_BASE= in .env to override)
// In prod (Vercel): VITE_API_BASE is set in Vercel env vars, baked in via define
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE ?? ''  // empty = use relative /api/* paths

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    define: {
      // Bake VITE_API_BASE into build output (injected at build time by Vercel)
      'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase),
    },
  }
})
