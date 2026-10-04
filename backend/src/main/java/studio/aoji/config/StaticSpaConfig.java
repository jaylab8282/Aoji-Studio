package studio.aoji.config;

import java.io.IOException;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * 프론트 빌드 결과(classpath:/static/)를 정적 파일로 제공한다.
 * 알 수 없는 경로(SPA 라우트)는 {@code index.html}로 넘겨 React Router가 처리하게 한다.
 * {@code /api/**}, {@code /hooks/**} 경로는 컨트롤러가 먼저 처리하므로 이 리졸버까지
 * 오면 실제 정의된 API가 아니라는 뜻이라 그대로 404가 되게 둔다.
 */
@Configuration
public class StaticSpaConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new SpaFallbackResourceResolver());
    }

    private static final class SpaFallbackResourceResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource requested = location.createRelative(resourcePath);
            if (requested.exists() && requested.isReadable()) {
                return requested;
            }
            if (resourcePath.startsWith("api/") || resourcePath.startsWith("hooks/")) {
                return null;
            }
            return new ClassPathResource("/static/index.html");
        }
    }
}
