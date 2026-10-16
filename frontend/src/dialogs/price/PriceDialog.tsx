/**
 * ui-spec.md SCR-10-1 단가 (`?dialog=price`, `10-1-price-panel.html`). 읽기 전용 단가표(FR-026-AC3·AC4).
 * 구성: 제목 `단가` + 부제 + 오른쪽 출처·확인 날짜(`10-1-1`) → 표(`10-1-2`, 모델 이름 오름차순 — 서버 순서 그대로) → 안내 상자(`10-1-3`) → `닫기`(`10-1-4`, 처음 초점).
 * 입력란·저장·기본값으로·모델 행 추가를 두지 않는다. 출처 URL은 링크로 두지 않는다(외부 요청 없음, NFR-17).
 * 10에서 열면 단가표는 이미 받은 상태다. 주소로 바로 열었으면 같은 조회를 한 번 한다(스토어가 중복을 막는다).
 */
import { useEffect } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Alert";
import { Skeleton } from "../../components/ui/Skeleton";
import { priceText } from "../../lib/derive/priceRows";
import {
  CLOSE_BUTTON_LABEL,
  COST_COL_CACHE_CREATION,
  COST_COL_CACHE_READ,
  COST_COL_INPUT,
  COST_COL_MODEL,
  COST_COL_OUTPUT,
  PRICE_DIALOG_SOURCE_LEAD,
  PRICE_DIALOG_SUBTITLE,
  PRICE_DIALOG_TITLE,
  PRICE_NOTE_LEAD,
  PRICE_NOTE_STRONG,
  PRICE_NOTE_TAIL,
  RETRY_BUTTON_LABEL,
} from "../../lib/text";
import { pricingStore, usePricingStore } from "../../state/pricingStore";

interface PriceDialogProps {
  onClose: () => void;
}

const HEAD_CELL = "border-b border-border px-3 py-2 text-left text-aux font-semibold whitespace-nowrap text-text-muted";
const NUMBER_HEAD_CELL = `${HEAD_CELL} text-right`;
const BODY_CELL = "border-b border-border px-3 py-2 whitespace-nowrap";
const NUMBER_CELL = `${BODY_CELL} text-right font-mono text-text-mono`;

export function PriceDialog({ onClose }: PriceDialogProps) {
  const { pricing, error } = usePricingStore();

  useEffect(() => {
    pricingStore.load();
  }, []);

  return (
    <Dialog title={PRICE_DIALOG_TITLE} size="price" onClose={onClose} wf="10-1-1">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-section font-bold text-text">{PRICE_DIALOG_TITLE}</h2>
          <span className="text-aux text-text-muted">{PRICE_DIALOG_SUBTITLE}</span>
          <span className="flex-1" />
          {pricing === null ? null : (
            <span className="text-aux text-text-muted">
              {PRICE_DIALOG_SOURCE_LEAD}
              <span className="font-mono text-text-mono">{pricing.checkedAt}</span>
            </span>
          )}
        </div>
      </div>

      {error !== null ? (
        <div className="grid justify-items-start gap-2">
          <Alert message={error} />
          <Button variant="secondary" onClick={() => pricingStore.load()}>
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : (
        <div data-wf="10-1-2" className="min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} w-1/3`}>
                  {COST_COL_MODEL}
                </th>
                <th scope="col" className={NUMBER_HEAD_CELL}>
                  {COST_COL_INPUT}
                </th>
                <th scope="col" className={NUMBER_HEAD_CELL}>
                  {COST_COL_OUTPUT}
                </th>
                <th scope="col" className={NUMBER_HEAD_CELL}>
                  {COST_COL_CACHE_CREATION}
                </th>
                <th scope="col" className={NUMBER_HEAD_CELL}>
                  {COST_COL_CACHE_READ}
                </th>
              </tr>
            </thead>
            <tbody aria-busy={pricing === null}>
              {pricing === null
                ? [0, 1, 2].map((index) => (
                    <tr key={index}>
                      <td colSpan={5} className={BODY_CELL}>
                        <Skeleton decorative className="w-full" />
                      </td>
                    </tr>
                  ))
                : pricing.models.map((row) => (
                    <tr key={row.model}>
                      <td className={`${BODY_CELL} font-mono text-text-mono`}>{row.model}</td>
                      <td className={NUMBER_CELL}>{priceText(row.input)}</td>
                      <td className={NUMBER_CELL}>{priceText(row.output)}</td>
                      <td className={NUMBER_CELL}>{priceText(row.cacheWrite)}</td>
                      <td className={NUMBER_CELL}>{priceText(row.cacheRead)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <p data-wf="10-1-3" className="rounded-chip bg-inset px-3 py-2 text-aux text-text-secondary">
        {PRICE_NOTE_LEAD}
        <b className="font-semibold text-text">{PRICE_NOTE_STRONG}</b>
        {PRICE_NOTE_TAIL}
      </p>

      <div data-wf="10-1-4" className="flex flex-none justify-end gap-2">
        <Button variant="primary" autoFocus onClick={onClose}>
          {CLOSE_BUTTON_LABEL}
        </Button>
      </div>
    </Dialog>
  );
}
