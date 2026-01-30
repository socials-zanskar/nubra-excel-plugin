import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { blogDiscoveryPlugin } from "./vite-plugins/blog-discovery";
import { useCaseDiscoveryPlugin } from "./vite-plugins/usecase-discovery";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/products/api',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    blogDiscoveryPlugin(),
    useCaseDiscoveryPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
