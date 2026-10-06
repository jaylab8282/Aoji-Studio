package studio.aoji.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import studio.aoji.AojiStudioApplication;

/** 마운트·데이터 폴더 통합 테스트 공용 도구: 파일 트리 해시, 전체 컨텍스트 기동, HTTP 호출. */
public final class MountTestSupport {

    public static final String PUBLIC_PORT = "4994";
    public static final String ORIGIN = "http://127.0.0.1:" + PUBLIC_PORT;
    public static final ObjectMapper MAPPER = new ObjectMapper();

    private MountTestSupport() {
    }

    /** 폴더 아래 모든 항목(링크는 링크 대상 문자열, 파일은 sha256, 디렉터리는 표식)의 상대 경로 → 지문. 링크를 따라가지 않는다. */
    public static Map<String, String> fingerprint(Path root) throws IOException {
        Map<String, String> result = new TreeMap<>();
        if (!Files.exists(root, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            return result;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : (Iterable<Path>) walk::iterator) {
                String rel = root.relativize(p).toString();
                if (rel.isEmpty()) {
                    continue;
                }
                if (Files.isSymbolicLink(p)) {
                    result.put(rel, "link:" + Files.readSymbolicLink(p));
                } else if (Files.isDirectory(p)) {
                    result.put(rel, "dir");
                } else {
                    try {
                        result.put(rel, "sha256:" + HexFormat.of().formatHex(
                                MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(p))));
                    } catch (java.security.NoSuchAlgorithmException e) {
                        throw new IllegalStateException(e);
                    }
                }
            }
        }
        return result;
    }

    public static void write(Path file, String content) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    public static String team(String name) {
        return "{\"schemaVersion\":1,\"name\":\"" + name + "\",\"description\":\"\",\"lead\":null,\"members\":[]}";
    }

    /** 전체 컨텍스트를 기동한다(server.port=0). 필수 설정은 마운트·데이터 경로만 바꿔 넣는다. */
    public static ConfigurableApplicationContext start(Path mountRoot, Path dataDir) {
        return new SpringApplicationBuilder(AojiStudioApplication.class)
                .run(
                        "--server.port=0",
                        "--spring.main.banner-mode=off",
                        "--aojistudio.host-path=/Users/someone/Desktop/AojiStudio",
                        "--aojistudio.public-port=" + PUBLIC_PORT,
                        "--aojistudio.mount-path=" + mountRoot,
                        "--aojistudio.data-path=" + dataDir,
                        "--spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    public static int port(ConfigurableApplicationContext ctx) {
        return ctx.getEnvironment().getProperty("local.server.port", Integer.class);
    }

    public static HttpResponse<String> get(ConfigurableApplicationContext ctx, String path, String... headers) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port(ctx) + path))
                .header("Origin", ORIGIN);
        for (int i = 0; i < headers.length; i += 2) {
            b.header(headers[i], headers[i + 1]);
        }
        return HttpClient.newHttpClient().send(b.GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    public static JsonNode getJson(ConfigurableApplicationContext ctx, String path) throws Exception {
        HttpResponse<String> response = get(ctx, path);
        if (response.statusCode() != 200) {
            throw new IllegalStateException(path + " → " + response.statusCode());
        }
        return MAPPER.readTree(response.body());
    }

    public static String browserToken(ConfigurableApplicationContext ctx) throws Exception {
        return getJson(ctx, "/api/auth/browser-token").get("token").asString();
    }

    public static HttpResponse<String> helperToken(ConfigurableApplicationContext ctx) throws Exception {
        return get(ctx, "/api/helper/token", "X-AojiStudio-Browser-Token", browserToken(ctx));
    }

    public static HttpResponse<String> postWorkflow(ConfigurableApplicationContext ctx, String name) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port(ctx) + "/api/workflows"))
                .header("Origin", ORIGIN)
                .header("X-AojiStudio-Browser-Token", browserToken(ctx))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"" + name + "\"}"))
                .build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    /** 읽기 전용 마운트 흉내: 폴더 아래 모든 디렉터리·파일의 쓰기 권한을 제거한다(링크는 건드리지 않는다). */
    public static void makeTreeReadOnly(Path root) throws IOException {
        setTreePermissions(root, "r-xr-xr-x", "r--r--r--");
    }

    public static void restoreTree(Path root) throws IOException {
        setTreePermissions(root, "rwxr-xr-x", "rw-r--r--");
    }

    private static void setTreePermissions(Path root, String dirPerms, String filePerms) throws IOException {
        List<Path> paths;
        try (Stream<Path> walk = Files.walk(root)) {
            paths = walk.filter(p -> !Files.isSymbolicLink(p)).toList();
        }
        // 파일·하위 폴더를 먼저 바꾸고 상위 폴더를 나중에 잠근다(복구 때는 반대로 상위부터 연다).
        boolean lock = dirPerms.startsWith("r-x");
        List<Path> ordered = new java.util.ArrayList<>(paths);
        if (lock) {
            java.util.Collections.reverse(ordered);
        }
        for (Path p : ordered) {
            Files.setPosixFilePermissions(p, java.nio.file.attribute.PosixFilePermissions.fromString(
                    Files.isDirectory(p) ? dirPerms : filePerms));
        }
    }
}
