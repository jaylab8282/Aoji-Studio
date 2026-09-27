#!/usr/bin/env node
// E2E-08용 "다른 Origin" 정적 페이지 서버 (architecture.md §8.2 E2E-08).
// 이 페이지에서 fetch·EventSource로 서버(E2E 공개 포트 4185)를 호출해 Origin 규칙이 막는 것을 확인한다.
// 127.0.0.1에만 바인딩한다(NFR-04, conventions.md §6). 외부 의존 없음.
// 사용법: node other-origin-server.mjs [포트]
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const port = Number(process.argv[2] ?? 4192);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write("포트 번호가 올바르지 않습니다\n");
  process.exit(1);
}

// 정적 페이지는 파일시스템에서 읽지 않는다(경로 탐색 여지를 두지 않는다).
const PAGE = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>다른 Origin 테스트 페이지</title>
  </head>
  <body>
    <h1 data-testid="other-origin-page">다른 Origin 테스트 페이지</h1>
    <p>이 페이지는 E2E-08에서만 쓴다. 서버 API를 호출하면 거부되어야 한다.</p>
  </body>
</html>
`;

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://${HOST}:${port}`).pathname;
  if (request.method === "GET" && (path === "/" || path === "/index.html")) {
    const body = Buffer.from(PAGE, "utf8");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    });
    response.end(body);
    return;
  }
  response.writeHead(404, { "Cache-Control": "no-store" });
  response.end();
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

server.listen(port, HOST, () => {
  process.stdout.write(`e2e-other-origin listening on http://${HOST}:${port}\n`);
});
