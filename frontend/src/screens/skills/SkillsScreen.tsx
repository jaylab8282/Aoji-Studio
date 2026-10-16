/**
 * ui-spec.md SCR-08 스킬(`/skills`). 구성: 제목 줄(`08-2`) → 기간 줄(`08-3`) → 안내 줄(`08-4`, hook 미설정일 때만) → 목록 카드(`08-5`, `ExpandableList`).
 * 제목 줄 `가져오기`·`스킬 만들기`(`writable` 필요, FR-020-E2)·행 `수정`·빈 상태 카드 두 버튼은 08-1·08-2를 연다. 안내 줄은 ① 저장 직후 8000ms > ② hook 미설정 순으로 하나만 보인다.
 * 펼침은 이 컴포넌트의 로컬 상태다(기간을 바꿔도 유지, 라우트를 떠나면 버림 — conventions §7). 조회·재조회는 `useSkillsReport`.
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다(상단 바 하나).
 */
import { useMemo, useState } from "react";
import type { UsagePeriod } from "../../api/types";
import { DataTitle } from "../../components/data/DataTitle";
import { ExpandableList } from "../../components/data/ExpandableList";
import { PeriodSelector } from "../../components/data/PeriodSelector";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { NoticeCard } from "../../components/ui/NoticeCard";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { periodWindowText } from "../../lib/derive/periodRange";
import { deriveSkillRows, rowMarkerWf, type SkillRowView } from "../../lib/derive/skillRows";
import {
  RETRY_BUTTON_LABEL,
  SKILLS_COL_ACTIONS,
  SKILLS_COL_AGENTS,
  SKILLS_COL_NAME,
  SKILLS_COL_USAGE_LEAD,
  SKILLS_EMPTY_BODY_AFTER_PATH,
  SKILLS_EMPTY_TITLE,
  SKILLS_HOW_TEXT,
  SKILLS_LIST_LABEL,
  SKILLS_NO_HOOK_NOTE,
  SKILLS_PATH,
  SKILL_CREATE_BUTTON_LABEL,
  SKILL_IMPORT_BUTTON_LABEL,
  SKILL_SAVED_NOTICE,
  WRITABLE_FALSE_REASON,
  SKILLS_SUBTITLE_AFTER_COUNT,
  SKILLS_SUBTITLE_AFTER_PATH,
  SKILLS_SUBTITLE_SLASH_NAME,
  SKILLS_SUBTITLE_TAIL,
  SKILLS_SUM_LEAD,
  SKILLS_SUM_TAIL,
  SKILLS_TITLE,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { SkillRowCells } from "./SkillRowCells";
import { SkillRowDetail } from "./SkillRowDetail";
import { useSavedNotice } from "./useSavedNotice";
import { useSkillsReport } from "./useSkillsReport";

export function SkillsScreen() {
  const { registry } = useSnapshotStore();
  const openDialog = useDialogNavigate();
  const [period, setPeriod] = useState<UsagePeriod>("7d");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { report, errorMessage, retry } = useSkillsReport(period);
  const savedNoticeVisible = useSavedNotice();

  const views = useMemo(() => (report === null ? [] : deriveSkillRows(report.skills)), [report]);
  const writable = registry === null ? null : registry.writable;
  const shownPeriod = report === null ? period : report.period;
  // ADR-44: 첫 스냅샷 전에는 비활성(이유 줄 없음). `writable=false`면 비활성 + `쓰기 권한 없음`(FR-020-E2).
  const writeOff = writable !== true;
  const openCreate = () => openDialog({ dialog: "skill-new" });
  const openImport = () => openDialog({ dialog: "skill-import" });

  function toggle(name: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const subtitle = (
    <>
      <MonoText>{SKILLS_PATH}</MonoText>
      {SKILLS_SUBTITLE_AFTER_PATH}
      {registry === null ? (
        <Skeleton className="inline-block w-6 align-middle" />
      ) : (
        <span className="tabular-nums">{registry.skillCount}</span>
      )}
      {SKILLS_SUBTITLE_AFTER_COUNT}
      <MonoText>{SKILLS_SUBTITLE_SLASH_NAME}</MonoText>
      {SKILLS_SUBTITLE_TAIL}
    </>
  );

  return (
    <div className="flex flex-col gap-3 px-gutter py-6">
      <DataTitle title={SKILLS_TITLE} subtitle={subtitle} wf="08-2">
        <div className="grid justify-items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" disabled={writeOff} onClick={openImport}>
              <Icon name="import" />
              {SKILL_IMPORT_BUTTON_LABEL}
            </Button>
            <Button variant="primary" disabled={writeOff} onClick={openCreate}>
              <Icon name="plus" />
              {SKILL_CREATE_BUTTON_LABEL}
            </Button>
          </div>
          {writable === false ? <span className="text-aux text-text-muted">{WRITABLE_FALSE_REASON}</span> : null}
        </div>
      </DataTitle>

      <section data-wf="08-3" className="flex flex-none flex-wrap items-center gap-3">
        <PeriodSelector value={period} onChange={setPeriod} range={report === null ? null : report.range} />
        <span className="text-aux text-text-muted">
          {SKILLS_SUM_LEAD}
          {report === null ? (
            <Skeleton className="inline-block w-8 align-middle" />
          ) : (
            <b className="font-mono font-medium text-text">{report.totalUses}</b>
          )}
          {SKILLS_SUM_TAIL}
        </span>
        <span className="flex-1" />
        <span className="text-aux text-text-muted">{SKILLS_HOW_TEXT}</span>
      </section>

      {savedNoticeVisible ? (
        <p
          role="status"
          data-wf="08-4"
          className="flex flex-none items-center gap-2 rounded-card border border-border bg-inset px-4 py-2 text-aux text-text"
        >
          <Icon name="info" className="text-text-muted" />
          {SKILL_SAVED_NOTICE}
        </p>
      ) : report !== null && !report.hookConfigured ? (
        <p
          role="status"
          data-wf="08-4"
          className="flex flex-none items-center gap-2 rounded-card border border-border bg-inset px-4 py-2 text-aux text-text"
        >
          <Icon name="circle-alert" className="text-text-muted" />
          {SKILLS_NO_HOOK_NOTE}
        </p>
      ) : null}

      {errorMessage !== null ? (
        <div className="grid justify-items-start gap-2">
          <Alert message={errorMessage} />
          <Button variant="secondary" onClick={retry}>
            <Icon name="refresh-cw" />
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : report !== null && report.skills.length === 0 ? (
        <NoticeCard
          kind="empty"
          icon="puzzle"
          title={SKILLS_EMPTY_TITLE}
          wf="08-5"
          actions={
            <>
              <Button variant="primary" disabled={writeOff} onClick={openCreate}>
                <Icon name="plus" />
                {SKILL_CREATE_BUTTON_LABEL}
              </Button>
              <Button variant="secondary" disabled={writeOff} onClick={openImport}>
                <Icon name="import" />
                {SKILL_IMPORT_BUTTON_LABEL}
              </Button>
            </>
          }
        >
          <p>
            <MonoText>{SKILLS_PATH}</MonoText>
            {SKILLS_EMPTY_BODY_AFTER_PATH}
          </p>
          {writable === false ? <p>{WRITABLE_FALSE_REASON}</p> : null}
        </NoticeCard>
      ) : (
        <ExpandableList<SkillRowView>
          label={SKILLS_LIST_LABEL}
          wf="08-5"
          headers={[
            SKILLS_COL_NAME,
            `${SKILLS_COL_USAGE_LEAD}${periodWindowText(shownPeriod)}`,
            SKILLS_COL_AGENTS,
            <span key="actions" className="block text-right">
              {SKILLS_COL_ACTIONS}
            </span>,
          ]}
          columnsClass="skill-row-grid"
          rows={views}
          rowKey={(view) => view.row.name}
          rowName={(view) => view.row.name}
          expanded={expanded}
          onToggle={toggle}
          loading={report === null}
          chevWf="08-12"
          detailWf="08-13"
          rowWf={(view) => rowMarkerWf(view.row)}
          renderCells={(view, control) => (
            <SkillRowCells
              view={view}
              expanded={control.expanded}
              detailId={control.detailId}
              onToggle={control.toggle}
              writable={writable}
              onEdit={(name) => openDialog({ dialog: "skill-edit", skill: name })}
              onDelete={(name) => openDialog({ dialog: "skill-delete", skill: name })}
            />
          )}
          renderDetail={(view) => <SkillRowDetail row={view.row} period={shownPeriod} />}
        />
      )}
    </div>
  );
}
