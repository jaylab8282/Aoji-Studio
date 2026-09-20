package studio.jay.registry;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * api-spec {@code FormatError} (04-6 목록, FR-002-AC2·AC5·AC6).
 * {@code workflow}는 {@code kind == broken-ref}일 때만 채운다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FormatError(Kind kind, String file, String message, String workflow) {

    public FormatError(Kind kind, String file, String message) {
        this(kind, file, message, null);
    }

    public enum Kind {
        @JsonProperty("agent")
        AGENT,
        @JsonProperty("workflow")
        WORKFLOW,
        @JsonProperty("broken-ref")
        BROKEN_REF
    }
}
