package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.MountTestSupport;
import tools.jackson.databind.JsonNode;

/**
 * 실제 서블릿 multipart 한도(10MB, FR-021-AC2). MockMvc는 한도를 적용하지 않으므로 전체 컨텍스트를 띄워
 * HTTP로 10MB + 1바이트 파일을 올린다.
 */
class SkillImportUploadLimitTest {

    @TempDir
    Path mountRoot;

    @TempDir
    Path dataDir;

    @Test
    @DisplayName("[FR-021-AC2] 실제 HTTP multipart로 10MB 초과 파일 → 400 IMPORT_REJECTED TOO_LARGE, /data·마운트에 남은 것 0")
    void servletLimitRejectsOversizeUpload() throws Exception {
        FixtureFiles.copyInto("project-skills", mountRoot);
        try (ConfigurableApplicationContext ctx = MountTestSupport.start(mountRoot, dataDir)) {
            String boundary = "----aojiBoundary7f3a";
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"big.zip\"\r\n"
                            + "Content-Type: application/zip\r\n\r\n")
                    .getBytes(StandardCharsets.UTF_8));
            body.write(new byte[10 * 1024 * 1024 + 1]);
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            HttpRequest request = HttpRequest.newBuilder(URI.create(
                            "http://127.0.0.1:" + MountTestSupport.port(ctx) + "/api/skills/import/preview"))
                    .header("Origin", MountTestSupport.ORIGIN)
                    .header("X-AojiStudio-Browser-Token", MountTestSupport.browserToken(ctx))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                    .build();

            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).isEqualTo(400);
            JsonNode json = MountTestSupport.MAPPER.readTree(response.body());
            assertThat(json.get("code").asString()).isEqualTo("IMPORT_REJECTED");
            assertThat(json.get("details").get("reason").asString()).isEqualTo("TOO_LARGE");
            assertThat(json.get("message").asString()).isEqualTo("zip이 10MB를 넘습니다");
            Path importRoot = dataDir.resolve("skill-import");
            if (Files.exists(importRoot)) {
                try (Stream<Path> s = Files.list(importRoot)) {
                    assertThat(s.toList()).isEmpty();
                }
            }
            try (Stream<Path> s = Files.list(mountRoot.resolve(".claude").resolve("skills"))) {
                assertThat(s.map(p -> p.getFileName().toString()).filter(n -> n.startsWith("."))).isEmpty();
            }
        }
    }
}
