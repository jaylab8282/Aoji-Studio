/**
 * ui-spec.md SCR-07 설정(`/settings`, 읽기 전용). 구성: 제목·부제(`07-2`) → 카드 3개. 가로형은 2열
 * (왼쪽 프로젝트 폴더 → 수집 / 오른쪽 Claude 열기), 세로형은 1열(폴더 → 수집 → Claude 열기).
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다: `<main>`은 `AppShell` 하나, 화면 제목 `<h1>`은 상단 바 하나(D-125).
 *
 * 값은 진입 시 `GET /api/settings`로 받고, 스캔 수치는 SSE `registry`와 `다시 읽기` 응답으로
 * 갱신한다(FR-001-AC4). 두 출처의 병합은 `lib/derive/settingsValues.ts`가 정한다.
 * 화면에서 파일을 고치는 요소는 없다 — 경로는 읽기 전용 텍스트(FR-001-AC5),
 * `.claude/settings.json`은 복사만 한다(FR-014-AC1).
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client";
import { checkHelperHealth, getHelperToken } from "../../api/helper";
import type { HelperOpenResult } from "../../api/helper";
import type { Settings, UsagePeriod } from "../../api/types";
import { HelperMissingDialog } from "../../dialogs/helper-missing/HelperMissingDialog";
import { useHelperOpen } from "../../dialogs/helper-missing/useHelperOpen";
import { settingsDisplayValues } from "../../lib/derive/settingsValues";
import { SETTINGS_SUBTITLE, SETTINGS_TITLE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { useUsageSignal } from "../../state/usageSignalStore";
import { useThrottledRefetch } from "../../state/useThrottledRefetch";
import { ClaudeOpenCard } from "./ClaudeOpenCard";
import { CollectCard } from "./CollectCard";
import { GlobalClaudeCard } from "./GlobalClaudeCard";
import { ProjectFolderCard } from "./ProjectFolderCard";
import { StatuslineCard } from "./StatuslineCard";
import type { HelperStatus } from "./helperStatus";

/**
 * 도우미 설치 여부 확인 (FR-013-AC10, ui-spec.md SCR-07 `열기 도우미` 행).
 * `GET /health`가 2초 안에 응답하지 않으면 `미설치`, 응답해도 `GET /api/helper/token`이 토큰을
 * 주지 못하면 `미설치 · 토큰 파일 없음`이다(토큰 파일은 도우미가 첫 실행 때 만든다).
 */
async function checkHelperStatus(helperUrl: string): Promise<HelperStatus> {
  if (!(await checkHelperHealth(helperUrl))) return { kind: "missing" };
  const token = await getHelperToken();
  if (token.kind === "token") return { kind: "installed" };
  return token.kind === "no-token" ? { kind: "no-token" } : { kind: "missing" };
}

/** `GET /api/settings`는 기간이 없다. 공용 훅이 기간을 받으므로 바뀌지 않는 고정값을 넘긴다. */
const SETTINGS_PERIOD: UsagePeriod = "7d";

function fetchSettings(): Promise<Settings> {
  return apiGet<Settings>("/api/settings");
}

export function SettingsScreen() {
  const { config, registry } = useSnapshotStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [helperStatus, setHelperStatus] = useState<HelperStatus>({ kind: "checking" });
  const helperUrl = config === null ? null : config.helperUrl;

  // 진입 때 조회, SSE `usage-changed`의 `settings`(상태줄 수신·전역 연결 변화)마다 다시 조회한다
  // (1초에 1회 이하로 묶고 마지막 신호 뒤 1회 — 공용 훅, ADR-94). 이미 값이 있으면 재조회 실패로
  // 값을 지우지 않는다(에러 카드는 첫 조회 실패일 때만).
  const settingsSignal = useUsageSignal("settings");
  const { errorMessage, retry: retryLoad } = useThrottledRefetch({
    period: SETTINGS_PERIOD,
    fetcher: fetchSettings,
    onLoaded: setSettings,
    trigger: String(settingsSignal),
  });
  const loadErrorMessage = settings === null ? errorMessage : null;

  // 도우미 호출 결과로 `열기 도우미` 행을 갱신한다: 204면 방금 응답한 것이고(설치됨),
  // 무응답이면 미설치다. 403·400은 도우미가 응답한 것이므로 설치 상태를 내리지 않는다.
  const helper = useHelperOpen(
    useCallback((result: HelperOpenResult) => {
      if (result.kind === "opened") {
        setHelperStatus({ kind: "installed" });
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
    <div className="flex flex-col gap-4 px-gutter py-6">
      <section data-wf="07-2">
        <h2 className="text-title font-bold tracking-title text-text">{SETTINGS_TITLE}</h2>
        <p className="mt-1 text-text-muted">{SETTINGS_SUBTITLE}</p>
      </section>
      {/* 가로형 2열(왼쪽 폴더 → 수집 → 전역 연결 / 오른쪽 Claude 열기 → 상태줄), 세로형 1열(열 상자를 풀고 카드의 `order`로 폴더 → 수집 → Claude 열기 → 상태줄 → 전역 연결). */}
      <div className="grid grid-cols-2 items-start gap-4 portrait:flex portrait:flex-col portrait:items-stretch">
        <div className="grid min-w-0 gap-4 portrait:contents">
          <ProjectFolderCard values={values} loadErrorMessage={loadErrorMessage} onRetry={retryLoad} />
          <CollectCard
            settings={settings}
            hookConfigured={values === null ? null : values.hookConfigured}
            loadFailed={loadErrorMessage !== null}
          />
          <GlobalClaudeCard settings={settings} loadFailed={loadErrorMessage !== null} />
        </div>
        <div className="grid min-w-0 gap-4 portrait:contents">
          <ClaudeOpenCard
            settings={settings}
            loadFailed={loadErrorMessage !== null}
            helperStatus={helperStatus}
            hostOs={settings === null ? helper.hostOs : settings.hostOs}
            openErrorMessage={helper.errorMessage}
            onTestOpen={handleTestOpen}
          />
          <StatuslineCard settings={settings} loadFailed={loadErrorMessage !== null} />
        </div>
      </div>
      {helper.missingCommand === null ? null : (
        <HelperMissingDialog command={helper.missingCommand} hostOs={helper.hostOs} onClose={helper.closeMissingDialog} />
      )}
    </div>
  );
}
