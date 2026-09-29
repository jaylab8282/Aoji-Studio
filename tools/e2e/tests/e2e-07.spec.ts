// E2E-07 외부 변경 감지 (architecture.md §8.2 E2E-07 행, tasks.md T-024 Done when
// "FR-001-AC3 — 파일 변경 → 02 반영 2초 이내(6가지 변경)").
// fixture: `project-configured`.
// 검증 ID: FR-001-AC3, FR-004-AC6(파일 측).
//
// 6가지 변경 = 정의 파일 추가·수정·삭제 + 구성 파일 추가·수정·삭제. 각 테스트는 자기 파일만
// 만들고 지우므로 실행 순서에 의존하지 않는다. 변경은 fixture 임시 사본에만 한다(architecture.md §8.1).
// "2초 이내"는 조건 대기만으로는 증명되지 않으므로 실제 경과 시간을 재서 단언한다.
import { expect, test } from "@playwright/test";

import {
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  agentFileContent,
  floorCard,
  floorName,
  gotoReady,
  measureFileChangeReflection,
  removeFixturePath,
  spriteSvg,
  teamFile,
  teamFileContent,
  writeFixtureFile,
} from "./ui-helpers";

test("[FR-001-AC3][FR-004-AC6][E2E-07] 정의 파일 추가 → 02 층에 책상이 2초 이내에 나타난다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t1";
  const agent = "e2e07-a1";
  // 구성 파일이 먼저 있고 정의 파일이 없으면 그 자리는 깨진 참조라 책상이 없다(FR-002-AC5).
  writeFixtureFile(teamFile(workflow), teamFileContent({ name: workflow, members: [agent] }));
  await gotoReady(page, "/workflows");
  await expect(floorName(page, workflow)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
  await expect(spriteSvg(page, agent)).toHaveCount(0);

  await measureFileChangeReflection(
    testInfo,
    "정의 파일 추가",
    () =>
      writeFixtureFile(
        agentFile(agent),
        agentFileContent({ name: agent, description: "추가 감지 확인", body: "본문." }),
      ),
    () => spriteSvg(page, agent).isVisible(),
  );
  // 측정 뒤 상태 확인(예산 밖): 반영된 화면이 실제로 그 상태인지 web-first 단언으로 다시 본다.
  await expect(spriteSvg(page, agent)).toBeVisible();
});

test("[FR-001-AC3][FR-004-AC6][E2E-07] 정의 파일 수정 → 02의 04-6 목록에 2초 이내에 반영된다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t2";
  const agent = "e2e07-a2";
  writeFixtureFile(
    agentFile(agent),
    agentFileContent({ name: agent, description: "수정 감지 확인", body: "본문." }),
  );
  writeFixtureFile(teamFile(workflow), teamFileContent({ name: workflow, members: [agent] }));
  await gotoReady(page, "/workflows");
  await expect(spriteSvg(page, agent)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
  await expect(page.getByText(`${agent}.md`, { exact: true })).toHaveCount(0);

  await measureFileChangeReflection(
    testInfo,
    "정의 파일 수정",
    // frontmatter 닫는 구분자를 없애 형식 오류로 바꾼다 → 층에서 빠지고 04-6 목록에 올라간다(FR-002-AC2).
    () => writeFixtureFile(agentFile(agent), `---\nname: ${agent}\ndescription: 닫는 구분자 없음\n\n본문.\n`),
    () => page.getByText(`${agent}.md`, { exact: true }).isVisible(),
  );
  // 측정 뒤 상태 확인(예산 밖).
  await expect(page.getByText(`${agent}.md`, { exact: true })).toBeVisible();

  // 같은 변경으로 책상은 사라지고 사유가 함께 표시된다(측정 대상은 위 한 번뿐이다).
  await expect(spriteSvg(page, agent)).toHaveCount(0);
  await expect(page.getByText("frontmatter 형식 오류", { exact: false }).first()).toBeVisible();
});

test("[FR-001-AC3][FR-004-AC6][E2E-07] 정의 파일 삭제 → 02 층에서 책상이 2초 이내에 사라진다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t3";
  const agent = "e2e07-a3";
  writeFixtureFile(
    agentFile(agent),
    agentFileContent({ name: agent, description: "삭제 감지 확인", body: "본문." }),
  );
  writeFixtureFile(teamFile(workflow), teamFileContent({ name: workflow, members: [agent] }));
  await gotoReady(page, "/workflows");
  await expect(spriteSvg(page, agent)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

  await measureFileChangeReflection(
    testInfo,
    "정의 파일 삭제",
    () => removeFixturePath(agentFile(agent)),
    async () => (await spriteSvg(page, agent).count()) === 0,
  );
  // 측정 뒤 상태 확인(예산 밖).
  await expect(spriteSvg(page, agent)).toHaveCount(0);

  // 구성 파일이 참조하던 name이 사라졌으므로 04-6에 깨진 참조로 표시된다(FR-002-AC5).
  await expect(page.getByText(`구성 파일 참조 깨짐 (${workflow})`, { exact: false }).first()).toBeVisible();
});

test("[FR-001-AC3][FR-004-AC6][E2E-07] 구성 파일 추가 → 02에 새 층이 2초 이내에 나타난다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t4";
  await gotoReady(page, "/workflows");
  await expect(floorName(page, workflow)).toHaveCount(0);

  await measureFileChangeReflection(
    testInfo,
    "구성 파일 추가",
    () =>
      writeFixtureFile(
        teamFile(workflow),
        teamFileContent({ name: workflow, description: "구성 파일 추가 감지" }),
      ),
    () => floorName(page, workflow).isVisible(),
  );
  // 측정 뒤 상태 확인(예산 밖).
  await expect(floorName(page, workflow)).toBeVisible();
});

test("[FR-001-AC3][FR-004-AC6][E2E-07] 구성 파일 수정 → 02 층의 팀장·책상이 2초 이내에 반영된다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t5";
  const agent = "e2e07-a5";
  writeFixtureFile(
    agentFile(agent),
    agentFileContent({ name: agent, description: "구성 파일 수정 감지", body: "본문." }),
  );
  writeFixtureFile(teamFile(workflow), teamFileContent({ name: workflow, description: "수정 전" }));
  await gotoReady(page, "/workflows");
  await expect(floorCard(page, workflow)).toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요", {
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
  await expect(spriteSvg(page, agent)).toHaveCount(0);

  await measureFileChangeReflection(
    testInfo,
    "구성 파일 수정",
    () =>
      writeFixtureFile(
        teamFile(workflow),
        teamFileContent({ name: workflow, description: "수정 후", lead: agent }),
      ),
    () => spriteSvg(page, agent).isVisible(),
  );
  // 측정 뒤 상태 확인(예산 밖).
  await expect(spriteSvg(page, agent)).toBeVisible();

  await expect(floorCard(page, workflow)).not.toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
});

test("[FR-001-AC3][FR-004-AC6][E2E-07] 구성 파일 삭제 → 02에서 층이 2초 이내에 사라진다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e07-t6";
  writeFixtureFile(teamFile(workflow), teamFileContent({ name: workflow, description: "삭제 대상" }));
  await gotoReady(page, "/workflows");
  await expect(floorName(page, workflow)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

  await measureFileChangeReflection(
    testInfo,
    "구성 파일 삭제",
    () => removeFixturePath(teamFile(workflow)),
    async () => (await floorName(page, workflow).count()) === 0,
  );
  // 측정 뒤 상태 확인(예산 밖).
  await expect(floorName(page, workflow)).toHaveCount(0);
});
