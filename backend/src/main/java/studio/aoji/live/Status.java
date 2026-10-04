package studio.aoji.live;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * api-spec {@code Status} (`running` | `waiting` | `idle`, FR-004). 여러 세션이 겹칠 때 표시 상태를
 * 고르는 우선순위(FR-004-AC3, `권한·입력 대기` &gt; `작업 중` &gt; `대기`)는 {@link #priorityRank()}로 둔다.
 */
public enum Status {
    @JsonProperty("waiting")
    WAITING,
    @JsonProperty("running")
    RUNNING,
    @JsonProperty("idle")
    IDLE;

    /** 값이 클수록 우선순위가 높다(FR-004-AC3). */
    public int priorityRank() {
        return switch (this) {
            case WAITING -> 2;
            case RUNNING -> 1;
            case IDLE -> 0;
        };
    }
}
