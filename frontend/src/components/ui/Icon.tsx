import {
  ArrowRight,
  Building,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Copy,
  FileWarning,
  FolderX,
  House,
  Import,
  Pencil,
  Plus,
  RefreshCw,
  Scan,
  Search,
  Settings,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  WifiOff,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

/**
 * 아이콘 단일 진입점 (ADR-65 결정 5, conventions.md §7).
 * `lucide-react` 직접 import는 이 파일 한 곳뿐이다. 이름은 ui-spec 아이콘 표 23종만 받는다.
 */
const ICONS = {
  house: House,
  building: Building,
  settings: Settings,
  "square-terminal": SquareTerminal,
  search: Search,
  "chevron-down": ChevronDown,
  plus: Plus,
  import: Import,
  "arrow-right": ArrowRight,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  scan: Scan,
  "chevron-left": ChevronLeft,
  "wifi-off": WifiOff,
  "refresh-cw": RefreshCw,
  copy: Copy,
  pencil: Pencil,
  "folder-x": FolderX,
  "circle-alert": CircleAlert,
  check: Check,
  "file-warning": FileWarning,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type IconSize = "sm" | "md" | "lg";

/** 토큰 `icon/stroke`. */
const ICON_STROKE = 1.75;

/** `icon/sm` 16 · `icon/md` 18(메뉴) · `lg` 24(안내 카드). */
const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 18, lg: 24 };

interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
}

export function Icon({ name, size = "sm", className }: IconProps) {
  const Glyph = ICONS[name];
  const px = SIZE_PX[size];
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
      className={className === undefined ? "shrink-0" : `shrink-0 ${className}`}
    />
  );
}
