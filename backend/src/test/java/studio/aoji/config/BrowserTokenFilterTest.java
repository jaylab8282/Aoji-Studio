package studio.aoji.config;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 브라우저 토큰 검사 (architecture.md §5): 변경 메서드(POST/PUT/DELETE/PATCH)와
 * {@code GET /api/stream} 쿼리 토큰만 검사하고, 그 밖의 GET은 통과시킨다.
 * {@code /api/**}에 실제로 등록되는 변경 엔드포인트(워크플로우·에이전트 API)는 이후 태스크(T-008~)에서
 * 추가되므로, 이 필터의 동작은 서블릿 객체를 직접 넣어 단위로 검증한다.
 */
class BrowserTokenFilterTest {

    private BrowserTokenFilter filter;

    @BeforeEach
    void setUp() {
        filter = new BrowserTokenFilter(new ObjectMapper());
    }

    @Test
    @DisplayName("변경 메서드(POST) + 토큰 없음 → 403 UNAUTHORIZED_TOKEN, 다음 필터 호출 안 됨")
    void mutatingMethodWithoutTokenIsRejected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/workflows");
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("UNAUTHORIZED_TOKEN");
        assertThat(chain.invoked).isFalse();
    }

    @Test
    @DisplayName("변경 메서드(POST) + 올바른 토큰 → 통과")
    void mutatingMethodWithValidTokenPasses() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/workflows");
        request.addHeader("X-JayStudio-Browser-Token", filter.token());
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.invoked).isTrue();
    }

    @Test
    @DisplayName("변경 메서드(POST) + 틀린 토큰 → 403")
    void mutatingMethodWithWrongTokenIsRejected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/workflows");
        request.addHeader("X-JayStudio-Browser-Token", "0".repeat(64));
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(chain.invoked).isFalse();
    }

    @Test
    @DisplayName("GET /api/stream + 쿼리 토큰 없음 → 403")
    void streamWithoutQueryTokenIsRejected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/stream");
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(chain.invoked).isFalse();
    }

    @Test
    @DisplayName("GET /api/stream + 올바른 쿼리 토큰 → 통과")
    void streamWithValidQueryTokenPasses() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/stream");
        request.setParameter("token", filter.token());
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.invoked).isTrue();
    }

    @Test
    @DisplayName("일반 GET(토큰 없음) → 통과(변경 메서드·stream이 아니므로 이 필터는 검사하지 않음)")
    void plainGetWithoutTokenPasses() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/state");
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.invoked).isTrue();
    }

    private static final class RecordingFilterChain implements FilterChain {
        boolean invoked = false;

        @Override
        public void doFilter(jakarta.servlet.ServletRequest request, jakarta.servlet.ServletResponse response) {
            invoked = true;
        }
    }
}
