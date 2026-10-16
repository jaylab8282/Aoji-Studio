/**
 * ui-spec.md SCR-08-3 스킬 삭제 확인 (`?dialog=skill-delete&skill=<name>`, `08-3-skill-delete.html`). FR-022.
 * 계약: api-spec.yaml `DELETE /api/skills/{skill}` — 200 `{trashPath}`, 404 `SKILL_NOT_FOUND`, 500 `IO_FAILED`.
 * 구성은 05-3·06-6과 같은 `ConfirmByNameDialog`다. `bg-inset` 상자(`08-3-2`)의 에이전트 목록은 08이 받은 `definedAgents`(오름차순)이고
 * 0명이면 상자가 없다(FR-022-AC2). 08을 거치지 않고 열렸으면(스토어에 응답이 없으면) 같은 조회를 한 번 한다.
 * 404 → `이미 없는 스킬입니다`(서버 message)를 보이고 3000ms 뒤 닫고 08을 갱신한다(FR-022-E2, ADR-34와 같은 상수).
 * 500 → 서버 message를 `Alert`로, 폴더 그대로(FR-022-E1). 성공 → 닫고 08에서 행이 빠진다(FR-022-AC3·AC5).
 */
import { useEffect, useRef, useState } from "react";
import { ApiError, apiDelete } from "../../api/client";
import { fetchSkills } from "../../api/usage";
import { ConfirmByNameDialog } from "../../components/ui/ConfirmByNameDialog";
import { MonoText } from "../../components/ui/MonoText";
import {
  SKILL_DELETE_CONFIRM_LABEL,
  SKILL_DELETE_CONFIRM_PENDING_LABEL,
  SKILL_DELETE_INPUT_LABEL,
  SKILL_DELETE_TRASH_LEAD,
  SKILL_DELETE_TRASH_PATH,
  SKILL_DELETE_TRASH_TAIL,
  SKILL_DELETE_USED_BY_NOTE_CODE,
  SKILL_DELETE_USED_BY_NOTE_LEAD,
  SKILL_DELETE_USED_BY_NOTE_TAIL,
  UNKNOWN_ERROR_MESSAGE,
  skillDeleteReason,
  skillDeleteTitle,
  skillDeleteUsedByTitle,
} from "../../lib/text";
import { skillsViewStore, useSkillsViewStore } from "../../state/skillsViewStore";

/** FR-022-E2: 404 안내를 보여준 뒤 닫는 지연. ui-spec이 정한 3000ms(ADR-34, conventions §7). */
const NOT_FOUND_NOTICE_MS = 3000;

interface SkillDeleteDialogProps {
  skillName: string;
  onClose: () => void;
}

/** 정의 파일 `skills:`에 이 스킬을 둔 에이전트(name 오름차순). 응답이 아직 없으면 null. */
function useDefinedAgents(skillName: string): string[] | null {
  const { report } = useSkillsViewStore();
  const [fetched, setFetched] = useState<string[] | null>(null);
  const needFetch = report === null;

  useEffect(() => {
    if (!needFetch) return;
    let cancelled = false;
    fetchSkills("7d")
      .then((loaded) => {
        if (!cancelled) setFetched(loaded.skills.find((skill) => skill.name === skillName)?.definedAgents ?? []);
      })
      .catch(() => {
        if (!cancelled) setFetched([]);
      });
    return () => {
      cancelled = true;
    };
  }, [needFetch, skillName]);

  const source = report === null ? fetched : (report.skills.find((skill) => skill.name === skillName)?.definedAgents ?? []);
  return source === null ? null : [...source].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function SkillDeleteDialog({ skillName, onClose }: SkillDeleteDialogProps) {
  const agents = useDefinedAgents(skillName);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closingAfterNotice, setClosingAfterNotice] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!closingAfterNotice) return;
    const timer = setTimeout(() => {
      skillsViewStore.requestRefresh();
      onCloseRef.current();
    }, NOT_FOUND_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [closingAfterNotice]);

  async function handleDelete() {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiDelete<{ trashPath: string }>(`/api/skills/${encodeURIComponent(skillName)}`);
      skillsViewStore.afterDelete(skillName);
      onClose();
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setErrorMessage(apiError === null ? UNKNOWN_ERROR_MESSAGE : apiError.message);
      if (apiError?.code === "SKILL_NOT_FOUND") setClosingAfterNotice(true);
      setPending(false);
    }
  }

  if (agents === null) return null;

  return (
    <ConfirmByNameDialog
      title={skillDeleteTitle(skillName)}
      notes={[
        <>
          {SKILL_DELETE_TRASH_LEAD}
          <MonoText>{SKILL_DELETE_TRASH_PATH}</MonoText>
          {SKILL_DELETE_TRASH_TAIL}
        </>,
      ]}
      extra={
        agents.length === 0 ? null : (
          <section data-wf="08-3-2" className="grid gap-2 rounded-card border border-border bg-inset p-3">
            <h3 className="text-aux font-semibold text-text">{skillDeleteUsedByTitle(agents.length)}</h3>
            <ul className="alist-scroll grid font-mono text-aux text-text-mono">
              {agents.map((agent) => (
                <li key={agent} className="flex items-center gap-2 border-b border-border py-1.5 last:border-b-0">
                  {agent}
                </li>
              ))}
            </ul>
            <span className="text-aux text-text-muted">
              {SKILL_DELETE_USED_BY_NOTE_LEAD}
              <MonoText>{SKILL_DELETE_USED_BY_NOTE_CODE}</MonoText>
              {SKILL_DELETE_USED_BY_NOTE_TAIL}
            </span>
          </section>
        )
      }
      inputLabel={SKILL_DELETE_INPUT_LABEL}
      expectedName={skillName}
      confirmLabel={SKILL_DELETE_CONFIRM_LABEL}
      confirmPendingLabel={SKILL_DELETE_CONFIRM_PENDING_LABEL}
      reason={skillDeleteReason(skillName)}
      pending={pending}
      confirmDisabled={closingAfterNotice}
      errorMessage={errorMessage}
      onConfirm={() => void handleDelete()}
      onClose={onClose}
      wf={{ dialog: "08-3-1", input: "08-3-3", footer: "08-3-4" }}
    />
  );
}
