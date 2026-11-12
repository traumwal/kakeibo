import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages (https://<user>.github.io/kakeibo/) で配信するため base を設定
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'kakeibo - 家計簿',
        short_name: 'kakeibo',
        description: 'サブスクと単発支出をまとめて見える化する家計簿',
        lang: 'ja',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
