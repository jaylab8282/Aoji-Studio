package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class UsageBucketTest {

    @Test
    void bucketIsFloorOfUtcFifteenMinutes() {
        // [FR-019-AC4] 집계 구간 = UTC 15분 구간 시작
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T05:14:59Z"))).isEqualTo("2026-10-15T05:00:00Z");
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T05:15:00Z"))).isEqualTo("2026-10-15T05:15:00Z");
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T05:59:59.999Z"))).isEqualTo("2026-10-15T05:45:00Z");
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T00:00:00Z"))).isEqualTo("2026-10-15T00:00:00Z");
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T23:59:59Z"))).isEqualTo("2026-10-15T23:45:00Z");
    }

    @Test
    void sameInstantInAnotherOffsetFallsInTheSameUtcBucket() {
        // [FR-019-AC4] 서버 시각 오프셋(+09:00)과 무관하게 UTC 구간
        Instant instant = OffsetDateTime.parse("2026-10-15T14:20:00+09:00").toInstant();

        assertThat(UsageBucket.of(instant)).isEqualTo("2026-10-15T05:15:00Z");
    }

    @Test
    void bucketStringsSortChronologically() {
        // [FR-019-AC4] 문자열 범위 조회가 시간 범위 조회와 같다
        assertThat(UsageBucket.of(Instant.parse("2026-10-15T05:15:00Z")))
                .isLessThan(UsageBucket.of(Instant.parse("2026-10-15T05:30:00Z")))
                .isLessThan(UsageBucket.of(Instant.parse("2026-12-01T00:00:00Z")));
        assertThat(UsageBucket.parse("2026-10-15T05:15:00Z")).isEqualTo(Instant.parse("2026-10-15T05:15:00Z"));
    }
}
