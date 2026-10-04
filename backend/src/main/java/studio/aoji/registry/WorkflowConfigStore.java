package studio.aoji.registry;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Component;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.DataDirectory;
import studio.aoji.files.PathGuard;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code <데이터 폴더>/teams/*.json} 구성 파일 읽기·스키마 검증·만들기·삭제
 * (architecture.md §6.2, ADR-06, ADR-08, FR-002-AC5·AC6, FR-006-AC11, FR-008, FR-017).
 * 쓰기·삭제는 {@link #create}·{@link #delete}만 쓰고, 나머지 소속 변경 등은 T-009~T-011의 변경
 * API가 맡는다.
 */
@Component
public class WorkflowConfigStore {

    private static final int SCHEMA_VERSION = 1;
    private static final String FILE_SUFFIX = ".json";
    private static final String TEAMS_SEGMENT = "teams";

    private final ObjectMapper objectMapper;
    private final AtomicFileWriter atomicFileWriter;
    private final DataDirectory dataDirectory;

    public WorkflowConfigStore(ObjectMapper objectMapper, AtomicFileWriter atomicFileWriter, DataDirectory dataDirectory) {
        this.objectMapper = objectMapper;
        this.atomicFileWriter = atomicFileWriter;
        this.dataDirectory = dataDirectory;
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

    /**
     * 새 구성 파일을 만든다(api-spec {@code POST /api/workflows}, FR-008). {@code <데이터 폴더>/teams}가
     * 없으면 이 호출(첫 쓰기 시점)에 만든다(FR-001-AC6 — 읽기만 할 때는 만들지 않는다). {@code name}은
     * 호출자가 {@link WorkflowNameValidator}로 이미 검증·정규화한 값이어야 한다. 팀장·팀원 없이
     * 만들어지고(FR-008-AC3), {@code createdAt}·{@code updatedAt}은 서버가 채운다(architecture.md
     * §6.2). 쓰기는 {@link AtomicFileWriter} 하나만 쓴다(conventions.md §3 MUST) — 실패하면
     * 파일이 만들어지지 않는다(FR-008-E3).
     */
    public void create(PathGuard pathGuard, String name, String description) throws IOException {
        Path teamsDir = teamsDir(pathGuard.mountRoot());
        Files.createDirectories(teamsDir);

        Path target = pathGuard.resolve(dataDirectory.name(), TEAMS_SEGMENT, WorkflowNameValidator.fileName(name));
        pathGuard.assertNotSymlink(target);

        String now = OffsetDateTime.now().toString();
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("schemaVersion", SCHEMA_VERSION);
        content.put("name", name);
        content.put("description", description);
        content.put("lead", null);
        content.put("members", List.of());
        content.put("createdAt", now);
        content.put("updatedAt", now);

        atomicFileWriter.write(target, objectMapper.writeValueAsBytes(content));
    }

    /**
     * 구성 파일을 삭제한다(api-spec {@code DELETE /api/workflows/{workflow}}, FR-017-AC4).
     * 휴지통으로 옮기지 않고 바로 지운다. 팀장·팀원 원본 인원(0명) 판정은 호출자가
     * {@code Workflow.rawMemberCount()}로 먼저 끝낸 뒤에만 호출한다(D-006).
     */
    public void delete(PathGuard pathGuard, String name) throws IOException {
        Path target = pathGuard.resolve(dataDirectory.name(), TEAMS_SEGMENT, WorkflowNameValidator.fileName(name));
        pathGuard.assertNotSymlink(target);
        Files.delete(target);
    }

    /**
     * 기존 에이전트를 워크플로우에 가져온다(api-spec {@code POST /api/workflows/{workflow}/members},
     * FR-009). 호출자가 검증(중복 팀장·이미 소속 등)을 이미 끝낸 뒤, 실제로 받아들인 항목만 넘긴다.
     * 정의 파일은 건드리지 않는다(FR-009-AC3). {@code newLeadOrNull}이 있으면 팀장을 그 값으로
     * 바꾸고, 없으면 원본 {@code lead} 값을 그대로 둔다(호출자가 이미 "팀장이 있는데 lead 포함"을
     * 걸렀으므로 이 메서드는 덮어쓰기만 한다). {@code newMembers}는 원본 {@code members}(깨진 참조
     * 포함)에 더해지고, 저장 시 중복 제거·오름차순 정렬한다(architecture.md §6.2). {@code createdAt}은
     * 원본 값을 보존하고 {@code updatedAt}만 갱신한다.
     */
    public void addMembers(PathGuard pathGuard, String workflowName, String newLeadOrNull, Collection<String> newMembers)
            throws IOException {
        Path target = pathGuard.resolve(dataDirectory.name(), TEAMS_SEGMENT, WorkflowNameValidator.fileName(workflowName));
        pathGuard.assertNotSymlink(target);

        RawWorkflowFile raw = readRaw(target);

        String lead = newLeadOrNull != null ? newLeadOrNull : raw.lead();

        Set<String> mergedMembers = new TreeSet<>(raw.members());
        mergedMembers.addAll(newMembers);
        // lead는 members에 중복 포함될 수 없다(ADR-06 스키마 불변식).
        if (lead != null) {
            mergedMembers.remove(lead);
        }

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("schemaVersion", SCHEMA_VERSION);
        content.put("name", workflowName);
        content.put("description", raw.description());
        content.put("lead", lead);
        content.put("members", List.copyOf(mergedMembers));
        content.put("createdAt", raw.createdAt());
        content.put("updatedAt", OffsetDateTime.now().toString());

        atomicFileWriter.write(target, objectMapper.writeValueAsBytes(content));
    }

    /** 구성 파일 경로(T-010/011 롤백용 원본 바이트 백업·복원에도 쓴다). */
    public Path configFilePath(PathGuard pathGuard, String workflowName) {
        return pathGuard.resolve(dataDirectory.name(), TEAMS_SEGMENT, WorkflowNameValidator.fileName(workflowName));
    }

    /** 쓰기 전 원본 바이트를 백업한다(ADR-08 "원본 바이트를 메모리에 보관", T-010/011 롤백용). */
    public byte[] readRawBytes(PathGuard pathGuard, String workflowName) throws IOException {
        return Files.readAllBytes(configFilePath(pathGuard, workflowName));
    }

    /** {@link #readRawBytes}로 백업한 원본 바이트를 그대로 되돌린다(롤백은 최선 노력, ADR-08). */
    public void restoreRawBytes(PathGuard pathGuard, String workflowName, byte[] original) throws IOException {
        atomicFileWriter.write(configFilePath(pathGuard, workflowName), original);
    }

    /**
     * 에이전트 하나를 워크플로우에 반영한다(api-spec {@code POST /api/agents} 만들기, {@code PUT
     * /api/agents/{name}} 소속 변경, FR-010, FR-011-AC3). {@code role}이 {@link Role#LEAD}면
     * 팀장을 이 name으로 바꾼다(호출자가 팀장 충돌을 이미 검증했다고 가정한다 — 이 메서드는 덮어쓰기만
     * 한다). {@link Role#MEMBER}면 members에 더한다. 정의 파일은 건드리지 않는다.
     */
    public void addMember(PathGuard pathGuard, String workflowName, String name, Role role) throws IOException {
        Path target = configFilePath(pathGuard, workflowName);
        pathGuard.assertNotSymlink(target);
        RawWorkflowFile raw = readRaw(target);

        String lead = role == Role.LEAD ? name : raw.lead();
        Set<String> members = new TreeSet<>(raw.members());
        if (role == Role.LEAD) {
            members.remove(name);
        } else {
            members.add(name);
        }
        if (lead != null) {
            members.remove(lead);
        }

        writeRaw(target, workflowName, raw.description(), lead, members, raw.createdAt());
    }

    /**
     * 워크플로우에서 name을 뺀다(팀장이면 {@code lead}를 null로, 팀원이면 목록에서 제거). 이 name이
     * 팀장·팀원 어느 쪽도 아니면 아무 일도 하지 않는다(api-spec {@code PUT /api/agents/{name}} 소속
     * 변경, FR-011-AC3).
     */
    public void removeMember(PathGuard pathGuard, String workflowName, String name) throws IOException {
        Path target = configFilePath(pathGuard, workflowName);
        pathGuard.assertNotSymlink(target);
        RawWorkflowFile raw = readRaw(target);

        String lead = name.equals(raw.lead()) ? null : raw.lead();
        Set<String> members = new TreeSet<>(raw.members());
        members.remove(name);

        writeRaw(target, workflowName, raw.description(), lead, members, raw.createdAt());
    }

    /**
     * {@code lead}·{@code members}에 있는 {@code oldName}을 {@code newName}으로 바꾼다(api-spec
     * {@code PUT /api/agents/{name}} 이름 변경, FR-011-AC2 "구성 파일 참조도 함께 바뀐다"). 같은
     * 워크플로우 안에서 이름만 바뀌는 경우(소속 워크플로우는 그대로, 역할도 그대로)에 쓴다. 역할은
     * {@code oldName}이 있던 자리(팀장/팀원)를 그대로 유지한다.
     */
    public void renameMember(PathGuard pathGuard, String workflowName, String oldName, String newName) throws IOException {
        renameMember(pathGuard, workflowName, oldName, newName, null);
    }

    /**
     * 이름과 역할을 함께 바꾼다(api-spec {@code PUT /api/agents/{name}} 이름 변경 + 역할 변경 동시,
     * FR-011-AC2·D-019). {@code newRole}이 {@code null}이면 {@link #renameMember(PathGuard, String,
     * String, String)}와 같이 기존 역할을 유지한다. 아니면 {@code oldName}을 완전히 빼고 {@code newName}을
     * {@code newRole}(팀장이면 lead, 팀원이면 members)로 다시 넣는다 — 구성 파일 쓰기 1회로 이름·역할
     * 변경을 함께 반영한다(ADR-08). 팀장 충돌(다른 팀장이 이미 있음) 검증은 호출자가 이 메서드를 부르기
     * 전에 끝낸다(이 메서드는 덮어쓰기만 한다).
     */
    public void renameMember(PathGuard pathGuard, String workflowName, String oldName, String newName, Role newRole)
            throws IOException {
        Path target = configFilePath(pathGuard, workflowName);
        pathGuard.assertNotSymlink(target);
        RawWorkflowFile raw = readRaw(target);

        boolean oldWasLead = oldName.equals(raw.lead());
        Role effectiveRole = newRole != null ? newRole : (oldWasLead ? Role.LEAD : Role.MEMBER);

        String lead = oldWasLead ? null : raw.lead();
        Set<String> members = new TreeSet<>(raw.members());
        members.remove(oldName);

        if (effectiveRole == Role.LEAD) {
            lead = newName;
        } else {
            members.add(newName);
        }
        if (lead != null) {
            members.remove(lead);
        }

        writeRaw(target, workflowName, raw.description(), lead, members, raw.createdAt());
    }

    /**
     * 이름은 그대로 두고 역할만 바꾼다(lead↔member, api-spec {@code PUT /api/agents/{name}} 역할 변경,
     * D-019). {@code name}이 이미 {@code role} 자리에 있으면 결과는 같다(멱등). 팀장 충돌 검증은
     * 호출자가 먼저 끝낸다.
     */
    public void setMemberRole(PathGuard pathGuard, String workflowName, String name, Role role) throws IOException {
        renameMember(pathGuard, workflowName, name, name, role);
    }

    private void writeRaw(
            Path target, String workflowName, String description, String lead, Set<String> members, String createdAt)
            throws IOException {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("schemaVersion", SCHEMA_VERSION);
        content.put("name", workflowName);
        content.put("description", description);
        content.put("lead", lead);
        content.put("members", List.copyOf(members));
        content.put("createdAt", createdAt);
        content.put("updatedAt", OffsetDateTime.now().toString());
        atomicFileWriter.write(target, objectMapper.writeValueAsBytes(content));
    }

    /** {@link #addMembers} 전용 — 검증 없이 구성 파일 원본 필드만 읽는다(파일은 호출 시점에 이미 스키마 검증을 통과했다). */
    private RawWorkflowFile readRaw(Path file) throws IOException {
        JsonNode root = objectMapper.readTree(Files.readString(file, StandardCharsets.UTF_8));

        JsonNode descriptionNode = root.get("description");
        String description = descriptionNode != null && descriptionNode.isString() ? descriptionNode.asString() : "";

        JsonNode leadNode = root.get("lead");
        String lead = leadNode != null && leadNode.isString() ? leadNode.asString() : null;

        List<String> members = new ArrayList<>();
        JsonNode membersNode = root.get("members");
        if (membersNode != null && membersNode.isArray()) {
            for (JsonNode item : membersNode) {
                if (item.isString()) {
                    members.add(item.asString());
                }
            }
        }

        JsonNode createdAtNode = root.get("createdAt");
        String createdAt =
                createdAtNode != null && createdAtNode.isString() ? createdAtNode.asString() : OffsetDateTime.now().toString();

        return new RawWorkflowFile(description, lead, members, createdAt);
    }

    private record RawWorkflowFile(String description, String lead, List<String> members, String createdAt) {}

    private Path teamsDir(Path mountRoot) {
        return mountRoot.resolve(dataDirectory.name()).resolve(TEAMS_SEGMENT);
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
                dataDirectory.relative(TEAMS_SEGMENT, fileName),
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
