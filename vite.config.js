import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fingerprintTarget = env.VITE_FINGERPRINT_PROXY_TARGET || 'http://127.0.0.1:5001'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/fingerprint-api': {
          target: fingerprintTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fingerprint-api/, ''),
        },
      },
    },
  }
})
