package studio.jay.registry;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import studio.jay.files.PathGuard;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code .jaystudio/teams/*.json} 구성 파일 읽기·스키마 검증 (architecture.md §6.2, ADR-06,
 * FR-002-AC5·AC6, FR-006-AC11). 쓰기는 이 클래스가 아니라 T-008~T-011의 변경 API가 맡는다.
 */
@Component
public class WorkflowConfigStore {

    private static final int SCHEMA_VERSION = 1;
    private static final String FILE_SUFFIX = ".json";

    private final ObjectMapper objectMapper;

    public WorkflowConfigStore(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * {@code teamsDir} 아래 모든 구성 파일을 읽는다. {@code validAgentNames}는 정상 정의 파일의
     * name 집합으로, 깨진 참조 판정(FR-002-AC5)에 쓴다. {@code pathGuard}는 호출자가 마운트 루트
     * 기준으로 한 번만 만들어 재사용한다(NFR-07: 마운트 밖을 가리키는 심볼릭 링크는 읽지 않는다).
     */
    public WorkflowScanResult readAll(Path teamsDir, Set<String> validAgentNames, PathGuard pathGuard) {
        if (!Files.isDirectory(teamsDir)) {
            return new WorkflowScanResult(List.of(), List.of());
        }

        List<Workflow> workflows = new ArrayList<>();
        List<FormatError> formatErrors = new ArrayList<>();

        for (Path file : listJsonFiles(teamsDir)) {
            String fileName = file.getFileName().toString();
            String stem = fileName.substring(0, fileName.length() - FILE_SUFFIX.length());

            if (pathGuard.isSymlinkEscapingMount(file)) {
                // 마운트 밖 링크는 읽지 않고 형식 오류로만 남긴다(D-014, NFR-07 일반 원칙).
                formatErrors.add(schemaError(fileName));
                continue;
            }

            readOne(file, fileName, stem, validAgentNames, workflows, formatErrors);
        }

        return new WorkflowScanResult(workflows, formatErrors);
    }

    private void readOne(
            Path file,
            String fileName,
            String stem,
            Set<String> validAgentNames,
            List<Workflow> workflows,
            List<FormatError> formatErrors) {
        JsonNode root;
        try {
            root = objectMapper.readTree(Files.readString(file, java.nio.charset.StandardCharsets.UTF_8));
        } catch (JacksonException | IOException e) {
            formatErrors.add(schemaError(fileName));
            return;
        }

        if (root == null || !root.isObject()) {
            formatErrors.add(schemaError(fileName));
            return;
        }

        JsonNode schemaVersionNode = root.get("schemaVersion");
        if (schemaVersionNode == null || !schemaVersionNode.isIntegralNumber()
                || schemaVersionNode.asInt() != SCHEMA_VERSION) {
            formatErrors.add(schemaError(fileName));
            return;
        }

        JsonNode nameNode = root.get("name");
        if (nameNode == null || !nameNode.isString() || !stem.equals(nameNode.asString())) {
            formatErrors.add(schemaError(fileName));
            return;
        }

        JsonNode descriptionNode = root.get("description");
        String description;
        if (descriptionNode == null || descriptionNode.isNull()) {
            description = "";
        } else if (descriptionNode.isString()) {
            description = descriptionNode.asString();
        } else {
            // description은 문자열이어야 한다(architecture.md §6.2). 숫자·객체 등은 형식 위반.
            formatErrors.add(schemaError(fileName));
            return;
        }

        JsonNode leadNode = root.get("lead");
        String leadRaw = leadNode != null && leadNode.isString() ? leadNode.asString() : null;
        if (leadNode != null && !leadNode.isNull() && !leadNode.isString()) {
            formatErrors.add(schemaError(fileName));
            return;
        }

        JsonNode membersNode = root.get("members");
        List<String> membersRaw = new ArrayList<>();
        if (membersNode != null && !membersNode.isNull()) {
            if (!membersNode.isArray()) {
                formatErrors.add(schemaError(fileName));
                return;
            }
            for (JsonNode item : membersNode) {
                if (!item.isString()) {
                    formatErrors.add(schemaError(fileName));
                    return;
                }
                membersRaw.add(item.asString());
            }
        }

        if (leadRaw != null && membersRaw.contains(leadRaw)) {
            // lead가 members에도 있음 → 구성 파일 형식 오류(ADR-06).
            formatErrors.add(schemaError(fileName));
            return;
        }

        int rawMemberCount = (leadRaw != null ? 1 : 0) + membersRaw.size();

        List<String> brokenRefs = new ArrayList<>();

        String lead = null;
        if (leadRaw != null) {
            if (validAgentNames.contains(leadRaw)) {
                lead = leadRaw;
            } else {
                brokenRefs.add(leadRaw);
                formatErrors.add(brokenRef(leadRaw, stem));
            }
        }

        Set<String> members = new LinkedHashSet<>();
        for (String member : membersRaw) {
            if (validAgentNames.contains(member)) {
                members.add(member);
            } else if (!brokenRefs.contains(member)) {
                brokenRefs.add(member);
                formatErrors.add(brokenRef(member, stem));
            }
        }

        List<String> sortedMembers = members.stream().sorted().toList();
        List<String> sortedBrokenRefs = brokenRefs.stream().sorted().toList();

        workflows.add(new Workflow(
                stem,
                description,
                ".jaystudio/teams/" + fileName,
                lead,
                sortedMembers,
                sortedBrokenRefs,
                rawMemberCount));
    }

    private static FormatError schemaError(String fileName) {
        return new FormatError(FormatError.Kind.WORKFLOW, fileName, "구성 파일 형식 오류");
    }

    private static FormatError brokenRef(String name, String workflowName) {
        return new FormatError(
                FormatError.Kind.BROKEN_REF, name, "구성 파일 참조 깨짐 (" + workflowName + ")", workflowName);
    }

    private static List<Path> listJsonFiles(Path teamsDir) {
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(teamsDir, "*" + FILE_SUFFIX)) {
            for (Path entry : stream) {
                if (Files.isRegularFile(entry)) {
                    files.add(entry);
                }
            }
        } catch (IOException e) {
            return List.of();
        }
        files.sort(java.util.Comparator.comparing(p -> p.getFileName().toString()));
        return files;
    }
}
