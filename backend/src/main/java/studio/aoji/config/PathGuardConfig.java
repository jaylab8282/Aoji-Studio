package studio.aoji.config;

import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import studio.aoji.files.PathGuard;

/**
 * {@link PathGuard} 공용 빈 (T-008 리뷰 제안 — 세 번째 사용처가 생기면 추출). 마운트 루트는 기동 후
 * 바뀌지 않으므로(FR-001-AC5) 하나만 만들어 {@code RegistryService}·{@code WorkflowController}·
 * {@code AgentController}가 재사용한다.
 */
@Configuration
public class PathGuardConfig {

    @Bean
    public PathGuard pathGuard(AppProperties appProperties) {
        return new PathGuard(Path.of(appProperties.getMountPath()));
    }
}
