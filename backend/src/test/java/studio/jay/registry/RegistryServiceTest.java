package studio.jay.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import studio.jay.config.AppProperties;
import tools.jackson.databind.ObjectMapper;

/**
 * 스캔 결과 병합: 에이전트 정의 + 구성 파일 소속 + hook 설정 (architecture.md §3.2, FR-006-AC11).
 */
class RegistryServiceTest {

    @TempDir
    Path mountRoot;

    @BeforeEach
    void createAgentsDir() throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.createDirectories(mountRoot.resolve(".jaystudio").resolve("teams"));
    }

    private void writeAgent(String fileName, String name) throws IOException {
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve(fileName),
                "---\nname: " + name + "\ndescription: 설명\n---\n본문\n",
                StandardCharsets.UTF_8);
    }

    private void writeTeam(String fileName, String json) throws IOException {
        Files.writeString(mountRoot.resolve(".jaystudio").resolve("teams").resolve(fileName), json, StandardCharsets.UTF_8);
    }

    private ApplicationContextRunner contextRunner() {
        return new ApplicationContextRunner()
                .withUserConfiguration(TestConfig.class)
                .withPropertyValues(
                        "jaystudio.host-path=/Users/jaybee/Desktop/JayStudio",
                        "jaystudio.public-port=4180",
                        "jaystudio.mount-path=" + mountRoot);
    }

    @Test
    @DisplayName("[FR-006-AC11] 두 구성 파일에 같은 name → duplicateWorkflows 2개(오름차순), workflow = 첫 이름, agentCount 1")
    void agentInTwoWorkflowsGetsDuplicateWorkflowsAndFirstAssignment() throws IOException {
        writeAgent("shared.md", "shared-agent");
        writeTeam(
                "team-b.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "team-b",
                  "description": "",
                  "lead": null,
                  "members": ["shared-agent"],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);
        writeTeam(
                "team-a.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "team-a",
                  "description": "",
                  "lead": "shared-agent",
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        contextRunner().run(context -> {
            RegistryService registryService = context.getBean(RegistryService.class);
            RegistrySnapshot snapshot = registryService.rescanNow();

            assertThat(snapshot.agentCount()).isEqualTo(1);
            assertThat(snapshot.agents()).hasSize(1);
            AgentDef agentDef = snapshot.agents().get(0);
            assertThat(agentDef.name()).isEqualTo("shared-agent");
            assertThat(agentDef.duplicateWorkflows()).containsExactly("team-a", "team-b");
            assertThat(agentDef.workflow()).isEqualTo("team-a");
            assertThat(agentDef.role()).isEqualTo(Role.LEAD);
        });
    }

    @Test
    @DisplayName("정상 구성 파일 하나 → 소속 워크플로우 반영, duplicateWorkflows 빈 배열")
    void singleWorkflowMembershipIsAssignedWithoutDuplicates() throws IOException {
        writeAgent("lead.md", "team-lead");
        writeAgent("member.md", "team-member");
        writeTeam(
                "solo-team.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "solo-team",
                  "description": "",
                  "lead": "team-lead",
                  "members": ["team-member"],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        contextRunner().run(context -> {
            RegistryService registryService = context.getBean(RegistryService.class);
            RegistrySnapshot snapshot = registryService.rescanNow();

            assertThat(snapshot.workflows()).hasSize(1);
            assertThat(snapshot.agents()).hasSize(2);

            AgentDef lead = snapshot.agents().stream()
                    .filter(a -> a.name().equals("team-lead"))
                    .findFirst()
                    .orElseThrow();
            assertThat(lead.workflow()).isEqualTo("solo-team");
            assertThat(lead.role()).isEqualTo(Role.LEAD);
            assertThat(lead.duplicateWorkflows()).isEmpty();

            AgentDef member = snapshot.agents().stream()
                    .filter(a -> a.name().equals("team-member"))
                    .findFirst()
                    .orElseThrow();
            assertThat(member.workflow()).isEqualTo("solo-team");
            assertThat(member.role()).isEqualTo(Role.MEMBER);
        });
    }

    @Test
    @DisplayName("워크플로우 밖 에이전트 → workflow null, role null")
    void agentOutsideAnyWorkflowHasNullWorkflowAndRole() throws IOException {
        writeAgent("lonely.md", "lonely-agent");

        contextRunner().run(context -> {
            RegistryService registryService = context.getBean(RegistryService.class);
            RegistrySnapshot snapshot = registryService.rescanNow();

            assertThat(snapshot.agents()).hasSize(1);
            AgentDef agentDef = snapshot.agents().get(0);
            assertThat(agentDef.workflow()).isNull();
            assertThat(agentDef.role()).isNull();
            assertThat(agentDef.duplicateWorkflows()).isEmpty();
        });
    }

    @Test
    @DisplayName("[FR-001-AC4] 동시 rescanNow() 호출 → revision 항상 단조 증가, 마지막 스냅샷이 최신")
    void concurrentRescansNeverRegressRevision() throws Exception {
        writeAgent("concurrent.md", "concurrent-agent");

        contextRunner().run(context -> {
            RegistryService registryService = context.getBean(RegistryService.class);
            int threadCount = 8;
            int iterationsPerThread = 25;

            java.util.concurrent.ExecutorService executor =
                    java.util.concurrent.Executors.newFixedThreadPool(threadCount);
            java.util.List<Integer> revisions = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
            // 각 호출이 반환한 revision을 받은 "직후" current().revision()이 그보다 뒤로 가면 안 된다
            // (review NEEDS_FIX round 1: 먼저 시작해 나중에 끝난 호출이 최신 스냅샷을 오래된 것으로
            // 덮어쓰는 경합 방지). rescanLock으로 빌드+채번+set이 하나의 임계 구역이므로 항상 성립해야 한다.
            java.util.List<java.util.concurrent.Callable<Void>> tasks = new java.util.ArrayList<>();
            for (int t = 0; t < threadCount; t++) {
                tasks.add(() -> {
                    for (int i = 0; i < iterationsPerThread; i++) {
                        RegistrySnapshot snapshot = registryService.rescanNow();
                        revisions.add(snapshot.revision());
                        assertThat(registryService.current().revision())
                                .as("rescanNow()가 revision %d를 반환한 직후 current()는 그보다 뒤처지면 안 된다",
                                        snapshot.revision())
                                .isGreaterThanOrEqualTo(snapshot.revision());
                    }
                    return null;
                });
            }

            java.util.List<java.util.concurrent.Future<Void>> futures = executor.invokeAll(tasks);
            for (java.util.concurrent.Future<Void> future : futures) {
                future.get(30, java.util.concurrent.TimeUnit.SECONDS);
            }
            executor.shutdown();

            // revisionCounter는 AtomicInteger로 그 자체가 중복을 만들지 않지만, 락으로 빌드+set을 하나로
            // 묶었으므로 반환된 revision 집합에 중복이 없고 최댓값 = 최종 current() revision이어야 한다.
            java.util.Set<Integer> uniqueRevisions = new java.util.HashSet<>(revisions);
            assertThat(uniqueRevisions).hasSize(revisions.size());
            int maxRevision = java.util.Collections.max(revisions);
            assertThat(registryService.current().revision())
                    .as("마지막으로 반영된 스냅샷이 항상 최신(가장 큰 revision)이어야 한다")
                    .isEqualTo(maxRevision);
        });
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        AgentDefinitionParser agentDefinitionParser() {
            return new AgentDefinitionParser();
        }

        @Bean
        ProjectFolderScanner projectFolderScanner(AgentDefinitionParser parser) {
            return new ProjectFolderScanner(parser);
        }

        @Bean
        studio.jay.files.AtomicFileWriter atomicFileWriter() {
            return new studio.jay.files.AtomicFileWriter();
        }

        @Bean
        WorkflowConfigStore workflowConfigStore(
                ObjectMapper objectMapper, studio.jay.files.AtomicFileWriter atomicFileWriter) {
            return new WorkflowConfigStore(objectMapper, atomicFileWriter);
        }

        @Bean
        HookConfigDetector hookConfigDetector(ObjectMapper objectMapper) {
            return new HookConfigDetector(objectMapper);
        }

        @Bean
        RegistryService registryService(
                AppProperties appProperties,
                ProjectFolderScanner scanner,
                WorkflowConfigStore workflowConfigStore,
                HookConfigDetector hookConfigDetector) {
            return new RegistryService(appProperties, scanner, workflowConfigStore, hookConfigDetector);
        }
    }
}
