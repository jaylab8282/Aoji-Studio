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
        WorkflowConfigStore workflowConfigStore(ObjectMapper objectMapper) {
            return new WorkflowConfigStore(objectMapper);
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
