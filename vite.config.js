import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone + compass: npx cloudflared tunnel --url http://localhost:5173
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
})
