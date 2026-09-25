import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { startStream } from "../api/stream";
import { redirectToCanonical } from "../lib/origin";
import "../styles/base.css";

// ADR-41: createRoot·렌더·첫 API 호출보다 먼저 진입 주소를 정규화한다.
// 이동이 일어나면(true) 이 문서는 곧 버려지므로 렌더도 SSE 연결도 하지 않는다.
if (!redirectToCanonical(window.location)) {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("root 엘리먼트를 찾을 수 없습니다");
  }

  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

  // realtime-spec.md §4: SSE 연결은 앱당 하나만 연다.
  startStream();
}
