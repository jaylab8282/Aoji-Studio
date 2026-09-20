import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "../styles/base.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("root 엘리먼트를 찾을 수 없습니다");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
