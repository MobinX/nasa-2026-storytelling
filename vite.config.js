import { resolve } from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // The answer service is server-only. Load the root .env for the dev middleware but never expose these
  // through Vite's client env: there is no VITE_ prefix on any of them.
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL"]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    server: {
      host: "*",
      allowedHosts: true,
    },
    resolve: {
      alias: {
        "@src": resolve(import.meta.dirname, "./src"),
      },
    },
    plugins: [
      react(),
      {
        name: "ask-api",
        apply: "serve",
        configureServer(server) {
          // Vite has no /api directory in dev, so give the real Vercel function a local socket. Import it
          // lazily so a production build never pulls the AI SDK into the config process.
          server.middlewares.use("/api/ask", async (req, res) => {
            try {
              const { default: handler } = await import("./api/ask.js");
              await handler(req, res);
            } catch (error) {
              console.error("dev /api/ask:", error?.message ?? error);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: "The local answer service failed." }));
              } else if (!res.writableEnded) {
                res.end();
              }
            }
          });
        },
      },
    ],
  };
});
