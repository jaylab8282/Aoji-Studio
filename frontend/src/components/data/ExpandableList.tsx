/**
 * ui-spec.md §공통 `ExpandableList`(`xl-list`, 08·09, ADR-88 결정 2): 카드 안 머리 줄(aux 600 muted, 아래 구분선) + 행(사이 구분선).
 * 행 = 한 줄 요약(`r1`, 열은 화면별 `columnsClass`) + 펼친 영역(`exp`: 왼쪽 2px `border-strong`, 바탕 행 전체 `bg-inset`, 2열 / 세로형 1열).
 * 펼침 버튼(`chev`) 34×34, 접힘 `chevron-right` / 펼침 `chevron-down`, `aria-expanded`, `aria-label` `<이름> 펼치기`/`<이름> 접기`.
 * 처음 모두 접힘, 여러 행 동시. **펼침 상태는 이 컴포넌트가 갖지 않는다** — 호출하는 화면 컴포넌트의 로컬 상태(펼친 이름 집합)를
 * `expanded`/`onToggle`로 받는다(기간을 바꿔도 유지, 라우트를 떠나면 버림: URL·스토어·저장소 금지, conventions §7).
 * 로딩 = 행 8개 스켈레톤(이름 40% · 막대 · 버튼 자리).
 */
import { useId } from "react";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";
import { expandRowLabel } from "../../lib/text";

/** 로딩 스켈레톤 행 수(ui-spec §공통 `ExpandableList`). */
export const EXPANDABLE_LOADING_ROWS = 8;

interface ExpandableListProps<T> {
  /** 목록 카드의 접근 이름(`스킬 목록`). */
  label: string;
  /** 화면 원본의 `data-wf`(08 `08-5` 등). */
  wf?: string;
  /** 머리 줄 글자. 첫 칸(펼침 버튼 자리)은 이 컴포넌트가 비워 두므로 둘째 칸부터 넘긴다. 칸마다 정렬은 노드가 정한다. */
  headers: readonly ReactNode[];
  /** 머리 줄·행 줄에 함께 거는 열 정의 `@utility`(`skill-row-grid` 등). */
  columnsClass: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 펼침 버튼 접근 이름에 쓰는 행 이름. */
  rowName: (row: T) => string;
  /** 펼친 행의 키 집합(호출하는 화면의 로컬 상태). */
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** 펼침 버튼 다음 칸들. `toggle`은 같은 행을 펼치고 접는 함수(`UsedAgentsButton` 등에 쓴다). */
  renderCells: (row: T, control: { expanded: boolean; toggle: () => void; detailId: string }) => ReactNode;
  /** 펼친 영역 안 내용(`expand-panel` 안에 들어간다). */
  renderDetail: (row: T) => ReactNode;
  /** true면 행 대신 스켈레톤 8줄(첫 조회). */
  loading?: boolean;
  /** 펼침 버튼 칸의 `data-wf`(08 `08-12`). */
  chevWf?: string;
  /** 펼친 영역의 `data-wf`(08 `08-13`). */
  detailWf?: string;
}

const ROW_GRID = "grid items-center gap-x-4 gap-y-1 px-4 py-2";

export function ExpandableList<T>({
  label,
  wf,
  headers,
  columnsClass,
  rows,
  rowKey,
  rowName,
  expanded,
  onToggle,
  renderCells,
  renderDetail,
  loading = false,
  chevWf,
  detailWf,
}: ExpandableListProps<T>) {
  const baseId = useId();
  const columnCount = headers.length + 1;

  return (
    <section
      aria-label={label}
      aria-busy={loading}
      data-wf={wf}
      className="flex min-w-0 flex-none flex-col rounded-card border border-border bg-card"
    >
      <div className={`${ROW_GRID} ${columnsClass} border-b border-border text-aux font-semibold text-text-muted`}>
        <span aria-hidden="true" />
        {headers.map((header, index) => (
          <span key={index}>{header}</span>
        ))}
      </div>
      <ul className="m-0 list-none p-0">
        {loading
          ? Array.from({ length: EXPANDABLE_LOADING_ROWS }, (_, index) => (
              <li key={index} className="border-b border-border last:border-b-0" data-testid="expandable-skeleton-row">
                <div className={`${ROW_GRID} ${columnsClass}`}>
                  {Array.from({ length: columnCount }, (_, column) => (
                    <Skeleton
                      key={column}
                      decorative
                      className={column === 0 ? "size-control" : column === 1 ? "w-2/5" : "w-full"}
                    />
                  ))}
                </div>
              </li>
            ))
          : rows.map((row, index) => {
              const key = rowKey(row);
              const name = rowName(row);
              const isOpen = expanded.has(key);
              const detailId = `${baseId}-detail-${index}`;
              return (
                <li
                  key={key}
                  data-open={isOpen ? "" : undefined}
                  className={`border-b border-border last:border-b-0 ${isOpen ? "bg-inset" : ""}`}
                >
                  <div className={`${ROW_GRID} ${columnsClass}`}>
                    <span data-wf={chevWf}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailId : undefined}
                        aria-label={expandRowLabel(name, isOpen)}
                        onClick={() => onToggle(key)}
                        className={`inline-grid size-control place-items-center rounded-control border border-transparent bg-transparent p-0 hover:border-border-strong hover:text-text ${
                          isOpen ? "text-text" : "text-text-muted"
                        }`}
                      >
                        <Icon name={isOpen ? "chevron-down" : "chevron-right"} />
                      </button>
                    </span>
                    {renderCells(row, { expanded: isOpen, toggle: () => onToggle(key), detailId })}
                  </div>
                  {isOpen ? (
                    <div id={detailId} data-wf={detailWf} className="expand-panel">
                      {renderDetail(row)}
                    </div>
                  ) : null}
                </li>
              );
            })}
      </ul>
    </section>
  );
}
