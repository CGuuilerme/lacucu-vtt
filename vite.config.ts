import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { lobbyServer } from './lobby-server.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), lobbyServer()],
})
