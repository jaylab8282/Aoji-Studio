package studio.jay.registry;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import studio.jay.files.PathGuard;

/**
 * `.claude/agents/`, `.claude/skills/`, 마운트 쓰기 가능 여부를 읽는다
 * (architecture.md §3.1, FR-001-AC1·AC2·E1·E2·E3).
 */
@Component
public class ProjectFolderScanner {

    private static final String AGENT_FILE_SUFFIX = ".md";
    private static final String SKILL_FILE_NAME = "SKILL.md";

    private final AgentDefinitionParser agentDefinitionParser;

    public ProjectFolderScanner(AgentDefinitionParser agentDefinitionParser) {
        this.agentDefinitionParser = agentDefinitionParser;
    }

    /**
     * {@code .claude/agents/} 바로 아래 {@code .md} 파일만 스캔한다(하위 폴더는 보지 않음).
     * 마운트 밖을 가리키는 심볼릭 링크는 읽지 않고 형식 오류로만 남긴다(NFR-07).
     * {@code pathGuard}는 호출자가 마운트 루트 기준으로 한 번만 만들어 재사용한다.
     */
    public AgentsScanResult scanAgents(Path mountRoot, PathGuard pathGuard) {
        Path agentsDir = mountRoot.resolve(".claude").resolve("agents");
        if (!Files.isDirectory(agentsDir)) {
            return AgentsScanResult.whenAgentsDirMissing();
        }

        List<ParsedAgentFile> parsedFiles = new ArrayList<>();
        for (Path entry : listDirectChildren(agentsDir)) {
            String fileName = entry.getFileName().toString();
            String relativeFilePath = ".claude/agents/" + fileName;

            if (pathGuard.isSymlinkEscapingMount(entry)) {
                parsedFiles.add(ParsedAgentFile.error(relativeFilePath, fileName, "마운트 밖 링크"));
                continue;
            }
            if (Files.isDirectory(entry) || !fileName.endsWith(AGENT_FILE_SUFFIX)) {
                continue;
            }
            parsedFiles.add(agentDefinitionParser.parse(entry, relativeFilePath, fileName));
        }

        List<ParsedAgentFile> resolved = AgentDefinitionParser.resolveDuplicates(parsedFiles);

        List<ParsedAgentFile> validAgents = new ArrayList<>();
        List<FormatError> formatErrors = new ArrayList<>();
        for (ParsedAgentFile parsed : resolved) {
            if (parsed.isValid()) {
                validAgents.add(parsed);
            } else {
                // api-spec FormatError.file: agent kind는 파일명만("<파일명>.md"), 상대 경로가 아니다.
                formatErrors.add(new FormatError(FormatError.Kind.AGENT, parsed.fileName(), parsed.formatErrorMessage()));
            }
        }

        return new AgentsScanResult(false, validAgents.size(), validAgents, formatErrors);
    }

    /**
     * {@code .claude/skills/} 바로 아래 폴더 중 {@code SKILL.md}를 가진 폴더 수(FR-001-AC2).
     * 폴더가 없으면 0(FR-001-E3, 에러 아님).
     */
    public int scanSkills(Path mountRoot) {
        Path skillsDir = mountRoot.resolve(".claude").resolve("skills");
        if (!Files.isDirectory(skillsDir)) {
            return 0;
        }
        int count = 0;
        for (Path entry : listDirectChildren(skillsDir)) {
            if (Files.isDirectory(entry) && Files.isRegularFile(entry.resolve(SKILL_FILE_NAME))) {
                count++;
            }
        }
        return count;
    }

    /**
     * 마운트 루트에 임시 파일을 만들어 보고 지워서 쓰기 가능 여부를 판정한다(FR-001-E2).
     */
    public boolean checkWritable(Path mountRoot) {
        try {
            Path probe = Files.createTempFile(mountRoot, ".jaystudio-write-probe-", ".tmp");
            Files.delete(probe);
            return true;
        } catch (IOException | UnsupportedOperationException | SecurityException e) {
            return false;
        }
    }

    private static List<Path> listDirectChildren(Path directory) {
        List<Path> children = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path entry : stream) {
                children.add(entry);
            }
        } catch (IOException e) {
            return List.of();
        }
        children.sort(java.util.Comparator.comparing(p -> p.getFileName().toString()));
        return children;
    }
}
