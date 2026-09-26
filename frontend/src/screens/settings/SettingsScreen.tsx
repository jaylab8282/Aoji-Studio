/**
 * ui-spec.md SCR-07 설정(`/settings`, 읽기 전용). 구성: 제목 `설정` → 카드 3개
 * (프로젝트 폴더 / Claude 열기 / 수집), 와이어프레임 p.4 순서 그대로.
 *
 * 값은 진입 시 `GET /api/settings`로 받고, 스캔 수치는 SSE `registry`와 `다시 읽기` 응답으로
 * 갱신한다(FR-001-AC4). 두 출처의 병합은 `lib/derive/settingsValues.ts`가 정한다.
 * 화면에서 파일을 고치는 요소는 없다 — 경로는 읽기 전용 텍스트(FR-001-AC5),
 * `.claude/settings.json`은 복사만 한다(FR-014-AC1).
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet } from "../../api/client";
import { checkHelperHealth, getHelperToken } from "../../api/helper";
import type { HelperOpenResult } from "../../api/helper";
import type { Settings } from "../../api/types";
import { HelperMissingDialog } from "../../dialogs/helper-missing/HelperMissingDialog";
import { useHelperOpen } from "../../dialogs/helper-missing/useHelperOpen";
import { settingsDisplayValues } from "../../lib/derive/settingsValues";
import { SETTINGS_TITLE, UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { ClaudeOpenCard } from "./ClaudeOpenCard";
import { CollectCard } from "./CollectCard";
import { ProjectFolderCard } from "./ProjectFolderCard";
import type { HelperStatus } from "./helperStatus";

/**
 * 도우미 설치 여부 확인 (FR-013-AC10, ui-spec.md SCR-07 `열기 도우미` 행).
 * `GET /health`가 2초 안에 응답하지 않으면 `미설치`, 응답해도 `GET /api/helper/token`이 토큰을
 * 주지 못하면 `미설치 · 토큰 파일 없음`이다(토큰 파일은 도우미가 첫 실행 때 만든다).
 */
async function checkHelperStatus(helperUrl: string): Promise<HelperStatus> {
  if (!(await checkHelperHealth(helperUrl))) return { kind: "missing" };
  const token = await getHelperToken();
  if (token.kind === "token") return { kind: "installed", checkedAt: new Date().toISOString() };
  return token.kind === "no-token" ? { kind: "no-token" } : { kind: "missing" };
}

export function SettingsScreen() {
  const { config, registry } = useSnapshotStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [helperStatus, setHelperStatus] = useState<HelperStatus>({ kind: "checking" });
  const helperUrl = config === null ? null : config.helperUrl;

  useEffect(() => {
    let cancelled = false;
    apiGet<Settings>("/api/settings")
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((error: unknown) => {
        // client.ts가 모든 예외를 `ApiError`로 정규화한다. 서버가 준 `message`를 가공 없이 쓴다
        // (conventions.md §4 MUST).
        if (!cancelled) {
          setLoadErrorMessage(error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 도우미 호출 결과로 `열기 도우미` 행을 갱신한다: 204면 방금 응답한 것이고(설치됨),
  // 무응답이면 미설치다. 403·400은 도우미가 응답한 것이므로 설치 상태를 내리지 않는다.
  const helper = useHelperOpen(
    useCallback((result: HelperOpenResult) => {
      if (result.kind === "opened") {
        setHelperStatus({ kind: "installed", checkedAt: new Date().toISOString() });
      } else if (result.kind === "no-response") {
        setHelperStatus({ kind: "missing" });
      }
    }, []),
  );

  // 진입 시 확인(FR-013-AC10). 도우미 주소는 `snapshot.config.helperUrl`이다(ADR-12).
  useEffect(() => {
    if (helperUrl === null) return;
    let cancelled = false;
    void checkHelperStatus(helperUrl).then((status) => {
      if (!cancelled) setHelperStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [helperUrl]);

  const values = settings === null ? null : settingsDisplayValues(settings, registry);

  /**
   * `테스트로 열기`(FR-013-AC10 "버튼을 누를 때 확인"): 먼저 `GET /health`로 다시 확인하고,
   * 응답이 없으면 도우미를 호출하지 않는다. 확인에 실패하면 행이 `미설치`가 되고 버튼이 비활성이 된다.
   */
  function handleTestOpen() {
    if (settings === null || helperUrl === null) return;
    helper.open({ target: "default" }, settings.defaultSessionCommand, () =>
      checkHelperHealth(helperUrl),
    );
  }

  return (
    <div className="px-page-x py-8">
      {/*
        와이어프레임 p.4의 07 카드 열은 화면 폭을 채우지 않는다(실측 819px. 01·02·03 와이어프레임은
        1111~1127px로 꽉 채우므로 07만 좁은 열이다). 819px은 토큰이 아니고 임의값(`max-w-[819px]`)은
        금지이므로(conventions.md §7 MUST) Tailwind 기본 스케일에서 가장 가까운 단계인
        `max-w-3xl`(768px)을 쓴다 — ADR-40이 팝업 폭에서 택한 방식과 같다.
      */}
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="text-title font-bold text-text">{SETTINGS_TITLE}</h1>
        <ProjectFolderCard values={values} loadErrorMessage={loadErrorMessage} />
        <ClaudeOpenCard
          settings={settings}
          loadErrorMessage={loadErrorMessage}
          helperStatus={helperStatus}
          openErrorMessage={helper.errorMessage}
          onTestOpen={handleTestOpen}
        />
        <CollectCard
          settings={settings}
          hookConfigured={values === null ? null : values.hookConfigured}
          loadErrorMessage={loadErrorMessage}
        />
      </div>
      {helper.missingCommand === null ? null : (
        <HelperMissingDialog command={helper.missingCommand} onClose={helper.closeMissingDialog} />
      )}
    </div>
  );
}
