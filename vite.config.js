// Builds the React app in web/ into web/dist, which server.js serves.
// `npm run dev` runs Vite with hot reload and sends API calls to `npm start`.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = `http://localhost:${process.env.PORT || 3000}`;
const proxied = ["/api", "/auth", "/demo-canvas", "/cal", "/calendar.ics", "/qr.svg", "/share", "/impact", "/login.html", "/privacy.html", "/offline.html", "/styles.css", "/icons.js", "/sw.js", "/manifest.webmanifest", "/logo.svg", "/logo-3d.svg", "/logo-mark.svg", "/icons", "/img"];

export default defineConfig({
  root: "web",
  publicDir: false,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173, proxy: Object.fromEntries(proxied.map((p) => [p, server])) },
});
