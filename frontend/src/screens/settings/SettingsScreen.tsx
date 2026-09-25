/**
 * ui-spec.md SCR-07 설정(`/settings`, 읽기 전용). 구성: 제목 `설정` → 카드 3개
 * (프로젝트 폴더 / Claude 열기 / 수집), 와이어프레임 p.4 순서 그대로.
 *
 * 값은 진입 시 `GET /api/settings`로 받고, 스캔 수치는 SSE `registry`와 `다시 읽기` 응답으로
 * 갱신한다(FR-001-AC4). 두 출처의 병합은 `lib/derive/settingsValues.ts`가 정한다.
 * 화면에서 파일을 고치는 요소는 없다 — 경로는 읽기 전용 텍스트(FR-001-AC5),
 * `.claude/settings.json`은 복사만 한다(FR-014-AC1).
 */
import { useEffect, useState } from "react";
import { ApiError, apiGet } from "../../api/client";
import type { Settings } from "../../api/types";
import { settingsDisplayValues } from "../../lib/derive/settingsValues";
import { SETTINGS_TITLE, UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { ClaudeOpenCard } from "./ClaudeOpenCard";
import { CollectCard } from "./CollectCard";
import { ProjectFolderCard } from "./ProjectFolderCard";
import type { HelperStatus } from "./helperStatus";

export function SettingsScreen() {
  const { registry } = useSnapshotStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

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

  const values = settings === null ? null : settingsDisplayValues(settings, registry);

  // 도우미 `GET /health` 확인은 T-021(FR-013-AC10) 범위다. 이 화면은 확인 결과가 없는 동안의
  // 상태(`확인 중…`)를 ui-spec의 `로딩` 표기대로 보여주고, T-021이 실제 확인 결과를 넘긴다.
  const helperStatus: HelperStatus = { kind: "checking" };

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
        />
        <CollectCard
          settings={settings}
          hookConfigured={values === null ? null : values.hookConfigured}
          loadErrorMessage={loadErrorMessage}
        />
      </div>
    </div>
  );
}
