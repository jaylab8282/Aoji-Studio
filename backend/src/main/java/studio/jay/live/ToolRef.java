package studio.jay.live;

/**
 * api-spec {@code ToolRef}. 마지막 {@code PreToolUse}의 도구 이름과 마스킹된 대상 요약
 * (FR-007-AC5). {@code target}은 대상이 없으면 {@code "-"}다.
 */
public record ToolRef(String name, String target) {
}
