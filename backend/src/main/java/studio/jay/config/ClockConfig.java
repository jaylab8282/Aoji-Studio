package studio.jay.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 휴지통 파일명 시각 접미사용 {@link Clock} 공용 빈 (architecture.md §4.1 TZ {@code Asia/Seoul},
 * §6.4, tasks.md T-011). 컨테이너 TZ 설정과 무관하게 접미사가 항상 서울 시각이 되도록 존을 고정한다.
 * 테스트는 이 빈을 {@code @MockitoBean}으로 교체해 같은 초 충돌을 결정적으로 재현한다({@link
 * studio.jay.files.TrashService}).
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }
}
