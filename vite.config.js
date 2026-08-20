import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phone + compass — run both of these in separate terminals:
//   Terminal 1:  npm run dev
//   Terminal 2:  npx cloudflared tunnel --url http://localhost:5173
// Then open the trycloudflare.com link on your phone.
export default defineConfig({
  // Deployed at https://jo1-yo.github.io/navigation_research/ — assets resolve
  // under this base. Local dev is unaffected (vite serves dev from / regardless).
  base: '/navigation_research/',
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
})
