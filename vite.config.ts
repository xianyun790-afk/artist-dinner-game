import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  // 本地开发和根路径部署保持 '/'；发布到 GitHub Pages 子路径时用
  // VITE_BASE_PATH=/projects/afterglow/ npm run build（见 build:pages）。
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
