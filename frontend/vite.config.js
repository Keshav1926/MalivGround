import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/features": "http://localhost:8000",
      "/auth": "http://localhost:8000",
      "/system": "http://localhost:8000",
    },
  },
});
