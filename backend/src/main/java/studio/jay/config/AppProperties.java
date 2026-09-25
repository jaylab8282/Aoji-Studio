package studio.jay.config;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 필수 환경 변수 검증. {@code JAYSTUDIO_HOST_PATH}, {@code JAYSTUDIO_PUBLIC_PORT}가
 * 없거나 빈 문자열이면 기동을 실패시킨다 (architecture.md §4.2, FR-014-E1, NFR-05).
 */
@Component
@ConfigurationProperties(prefix = "jaystudio")
public class AppProperties {

    private String hostPath = "";
    private String publicPort = "";
    private String mountPath = "/workspace";
    private String dataPath = "/data";
    private String helperUrl = "http://127.0.0.1:4181";
    private String allowedOrigins = "";

    @PostConstruct
    void validate() {
        requireNonBlank("JAYSTUDIO_HOST_PATH", hostPath);
        requireNonBlank("JAYSTUDIO_PUBLIC_PORT", publicPort);
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
     * {@code jaystudio.public-origin} 설정으로 오해하지 않게 한다.
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
        this.mountPath = mountPath;
    }

    public String getDataPath() {
        return dataPath;
    }

    public void setDataPath(String dataPath) {
        this.dataPath = dataPath;
    }

    public String getHelperUrl() {
        return helperUrl;
    }

    public void setHelperUrl(String helperUrl) {
        this.helperUrl = helperUrl;
    }

    public String getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(String allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }
}
