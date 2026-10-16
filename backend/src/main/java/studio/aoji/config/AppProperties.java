package studio.aoji.config;

import jakarta.annotation.PostConstruct;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.Environment;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

/**
 * 필수 환경 변수 검증. {@code AOJISTUDIO_HOST_PATH}, {@code AOJISTUDIO_PUBLIC_PORT}가
 * 없거나 빈 문자열이면 기동을 실패시킨다 (architecture.md §4.2, FR-014-E1, NFR-05).
 */
@Component
@ConfigurationProperties(prefix = "aojistudio")
public class AppProperties implements EnvironmentAware {

    private String hostPath = "";
    private String publicPort = "";
    private String mountPath = "/workspace";
    private String dataPath = "/data";
    private String helperUrl = "http://127.0.0.1:4181";
    private String allowedOrigins = "";
    private Environment environment;
    private String pollIntervalMs = "1000";
    private String hostOs = "";
    private String wslDistro = "";
    private String claudeHomeHost = "";
    private String claudeHomeMount = "/claude-home";

    private static final Pattern WSL_DISTRO = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");

    @PostConstruct
    void validate() {
        requireNonBlank("AOJISTUDIO_HOST_PATH", hostPath);
        requireNonBlank("AOJISTUDIO_PUBLIC_PORT", publicPort);
        String os = hostOs == null ? "" : hostOs.strip();
        if (!os.isEmpty() && !os.equals("macos") && !os.equals("wsl")) {
            throw new IllegalStateException("AOJISTUDIO_HOST_OS는 macos 또는 wsl이어야 합니다");
        }
        if (os.equals("wsl") && (wslDistro == null || !WSL_DISTRO.matcher(wslDistro).matches())) {
            throw new IllegalStateException(
                    "AOJISTUDIO_HOST_OS=wsl이면 AOJISTUDIO_WSL_DISTRO를 설정하세요 (영문·숫자·._- 1~64자)");
        }
    }

    /** 실행 환경: 빈 값 = {@code macos}, 그 밖에는 {@code macos}·{@code wsl}(검증은 기동 시, ADR-77 결정 1). */
    public String hostOs() {
        return hostOs == null || hostOs.isBlank() ? "macos" : hostOs.strip();
    }

    /** {@code wsl}일 때 배포판 이름, {@code macos}면 null(읽지 않는다). */
    public String wslDistro() {
        return "wsl".equals(hostOs()) ? wslDistro : null;
    }

    public String getHostOs() {
        return hostOs;
    }

    public void setHostOs(String hostOs) {
        this.hostOs = hostOs == null ? "" : hostOs;
    }

    public String getWslDistro() {
        return wslDistro;
    }

    public void setWslDistro(String wslDistro) {
        this.wslDistro = wslDistro == null ? "" : wslDistro;
    }

    /**
     * 전역 Claude 설정 홈의 호스트 경로({@code AOJISTUDIO_CLAUDE_HOME_HOST}, ADR-79 결정 3). 빈 값 = 연결 안 함.
     * 끝의 {@code /}는 제거한다(플러그인 {@code installPath}의 호스트 → 컨테이너 경로 변환에 쓴다).
     */
    public String getClaudeHomeHost() {
        return claudeHomeHost;
    }

    public void setClaudeHomeHost(String claudeHomeHost) {
        String value = claudeHomeHost == null ? "" : claudeHomeHost.strip();
        while (value.length() > 1 && value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        this.claudeHomeHost = value;
    }

    /** 전역 Claude 설정의 컨테이너 마운트 경로({@code AOJISTUDIO_CLAUDE_HOME_MOUNT}, 기본 {@code /claude-home}). */
    public String getClaudeHomeMount() {
        return claudeHomeMount;
    }

    public void setClaudeHomeMount(String claudeHomeMount) {
        this.claudeHomeMount = orDefault(claudeHomeMount, this.claudeHomeMount);
    }

    /** 선택 값의 빈 문자열은 설정 안 됨으로 본다(ADR-47) - 기본값을 유지한다. */
    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static void requireNonBlank(String envName, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "필수 환경 변수가 없습니다: " + envName + " · 값을 지정한 뒤 다시 기동하세요");
        }
    }

    public String getHostPath() {
        return hostPath;
    }

    public void setHostPath(String hostPath) {
        this.hostPath = hostPath;
    }

    /**
     * 확정 진입 주소 (api-spec {@code Config.publicOrigin} = {@code http://127.0.0.1:<public-port>}).
     * {@code SnapshotAssembler}의 {@code Config}와 {@code OriginFilter}의 403 {@code FORBIDDEN_ORIGIN}
     * 안내 문구가 같은 값을 쓰도록 한 곳에서 계산한다(architecture.md §5, ADR-41).
     * 게터 이름({@code getPublicOrigin})을 쓰지 않는 이유: 파생 값이므로
     * {@code aojistudio.public-origin} 설정으로 오해하지 않게 한다.
     */
    public String publicOrigin() {
        return "http://127.0.0.1:" + publicPort;
    }

    public String getPublicPort() {
        return publicPort;
    }

    public void setPublicPort(String publicPort) {
        this.publicPort = publicPort;
    }

    public String getMountPath() {
        return mountPath;
    }

    public void setMountPath(String mountPath) {
        this.mountPath = orDefault(mountPath, this.mountPath);
    }

    public String getDataPath() {
        return dataPath;
    }

    public void setDataPath(String dataPath) {
        this.dataPath = orDefault(dataPath, this.dataPath);
    }

    public String getHelperUrl() {
        return helperUrl;
    }

    public void setHelperUrl(String helperUrl) {
        this.helperUrl = orDefault(helperUrl, this.helperUrl);
    }

    /**
     * 빈 문자열은 설정 안 됨이다(ADR-47). 환경 변수가 빈 값이면 우선순위가 낮은 소스(dev 프로필 yaml의 5173 등)의
     * 첫 비어 있지 않은 값을 쓰고, 없으면 빈 값을 그대로 둔다({@code OriginFilter}가 공개 포트로 기본값을 계산).
     */
    public String getAllowedOrigins() {
        if (allowedOrigins != null && !allowedOrigins.isBlank()) {
            return allowedOrigins;
        }
        if (environment instanceof ConfigurableEnvironment configurable) {
            for (PropertySource<?> source : configurable.getPropertySources()) {
                Object value = source.getProperty("aojistudio.allowed-origins");
                if (value != null && !value.toString().isBlank()) {
                    return value.toString();
                }
            }
        }
        return allowedOrigins == null ? "" : allowedOrigins;
    }

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    public void setAllowedOrigins(String allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    /** 폴더 폴링 간격(ms). 빈 문자열은 설정 안 됨으로 본다 - 기본 1000. */
    public String getPollIntervalMs() {
        return pollIntervalMs;
    }

    public void setPollIntervalMs(String pollIntervalMs) {
        this.pollIntervalMs = orDefault(pollIntervalMs, this.pollIntervalMs);
    }
}
