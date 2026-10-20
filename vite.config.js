import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api goes to the PHP backend that XAMPP's Apache serves from htdocs/apcas-appointment-queue.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost", rewrite: (path) => `/apcas-appointment-queue${path}` },
    },
  },
});
