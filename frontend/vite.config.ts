/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

// 산출물 CSS에 외부 URL을 0줄로 둔다(NFR-11, ADR-65 결정 4). Tailwind가 붙이는 라이선스 머리말의
// 주소 글자(https://tailwindcss.com)만 뺀다. 이름·버전·MIT 표기는 그대로 남는다.
function stripBannerUrl(): Plugin {
  return {
    name: "strip-tailwind-banner-url",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css") && typeof file.source === "string") {
          file.source = file.source.replace(/ \| https:\/\/tailwindcss\.com/g, "");
        }
      }
    },
  };
}

// architecture.md §4.3: Vite dev server는 127.0.0.1에만 바인딩하고
// /api·/hooks는 개발용 Spring Boot(8080)로 프록시한다. 외부 노출 없음.
export default defineConfig({
  plugins: [react(), tailwindcss(), stripBannerUrl()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
      "/hooks": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
