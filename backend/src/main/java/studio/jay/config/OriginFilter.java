package studio.jay.config;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import studio.jay.api.ApiError;

/**
 * Origin 규칙 (architecture.md §5). {@code /api/**}에 적용한다.
 * {@code Origin} 헤더가 있으면 허용 목록에 있어야 하고, 없으면 {@code Sec-Fetch-Site}가
 * {@code same-origin}이어야 한다. 둘 다 없으면(curl 등) 거부한다.
 * 다른 Origin·브라우저 밖 클라이언트가 API·SSE를 쓸 수 없게 막는다(DoD "다른 Origin 차단").
 */
public class OriginFilter implements Filter {

    /**
     * 403 {@code FORBIDDEN_ORIGIN} 안내 문구 (architecture.md §5 "403 FORBIDDEN_ORIGIN 응답 문구", ADR-41,
     * conventions.md §4 MUST). {@code %s} 자리에 서버가 {@code Config.publicOrigin} 값을 치환해
     * 완성 문장으로 보낸다. 프론트는 이 {@code message}를 가공 없이 그대로 표시한다.
     */
    private static final String FORBIDDEN_ORIGIN_MESSAGE_FORMAT = "허용되지 않은 출처입니다 · %s 주소로 다시 접속하세요";

    private final Set<String> allowedOrigins;
    private final String forbiddenOriginMessage;
    private final ObjectMapper objectMapper;

    public OriginFilter(AppProperties appProperties, ObjectMapper objectMapper) {
        this.allowedOrigins = resolveAllowedOrigins(appProperties);
        this.forbiddenOriginMessage = FORBIDDEN_ORIGIN_MESSAGE_FORMAT.formatted(appProperties.publicOrigin());
        this.objectMapper = objectMapper;
    }

    /**
     * 허용 Origin이 명시되지 않으면 {@code http://127.0.0.1:<public-port>} 하나를 기본값으로 쓴다
     * (architecture.md §4.2 기본값 표). dev 프로필은 {@code application-dev.yaml}에서 이 값 자체를
     * {@code http://127.0.0.1:5173}으로 대체한다.
     */
    private static Set<String> resolveAllowedOrigins(AppProperties appProperties) {
        String raw = appProperties.getAllowedOrigins();
        if (raw != null && !raw.isBlank()) {
            return parseOrigins(raw);
        }
        String publicPort = appProperties.getPublicPort();
        if (publicPort == null || publicPort.isBlank()) {
            return Set.of();
        }
        return Set.of("http://127.0.0.1:" + publicPort);
    }

    private static Set<String> parseOrigins(String raw) {
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        String origin = request.getHeader("Origin");
        boolean allowed;
        if (origin != null && !origin.isBlank()) {
            allowed = allowedOrigins.contains(origin);
        } else {
            allowed = "same-origin".equals(request.getHeader("Sec-Fetch-Site"));
        }

        if (!allowed) {
            ApiError.writeJson(
                    response,
                    HttpServletResponse.SC_FORBIDDEN,
                    new ApiError("FORBIDDEN_ORIGIN", forbiddenOriginMessage),
                    objectMapper);
            return;
        }
        chain.doFilter(servletRequest, servletResponse);
    }
}
