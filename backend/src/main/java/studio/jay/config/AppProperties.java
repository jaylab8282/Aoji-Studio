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
