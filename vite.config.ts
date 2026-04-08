import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          id: '/?source=pwa',
          name: 'Confissões Anônimas',
          short_name: 'Confissões',
          description: 'Um espaço seguro para desabafar, contar segredos e histórias sem revelar sua identidade. Interaja, comente e julgue anonimamente.',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'portrait-primary',
          dir: 'ltr',
          lang: 'pt-BR',
          categories: ['social', 'entertainment', 'lifestyle'],
          start_url: '/?source=pwa',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          shortcuts: [
            {
              name: 'Nova Confissão',
              short_name: 'Postar',
              description: 'Escreva uma nova confissão anônima',
              url: '/?action=post',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }]
            },
            {
              name: 'Em Alta',
              short_name: 'Em Alta',
              description: 'Veja as confissões mais populares',
              url: '/?tab=trending',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }]
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
