import { defineConfig } from "vite";

// Vite auto-detects the React JSX runtime via esbuild; no extra plugin needed for this scaffold.
export default defineConfig({
  server: { port: 5173 },
});
