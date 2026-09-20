package studio.jay.config;

import java.util.Arrays;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * dev 프로필 전용 CORS 응답 헤더 (architecture.md §5 "dev 프로필 차이").
 * 운영 프로필은 이 설정이 활성화되지 않으므로 CORS 헤더를 내지 않는다.
 */
@Configuration
@Profile("dev")
public class DevCorsConfig implements WebMvcConfigurer {

    private final AppProperties appProperties;

    public DevCorsConfig(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] origins = Arrays.stream(appProperties.getAllowedOrigins().split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
        if (origins.length == 0) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(origins)
                .allowedHeaders("Content-Type", "X-JayStudio-Browser-Token")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
    }
}
