import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "*",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@src": resolve(import.meta.dirname, "./src"),
    },
  },
  plugins: [react()],
});
