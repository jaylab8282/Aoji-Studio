package studio.jay.registry;

import com.fasterxml.jackson.annotation.JsonProperty;

/** api-spec {@code Role} (`lead` | `member`). */
public enum Role {
    @JsonProperty("lead")
    LEAD,
    @JsonProperty("member")
    MEMBER
}
