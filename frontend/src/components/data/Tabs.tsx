/**
 * ui-spec.md §공통 `Tabs`(`tabs`, 10): `role="tablist"`, 탭 높이 40, 선택 `text-text` + 아래 2px `brand-blue` 막대, 그 밖 `text-muted`.
 * 각 탭은 `role="tab" aria-selected`이고 선택 탭만 Tab 키 순서에 들어간다(roving tabindex). ←/→/Home/End로 탭을 옮기면 선택도 따라간다.
 * 패널은 호출하는 화면이 `role="tabpanel"`로 그린다 — `tabIds.ts`의 `tabId`·`tabPanelId`로 `aria-controls`/`aria-labelledby`를 맞춘다.
 */
import type { KeyboardEvent } from "react";
import { tabId, tabPanelId } from "./tabIds";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  /** 접근 이름(tablist). */
  label: string;
  /** 같은 화면의 탭 묶음을 구분하는 접두어(`tabId`·`tabPanelId`와 같은 값). */
  idPrefix: string;
  wf?: string;
}

export function Tabs<T extends string>({ tabs, selected, onSelect, label, idPrefix, wf }: TabsProps<T>) {
  function moveTo(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (next === undefined) return;
    onSelect(next.id);
    document.getElementById(tabId(idPrefix, next.id))?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") moveTo(index + 1);
    else if (event.key === "ArrowLeft") moveTo(index - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={label} data-wf={wf} className="flex flex-none gap-1 border-b border-border px-4">
      {tabs.map((tab, index) => {
        const isSelected = tab.id === selected;
        return (
          <button
            key={tab.id}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={tabPanelId(idPrefix)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`relative min-h-tab px-3 font-semibold ${isSelected ? "text-text" : "text-text-muted"}`}
          >
            {tab.label}
            {isSelected ? (
              <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-dot bg-brand-blue" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
