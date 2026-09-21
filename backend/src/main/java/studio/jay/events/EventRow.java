package studio.jay.events;

import java.time.OffsetDateTime;

/**
 * SQLite {@code events} 테이블 한 행 (architecture.md §6.5 schema.sql).
 * 워크플로우 열은 저장하지 않는다(ADR-09, 읽는 시점에 registry로 해석). {@code tool_input} 원문은
 * 어떤 필드에도 담지 않는다(FR-015-AC3) — {@code summary}는 이미 추출·마스킹된 값이다.
 *
 * @param id INSERT 전에는 의미 없음(0). {@link EventRepository#insert(EventRow)}가 채워 돌려준다
 * @param receivedAt 서버 수신 시각
 * @param summary 마스킹 후 200자 이하 (FR-015-AC2, FR-003-AC10)
 */
public record EventRow(
        long id,
        OffsetDateTime receivedAt,
        String hookEventName,
        String sessionId,
        String agentId,
        String agentType,
        String toolName,
        String notificationType,
        String cwd,
        String kind,
        String title,
        String summary) {
}
