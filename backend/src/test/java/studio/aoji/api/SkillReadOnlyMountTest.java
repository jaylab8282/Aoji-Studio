package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.registry.RegistryService;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.SkillApiClient;
import tools.jackson.databind.ObjectMapper;

/** 읽기 전용 마운트에서 PUT·DELETE도 403 {@code READ_ONLY} (T-R4-09 리뷰 D-164, FR-020-E2·FR-022). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillReadOnlyMountTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    SkillApiClient api;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-skills", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    @BeforeEach
    void setUp() {
        api = new SkillApiClient(mockMvc, objectMapper);
    }

    @Test
    @DisplayName("[FR-020-E2][FR-022-E1][D-164] 읽기 전용 마운트 → PUT·DELETE 403 READ_ONLY, 스킬 폴더·SKILL.md 바이트 불변, 휴지통 없음")
    void putAndDeleteAreRejectedOnReadOnlyMount() throws Exception {
        Path skill = mountRoot.resolve(".claude").resolve("skills").resolve("design-review");
        byte[] before = Files.readAllBytes(skill.resolve("SKILL.md"));
        String revision = api.revisionOf("design-review");
        Map<String, Object> body = Map.of("description", "바꾸기", "userOnly", false, "body", "b", "expectedRevision", revision);
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();
        try {
            MvcResult put = api.update("design-review", body);
            assertThat(put.getResponse().getStatus()).isEqualTo(403);
            assertThat(api.json(put).get("code").asString()).isEqualTo("READ_ONLY");

            MvcResult delete = api.remove("design-review");
            assertThat(delete.getResponse().getStatus()).isEqualTo(403);
            assertThat(api.json(delete).get("code").asString()).isEqualTo("READ_ONLY");
        } finally {
            Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
            registryService.rescanNow();
        }
        assertThat(Files.readAllBytes(skill.resolve("SKILL.md"))).isEqualTo(before);
        assertThat(Files.exists(mountRoot.resolve(".aojistudio").resolve("trash"))
                        && Files.list(mountRoot.resolve(".aojistudio").resolve("trash")).findAny().isPresent())
                .isFalse();
    }
}
