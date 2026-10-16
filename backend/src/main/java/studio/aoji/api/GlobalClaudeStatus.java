package studio.aoji.api;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * api-spec {@code GlobalClaudeStatus} — {@code Settings.globalClaude} (07 전역 Claude 설정 연결 카드, ADR-79).
 * 항목은 항상 4개이고 순서는 {@code claudeJson} → {@code settings} → {@code plugins} → {@code projects}다.
 *
 * @param readAt 전역 설정 내용을 마지막으로 읽은 시각(FR-023-AC5). 연결된 항목이 없으면 null
 */
public record GlobalClaudeStatus(List<Item> items, OffsetDateTime readAt) {

    public GlobalClaudeStatus {
        items = List.copyOf(items);
    }

    /** @param key {@code claudeJson} | {@code settings} | {@code plugins} | {@code projects} */
    public record Item(String key, boolean connected) {}
}
