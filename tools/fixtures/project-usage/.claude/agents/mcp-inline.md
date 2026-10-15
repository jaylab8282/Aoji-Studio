---
name: mcp-inline
description: 에이전트 안에 MCP 서버를 정의한 에이전트
tools: Read
mcpServers:
  - qa-browser:
      type: stdio
      command: node
      args:
        - qa-browser.js
  - github
---

브라우저로 확인한다.
