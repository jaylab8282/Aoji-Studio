package studio.aoji.usage;

/**
 * 대화 기록 한 줄에서 앱이 쓰는 키만 담은 결과 (ADR-81 결정 4). 대화 본문·도구 입력·프롬프트는 이 객체에
 * 들어갈 수 없다 — 필드가 전부 식별자·시각·토큰 수다(FR-025-AC5, NFR-14).
 *
 * @param error JSON으로 읽을 수 없는 줄(FR-025-E2). 이 경우 나머지 필드는 비어 있다
 * @param sessionId 줄의 {@code sessionId}
 * @param timestamp 줄의 {@code timestamp}(원래 문자열)
 * @param cwd 줄의 {@code cwd}
 * @param entrypoint 줄의 {@code entrypoint}
 * @param sidechain {@code isSidechain == true}
 * @param agentSetting {@code --agent} 세션의 에이전트 이름 줄(별도 줄, ADR-81 결정 5). 키가 없으면 null
 * @param usage 토큰 줄({@code type == "assistant"}이고 {@code message.usage}가 있는 줄). 아니면 null
 */
public record TranscriptLine(
        boolean error,
        String sessionId,
        String timestamp,
        String cwd,
        String entrypoint,
        boolean sidechain,
        String agentSetting,
        Usage usage) {

    /** 읽을 수 없는 줄. */
    public static final TranscriptLine ERROR = new TranscriptLine(true, null, null, null, null, false, null, null);

    /** 토큰 줄의 메시지 키와 토큰 4값. */
    public record Usage(
            String messageId,
            String requestId,
            String model,
            long input,
            long output,
            long cacheCreation,
            long cacheRead) {

        /** 중복 판정 키 {@code message.id:requestId}. 둘 중 하나가 없으면 null(ADR-81 결정 3). */
        public String messageKey() {
            if (messageId == null || messageId.isEmpty() || requestId == null || requestId.isEmpty()) {
                return null;
            }
            return messageId + ":" + requestId;
        }

        /** {@code <synthetic>}이거나 네 토큰이 모두 0이면 세지 않는다(ADR-81 결정 4). */
        public boolean ignorable() {
            return "<synthetic>".equals(model) || (input == 0 && output == 0 && cacheCreation == 0 && cacheRead == 0);
        }

        /** 이 값이 {@code other}보다 크다: {@code output_tokens} 큰 쪽, 같으면 네 값 합이 큰 쪽(ADR-81 결정 3). */
        public boolean largerThan(long otherOutput, long otherSum) {
            if (output != otherOutput) {
                return output > otherOutput;
            }
            return input + output + cacheCreation + cacheRead > otherSum;
        }
    }

    /** 세션 정보를 줄 수 있는 줄이다(세션 id가 있다). */
    public boolean hasSession() {
        return sessionId != null && !sessionId.isEmpty();
    }
}
