package studio.aoji.config;

import tools.jackson.databind.ObjectMapper;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@link OriginFilter}·{@link BrowserTokenFilter}를 {@code /api/*}에만 등록한다
 * (architecture.md §5). {@code /hooks/**}·정적 파일은 이 필터를 거치지 않는다.
 *
 * <p>필터를 일반 {@code Filter} 빈으로 등록하지 않고 여기서만 {@link FilterRegistrationBean}으로
 * 등록하는 이유: Spring Boot는 컨텍스트의 모든 {@code Filter} 빈을 기본 {@code /*}로 자동
 * 등록하므로, {@code @Component} 필터를 두면 URL 패턴을 좁힐 수 없다.
 */
@Configuration
public class SecurityFilterConfig {

    @Bean
    public OriginFilter originFilter(AppProperties appProperties, ObjectMapper objectMapper) {
        return new OriginFilter(appProperties, objectMapper);
    }

    @Bean
    public BrowserTokenFilter browserTokenFilter(ObjectMapper objectMapper) {
        return new BrowserTokenFilter(objectMapper);
    }

    @Bean
    public FilterRegistrationBean<OriginFilter> originFilterRegistration(OriginFilter originFilter) {
        FilterRegistrationBean<OriginFilter> registration = new FilterRegistrationBean<>(originFilter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(1);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<BrowserTokenFilter> browserTokenFilterRegistration(
            BrowserTokenFilter browserTokenFilter) {
        FilterRegistrationBean<BrowserTokenFilter> registration = new FilterRegistrationBean<>(browserTokenFilter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(2);
        return registration;
    }
}
