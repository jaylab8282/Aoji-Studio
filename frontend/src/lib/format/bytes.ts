/**
 * 08-2 파일 크기 표기: 1MB 미만은 `NNNKB`, 이상은 `N.NMB`(ui-spec SCR-08-2 고정폭 `N.NMB`, 시안 `1.8MB`·`184KB`).
 */
const KB = 1024;
const MB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / KB))}KB`;
}
