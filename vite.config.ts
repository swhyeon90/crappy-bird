import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  server: {
    // bind all interfaces so the tunnel can reach the dev server
    host: true,
    // allow tunnel hosts to reach the dev server
    // (.devtunnels.ms = VS Code port forwarding; ngrok kept as fallback)
    allowedHosts: [
      '.devtunnels.ms',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
    ],
    // Vite 7 hardened dev-server CORS; allow cross-origin so tunneled
    // browsers (and some stricter networks) don't get blocked. Dev only.
    cors: true,
    // Make the HMR client connect back over the HTTPS tunnel (port 443)
    // instead of trying ws://localhost:3000, which fails through ngrok.
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
  },
  plugins: [
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    netlify(),
    viteReact(),
  ],
})

export default config
