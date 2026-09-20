import { Outlet } from "react-router-dom";

// AppShell(사이드바·상단바)·04-3 배너·SSE 연결은 T-013에서 채운다.
// T-001은 라우팅 골격만 연결한다.
export function App() {
  return (
    <div className="min-h-screen bg-page text-text">
      <Outlet />
    </div>
  );
}
