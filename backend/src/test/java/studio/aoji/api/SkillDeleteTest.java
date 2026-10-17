package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.registry.RegistryService;
import studio.aoji.skills.SkillTrashService;
import studio.aoji.stream.SseHub;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.MountTestSupport;
import studio.aoji.support.SkillApiClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code DELETE /api/skills/{skill}} (T-R4-09, FR-022-AC2·AC3·AC4·AC5·E1·E2). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillDeleteTest {

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

    @MockitoBean
    Clock clock;

    @MockitoSpyBean
    SkillTrashService skillTrashService;

    @MockitoSpyBean
    SseHub sseHub;

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
        Mockito.reset(clock);
        Clock real = Clock.system(ZoneId.of("Asia/Seoul"));
        Mockito.when(clock.instant()).thenAnswer(inv -> real.instant());
        Mockito.when(clock.getZone()).thenReturn(real.getZone());
    }

    private Path skillFolder(String name) {
        return mountRoot.resolve(".claude").resolve("skills").resolve(name);
    }

    private void makeSkill(String name) throws IOException {
        Files.createDirectories(skillFolder(name).resolve("sub"));
        Files.writeString(skillFolder(name).resolve("SKILL.md"), "---\nname: " + name + "\ndescription: d\n---\nb\n");
        Files.writeString(skillFolder(name).resolve("sub").resolve("extra.txt"), "추가 파일 " + name);
    }

    private void freezeClock(String instant) {
        Mockito.when(clock.instant()).thenReturn(Instant.parse(instant));
        Mockito.when(clock.getZone()).thenReturn(ZoneId.of("Asia/Seoul"));
    }

    @Test
    @DisplayName("[FR-022-AC3] 폴더째 .aojistudio/trash/<name>.<시각>/로 이동, 안의 파일 보존, 원래 자리 없음")
    void movesWholeFolderToTrash() throws Exception {
        makeSkill("to-trash");
        freezeClock("2026-10-15T05:32:05Z");

        MvcResult result = api.remove("to-trash");

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String trashPath = api.json(result).get("trashPath").asString();
        assertThat(trashPath).isEqualTo(".aojistudio/trash/to-trash.20261015-143205/");
        assertThat(Files.exists(skillFolder("to-trash"))).isFalse();
        Path trashed = mountRoot.resolve(trashPath);
        assertThat(Files.readString(trashed.resolve("SKILL.md"))).contains("name: to-trash");
        assertThat(Files.readString(trashed.resolve("sub").resolve("extra.txt"))).isEqualTo("추가 파일 to-trash");
    }

    @Test
    @DisplayName("[FR-022-AC3] 같은 초 충돌은 -1, -2 접미, 덮어쓰지 않는다")
    void sameSecondCollisionGetsSuffix() throws Exception {
        freezeClock("2026-10-15T06:00:00Z");
        String[] paths = new String[3];
        for (int i = 0; i < 3; i++) {
            makeSkill("twice");
            Files.writeString(skillFolder("twice").resolve("sub").resolve("extra.txt"), "회차 " + i);
            paths[i] = api.json(api.remove("twice")).get("trashPath").asString();
        }

        assertThat(paths)
                .containsExactly(
                        ".aojistudio/trash/twice.20261015-150000/",
                        ".aojistudio/trash/twice.20261015-150000-1/",
                        ".aojistudio/trash/twice.20261015-150000-2/");
        for (int i = 0; i < 3; i++) {
            assertThat(Files.readString(mountRoot.resolve(paths[i]).resolve("sub").resolve("extra.txt")))
                    .isEqualTo("회차 " + i);
        }
    }

    @Test
    @DisplayName("[FR-022-AC2] 삭제해도 에이전트 정의 파일 바이트 불변 (agents 폴더 지문 동일)")
    void agentDefinitionsAreUntouched() throws Exception {
        makeSkill("agent-safe");
        Path agents = mountRoot.resolve(".claude").resolve("agents");
        Map<String, String> before = MountTestSupport.fingerprint(agents);
        assertThat(before).isNotEmpty();

        assertThat(api.remove("agent-safe").getResponse().getStatus()).isEqualTo(200);

        assertThat(MountTestSupport.fingerprint(agents)).isEqualTo(before);
    }

    @Test
    @DisplayName("[FR-022-AC4] 가져온 스킬(SOURCE.md)·형식 오류 스킬도 삭제된다")
    void importedAndFormatErrorSkillsCanBeDeleted() throws Exception {
        for (String name : new String[] {"imported-lint", "bad-yaml", "bad-utf8", "no-delimiter", "name-mismatch"}) {
            MvcResult result = api.remove(name);
            assertThat(result.getResponse().getStatus()).as(name).isEqualTo(200);
            assertThat(Files.exists(skillFolder(name))).as(name).isFalse();
            assertThat(Files.exists(mountRoot.resolve(api.json(result).get("trashPath").asString()).resolve("SKILL.md")))
                    .as(name)
                    .isTrue();
        }
    }

    @Test
    @DisplayName("[FR-022-AC5] 삭제 후 skillCount 1 감소, SSE registry 방송에 새 skillCount")
    void skillCountDropsAndRegistryIsBroadcast() throws Exception {
        makeSkill("count-me");
        registryService.rescanNow();
        int before = registryService.current().skillCount();
        Mockito.clearInvocations(sseHub);

        assertThat(api.remove("count-me").getResponse().getStatus()).isEqualTo(200);

        assertThat(registryService.current().skillCount()).isEqualTo(before - 1);
        assertThat(registryService.skillNames()).doesNotContain("count-me");
        verify(sseHub, atLeastOnce()).broadcast(argThat(s -> s != null && s.skillCount() == before - 1));
        JsonNode state =
                objectMapper.readTree(mockMvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/state")
                                        .header("Origin", SkillApiClient.ORIGIN))
                        .andReturn()
                        .getResponse()
                        .getContentAsString());
        assertThat(state.toString()).contains("\"skillCount\":" + (before - 1));
    }

    @Test
    @DisplayName("[FR-022-E1] 이동 실패 주입 → 500 IO_FAILED(ADR-91 문구), 폴더 그대로")
    void moveFailureKeepsFolder() throws Exception {
        makeSkill("stuck");
        doThrow(new IOException("주입된 실패")).when(skillTrashService).moveFolder(any(), any());

        MvcResult result = api.remove("stuck");

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");
        assertThat(body.get("message").asString())
                .isEqualTo("스킬 폴더를 휴지통으로 옮기지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더는 그대로입니다.");
        assertThat(Files.readString(skillFolder("stuck").resolve("SKILL.md"))).contains("name: stuck");
        assertThat(Files.readString(skillFolder("stuck").resolve("sub").resolve("extra.txt")))
                .isEqualTo("추가 파일 stuck");
        try (Stream<Path> trash = Files.list(mountRoot.resolve(".aojistudio").resolve("trash"))) {
            assertThat(trash.map(p -> p.getFileName().toString())).noneMatch(n -> n.startsWith("stuck."));
        }
    }

    @Test
    @DisplayName("[FR-022-E2] 없는 스킬·규칙 밖 이름 → 404 SKILL_NOT_FOUND '이미 없는 스킬입니다'")
    void missingSkillIsNotFound() throws Exception {
        for (String name : new String[] {"never-existed", "BAD_NAME"}) {
            MvcResult result = api.remove(name);
            assertThat(result.getResponse().getStatus()).as(name).isEqualTo(404);
            JsonNode body = api.json(result);
            assertThat(body.get("code").asString()).isEqualTo("SKILL_NOT_FOUND");
            assertThat(body.get("message").asString()).isEqualTo("이미 없는 스킬입니다");
        }
    }
}
