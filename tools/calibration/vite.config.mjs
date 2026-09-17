// Standalone Vite config for the head-pose threshold calibration tool.
// Deliberately NOT part of the renderer build (renderer/vite.config.mjs) or
// electron-builder's packaged files list — this never ships in the exam app.
// Run with: npm run calibrate  (from the project root)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "./",
  plugins: [react()],
  // Resolve @tensorflow/* etc. from the project root's node_modules, since
  // this tool has no node_modules of its own.
  resolve: {
    alias: {}
  }
});
