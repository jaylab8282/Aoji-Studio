package studio.aoji.api;

import java.time.OffsetDateTime;

/** api-spec {@code SkillDetail}. */
public record SkillDetail(
        String name,
        String description,
        boolean userOnly,
        String body,
        String filePath,
        String revision,
        OffsetDateTime modifiedAt,
        boolean imported) {}
