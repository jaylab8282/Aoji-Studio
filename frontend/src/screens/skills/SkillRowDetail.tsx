/**
 * ui-spec SCR-08 펼친 내용(`08-13`, 2열): ① `설명`(형식 오류면 `circle-alert` + 빨강 600 사유) ② `사용 횟수 · <기간>`
 * `호출 N · 직접 호출 N · 미리 넣음 N = N회` ③ `정의상 (skills:)` ④ `실제 사용 (횟수)`(`기본 세션`·`정의됨 · 사용 0` 점선 칩).
 * 설명·사용 횟수는 두 열 전체, 정의상·실제 사용은 한 열씩(세로형 1열). 목록이 비면 `-`.
 */
import type { ReactNode } from "react";
import type { SkillRow, UsagePeriod } from "../../api/types";
import { Chip } from "../../components/ui/Chip";
import { Icon } from "../../components/ui/Icon";
import { periodWindowText } from "../../lib/derive/periodRange";
import {
  DEFAULT_SESSION_AGENT_TEXT,
  DEFINED_UNUSED_CHIP_TEXT,
  EMPTY_VALUE_TEXT,
  SKILL_DETAIL_ACTUAL,
  SKILL_DETAIL_CALL,
  SKILL_DETAIL_DEFINED,
  SKILL_DETAIL_DESCRIPTION,
  SKILL_DETAIL_PRELOAD,
  SKILL_DETAIL_SLASH,
  SKILL_DETAIL_USAGE_LEAD,
} from "../../lib/text";

const LIST = "flex flex-wrap items-center gap-x-4 gap-y-1";
const MONO_ITEM = "font-mono text-text-mono";
const COUNT = "font-mono font-bold text-text";

function Block({ title, wide = false, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "col-span-full" : undefined}>
      <div className="mb-0.5 font-semibold text-text-muted">{title}</div>
      {children}
    </div>
  );
}

interface SkillRowDetailProps {
  row: SkillRow;
  period: UsagePeriod;
}

export function SkillRowDetail({ row, period }: SkillRowDetailProps) {
  const { usage } = row;
  return (
    <>
      <Block title={SKILL_DETAIL_DESCRIPTION} wide>
        {row.formatError === null ? (
          <span className="whitespace-pre-line">{row.description}</span>
        ) : (
          <span className="flex items-center gap-2 font-semibold text-danger">
            <Icon name="circle-alert" className="text-danger" />
            {row.formatError}
          </span>
        )}
      </Block>
      <Block title={`${SKILL_DETAIL_USAGE_LEAD}${periodWindowText(period)}`} wide>
        <span className="tabular-nums">
          {SKILL_DETAIL_CALL} <b className={COUNT}>{usage.call}</b> · {SKILL_DETAIL_SLASH}{" "}
          <b className={COUNT}>{usage.slash}</b> · {SKILL_DETAIL_PRELOAD} <b className={COUNT}>{usage.preload}</b> ={" "}
          <b className={COUNT}>{usage.total}</b>회
        </span>
      </Block>
      <Block title={SKILL_DETAIL_DEFINED}>
        {row.definedAgents.length === 0 ? (
          <span>{EMPTY_VALUE_TEXT}</span>
        ) : (
          <div className={LIST}>
            {row.definedAgents.map((agent) => (
              <span key={agent} className={MONO_ITEM}>
                {agent}
              </span>
            ))}
          </div>
        )}
      </Block>
      <Block title={SKILL_DETAIL_ACTUAL}>
        {row.actualAgents.length === 0 && row.definedUnused.length === 0 ? (
          <span>{EMPTY_VALUE_TEXT}</span>
        ) : (
          <div className={LIST}>
            {row.actualAgents.map((actual) => (
              <span key={actual.agent ?? "default-session"} className={MONO_ITEM}>
                {actual.agent ?? DEFAULT_SESSION_AGENT_TEXT}
                <b className="ml-1 font-medium text-text">{actual.count}</b>
              </span>
            ))}
            {row.definedUnused.map((agent) => (
              <span key={`unused-${agent}`} className="inline-flex items-center gap-2">
                <span className={MONO_ITEM}>{agent}</span>
                <Chip tone="dash">{DEFINED_UNUSED_CHIP_TEXT}</Chip>
              </span>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
