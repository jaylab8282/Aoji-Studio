/** `Tabs`의 탭·패널 id 규칙. 화면의 `role="tabpanel"`이 `aria-labelledby`/`id`를 맞출 때 쓴다. */
export function tabId(idPrefix: string, id: string): string {
  return `${idPrefix}-tab-${id}`;
}

export function tabPanelId(idPrefix: string): string {
  return `${idPrefix}-panel`;
}
