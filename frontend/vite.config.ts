import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));

function copySpeechAssets() {
  const onnxDir = resolve(root, "public/onnx");
  const voiceDir = resolve(root, "public/voices");
  mkdirSync(onnxDir, { recursive: true });
  mkdirSync(voiceDir, { recursive: true });
  for (const name of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
    copyFileSync(resolve(root, "node_modules/@huggingface/transformers/dist", name), resolve(onnxDir, name));
  }
  copyFileSync(resolve(root, "node_modules/kokoro-js/voices/af_heart.bin"), resolve(voiceDir, "af_heart.bin"));
}

copySpeechAssets();

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "drop-bundled-ort-wasm",
      generateBundle(_options, bundle) {
        for (const name of Object.keys(bundle)) {
          if (name.endsWith(".wasm")) delete bundle[name];
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@huggingface/transformers", "kokoro-js"],
  },
  server: {
    port: 5173,
    watch: {
      ignored: ["**/android/**", "**/public/models/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
