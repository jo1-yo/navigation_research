import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone + compass — run both of these in separate terminals:
//   Terminal 1:  npm run dev
//   Terminal 2:  npx cloudflared tunnel --url http://localhost:5173
// Then open the trycloudflare.com link on your phone.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
})
