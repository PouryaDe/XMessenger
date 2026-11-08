import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version-plugin',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swDistPath = path.join(distDir, 'sw.js');
      const now = new Date();
      const buildTime = now.toISOString();
      const buildId = now.getTime().toString(36);
      const buildVersion = `v${buildId}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      // 1. Stamp dist/sw.js with the unique build version
      if (fs.existsSync(swDistPath)) {
        let swContent = fs.readFileSync(swDistPath, 'utf-8');
        swContent = swContent.replace(/__BUILD_TIMESTAMP__/g, buildVersion);
        fs.writeFileSync(swDistPath, swContent, 'utf-8');
        console.log(`[PWA Plugin] Stamped sw.js with buildVersion: ${buildVersion}`);
      }

      // 2. Generate dist/version.json for server & client version checking
      const versionJsonPath = path.join(distDir, 'version.json');
      fs.writeFileSync(
        versionJsonPath,
        JSON.stringify({ buildVersion, buildTime, buildId }, null, 2),
        'utf-8'
      );
    }
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(Date.now().toString(36))
  },
  plugins: [react(), swVersionPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
