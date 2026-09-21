package studio.jay.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.files.DefinitionFileDeleter;
import studio.jay.files.PathGuard;
import studio.jay.files.TrashService;
import studio.jay.files.WriteLock;
import studio.jay.live.AgentLive;
import studio.jay.live.LiveStateService;
import studio.jay.live.Status;
import studio.jay.registry.AgentDef;
import studio.jay.registry.AgentDefinition;
import studio.jay.registry.AgentDefinitionParser;
import studio.jay.registry.AgentDefinitionWriter;
import studio.jay.registry.FormatError;
import studio.jay.registry.ModelValidator;
import studio.jay.registry.ParsedAgentFile;
import studio.jay.registry.RegistryService;
import studio.jay.registry.RegistrySnapshot;
import studio.jay.registry.Role;
import studio.jay.registry.Workflow;
import studio.jay.registry.WorkflowConfigStore;
import studio.jay.stream.SseHub;

/**
 * 에이전트 만들기·수정·조회·제거 (api-spec {@code GET/POST/PUT/DELETE /api/agents[/{name}]},
 * FR-010, FR-011, FR-012, FR-002-AC3, tasks.md T-010·T-011).
 *
 * <p>쓰기 흐름은 {@link WorkflowController}와 같다(architecture.md §3.2): {@link WriteLock} 안에서
 * 최신 상태로 다시 스캔해 검증한 뒤 {@link AgentDefinitionWriter}·{@link WorkflowConfigStore}·{@link
 * TrashService}로 쓰고, 같은 락 안에서 다시 스캔해 응답 전에 registry를 갱신하고 SSE로 방송한다. 정의
 * 파일·구성 파일이 함께 바뀌는 조작(만들기, 이름 변경, 소속 변경, 제거)은 ADR-08의 순서·롤백을 그대로
 * 따른다.
 */
@RestController
@RequestMapping("/api/agents")
public class AgentController {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9-]{1,64}$");
    private static final String NAME_VALIDATION_MESSAGE = "소문자·숫자·하이픈만, 1~64자";
    private static final String REQUIRED_MESSAGE = "필수";

    private final RegistryService registryService;
    private final WorkflowConfigStore workflowConfigStore;
    private final AgentDefinitionParser agentDefinitionParser;
    private final AgentDefinitionWriter agentDefinitionWriter;
    private final DefinitionFileDeleter definitionFileDeleter;
    private final TrashService trashService;
    private final WriteLock writeLock;
    private final WriteAccessGuard writeAccessGuard;
    private final SseHub sseHub;
    private final LiveStateService liveStateService;
    private final PathGuard pathGuard;

    public AgentController(
            RegistryService registryService,
            WorkflowConfigStore workflowConfigStore,
            AgentDefinitionParser agentDefinitionParser,
            AgentDefinitionWriter agentDefinitionWriter,
            DefinitionFileDeleter definitionFileDeleter,
            TrashService trashService,
            WriteLock writeLock,
            WriteAccessGuard writeAccessGuard,
            SseHub sseHub,
            LiveStateService liveStateService,
            PathGuard pathGuard) {
        this.registryService = registryService;
        this.workflowConfigStore = workflowConfigStore;
        this.agentDefinitionParser = agentDefinitionParser;
        this.agentDefinitionWriter = agentDefinitionWriter;
        this.definitionFileDeleter = definitionFileDeleter;
        this.trashService = trashService;
        this.writeLock = writeLock;
        this.writeAccessGuard = writeAccessGuard;
        this.sseHub = sseHub;
        this.liveStateService = liveStateService;
        this.pathGuard = pathGuard;
    }

    @GetMapping("/{name}")
    public ResponseEntity<AgentDetail> get(@PathVariable String name) {
        RegistrySnapshot snapshot = registryService.current();

        FormatError formatError = findAgentFormatError(snapshot, name);
        if (formatError != null) {
            // FR-002-AC3, FR-011-E3 — 형식 오류 파일은 웹에서 편집할 수 없다.
            throw ApiException.uneditable(formatError.file(), formatError.message());
        }

        AgentDef def = findAgentDef(snapshot, name).orElseThrow(ApiException::agentNotFound);
        Path file = pathGuard.resolve(".claude", "agents", name + ".md");
        try {
            return ResponseEntity.ok(buildAgentDetail(snapshot, def, file));
        } catch (IOException e) {
            throw ApiException.ioFailed("정의 파일을 읽을 수 없습니다 · 다시 시도하세요");
        }
    }

    @PostMapping
    public ResponseEntity<AgentDetail> create(@RequestBody(required = false) AgentCreateRequest request) {
        writeAccessGuard.assertWritable();
        if (request == null) {
            throw ApiException.validation("name", NAME_VALIDATION_MESSAGE);
        }

        String name = request.name();
        if (name == null || !NAME_PATTERN.matcher(name).matches()) {
            throw ApiException.validation("name", NAME_VALIDATION_MESSAGE);
        }
        String description = request.description();
        if (description == null || description.isBlank()) {
            throw ApiException.validation("description", REQUIRED_MESSAGE);
        }
        assertNoLineBreak("description", description);
        String workflowName = request.workflow();
        if (workflowName == null || workflowName.isBlank()) {
            throw ApiException.validation("workflow", REQUIRED_MESSAGE);
        }
        Role role = request.role();
        if (role == null) {
            throw ApiException.validation("role", REQUIRED_MESSAGE);
        }
        List<String> tools = normalizeTools(request.toolsMode(), request.tools());
        String model = request.model();
        if (model != null && !ModelValidator.isValid(model)) {
            throw ApiException.validation("model", "허용하지 않는 값");
        }
        String body = request.body() == null ? "" : request.body();

        AgentDetail created = writeLock.runLocked(() -> {
            RegistrySnapshot fresh = registryService.rescanNow();

            if (isNameTaken(fresh, name)) {
                throw ApiException.validation("name", "이미 있는 name입니다");
            }
            Workflow target = fresh.workflows().stream()
                    .filter(w -> w.name().equals(workflowName))
                    .findFirst()
                    .orElseThrow(ApiException::workflowNotFound);
            if (role == Role.LEAD && target.lead() != null) {
                throw ApiException.leadExists(target.lead());
            }

            Path file = pathGuard.resolve(".claude", "agents", name + ".md");
            pathGuard.assertNotSymlink(file);

            try {
                agentDefinitionWriter.createFile(file, new AgentDefinitionWriter.NewAgentContent(
                        name, description, tools, model, body));
            } catch (IOException | IllegalArgumentException e) {
                throw ApiException.ioFailed("정의 파일 쓰기 실패 · 파일을 만들지 않았습니다");
            }

            try {
                workflowConfigStore.addMember(pathGuard, workflowName, name, role);
            } catch (IOException | IllegalArgumentException e) {
                deleteQuietly(file);
                throw ApiException.ioFailed("구성 파일 쓰기 실패 · 정의 파일을 되돌렸습니다");
            }

            RegistrySnapshot after =
                    registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            AgentDef def = findAgentDef(after, name).orElseThrow(() -> ApiException.ioFailed("생성 확인 실패 · 다시 읽어보세요"));
            try {
                return buildAgentDetail(after, def, file);
            } catch (IOException e) {
                throw ApiException.ioFailed("생성 확인 실패 · 다시 읽어보세요");
            }
        });

        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{name}")
    public ResponseEntity<AgentDetail> update(
            @PathVariable String name, @RequestBody(required = false) AgentUpdateRequest request) {
        writeAccessGuard.assertWritable();
        if (request == null) {
            throw ApiException.validation("name", NAME_VALIDATION_MESSAGE);
        }

        String newName = request.name();
        if (newName == null || !NAME_PATTERN.matcher(newName).matches()) {
            throw ApiException.validation("name", NAME_VALIDATION_MESSAGE);
        }
        String description = request.description();
        if (description == null || description.isBlank()) {
            throw ApiException.validation("description", REQUIRED_MESSAGE);
        }
        assertNoLineBreak("description", description);
        List<String> tools = normalizeTools(request.toolsMode(), request.tools());
        String model = request.model();
        if (model != null && !ModelValidator.isValid(model)) {
            throw ApiException.validation("model", "허용하지 않는 값");
        }
        String body = request.body() == null ? "" : request.body();
        String expectedRevision = request.expectedRevision();
        boolean force = Boolean.TRUE.equals(request.force());
        String newWorkflowName = request.workflow();
        Role role = request.role();

        AgentDetail result = writeLock.runLocked(() -> {
            RegistrySnapshot fresh = registryService.rescanNow();

            FormatError formatError = findAgentFormatError(fresh, name);
            if (formatError != null) {
                throw ApiException.uneditable(formatError.file(), formatError.message());
            }
            AgentDef current = findAgentDef(fresh, name).orElseThrow(ApiException::fileGone);

            Path currentFile = pathGuard.resolve(".claude", "agents", name + ".md");
            FileRevision currentRevision;
            try {
                currentRevision = revisionOf(currentFile);
            } catch (IOException e) {
                throw ApiException.fileGone();
            }
            if (!force && !currentRevision.revision().equals(expectedRevision)) {
                throw ApiException.revisionConflict(currentRevision.revision(), currentRevision.modifiedAt());
            }

            Status status = statusOf(name);
            if (status == Status.RUNNING || status == Status.WAITING) {
                throw ApiException.agentBusy();
            }

            if ((newWorkflowName == null || newWorkflowName.isBlank()) && current.workflow() != null) {
                throw ApiException.validation("workflow", REQUIRED_MESSAGE);
            }
            String normalizedNewWorkflow =
                    newWorkflowName == null || newWorkflowName.isBlank() ? null : newWorkflowName;
            if (normalizedNewWorkflow != null && role == null) {
                throw ApiException.validation("role", REQUIRED_MESSAGE);
            }
            Workflow targetWorkflow = null;
            if (normalizedNewWorkflow != null) {
                targetWorkflow = fresh.workflows().stream()
                        .filter(w -> w.name().equals(normalizedNewWorkflow))
                        .findFirst()
                        .orElseThrow(ApiException::workflowNotFound);
            }

            boolean nameChanged = !newName.equals(name);
            if (nameChanged && isNameTaken(fresh, newName)) {
                throw ApiException.validation("name", "이미 있는 name입니다");
            }

            boolean samePlaceAsBefore = targetWorkflow != null
                    && targetWorkflow.name().equals(current.workflow())
                    && name.equals(targetWorkflow.lead());
            if (targetWorkflow != null
                    && role == Role.LEAD
                    && targetWorkflow.lead() != null
                    && !samePlaceAsBefore) {
                throw ApiException.leadExists(targetWorkflow.lead());
            }

            ParsedAgentFile parsedCurrent =
                    agentDefinitionParser.parse(currentFile, current.filePath(), currentFile.getFileName().toString());
            if (!parsedCurrent.isValid()) {
                throw ApiException.fileGone();
            }
            AgentDefinition currentDefinition = parsedCurrent.definition();
            boolean preserveModelLine = model == null && currentDefinition.hasLiteralInheritModel();

            String oldWorkflow = current.workflow();
            boolean workflowChanged = !Objects.equals(oldWorkflow, normalizedNewWorkflow);
            // D-019: 워크플로우가 안 바뀌어도 role(lead↔member)은 바뀔 수 있다 — api-spec
            // AgentUpdateRequest.role은 필수이고 PUT 409 LEAD_EXISTS·ui-spec 06 역할 라디오는
            // 같은 워크플로우 안 역할 변경을 전제한다. workflowChanged면 applyWorkflowChange의
            // addMember(newWorkflow, newName, role)이 이미 role을 반영하므로 별도 처리가 필요 없다.
            boolean roleChanged = !workflowChanged
                    && normalizedNewWorkflow != null
                    && !Objects.equals(role, current.role());

            Path newFile = nameChanged ? pathGuard.resolve(".claude", "agents", newName + ".md") : currentFile;
            pathGuard.assertNotSymlink(newFile);

            AgentDefinitionWriter.FrontmatterFields fields = new AgentDefinitionWriter.FrontmatterFields(
                    newName, description, tools, model, preserveModelLine);

            String originalContent;
            try {
                originalContent = Files.readString(currentFile, StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw ApiException.fileGone();
            }

            if (workflowChanged) {
                applyWorkflowChange(oldWorkflow, normalizedNewWorkflow, name, newName, role, currentFile, newFile,
                        nameChanged, originalContent, fields, body);
            } else if (nameChanged) {
                applyRenameOnly(oldWorkflow, name, newName, roleChanged ? role : null, currentFile, newFile,
                        originalContent, fields, body);
            } else if (roleChanged) {
                applyRoleChangeOnly(oldWorkflow, name, role, currentFile, originalContent, fields, body);
            } else {
                try {
                    agentDefinitionWriter.updateFile(currentFile, originalContent, fields, body);
                } catch (IOException | IllegalArgumentException e) {
                    throw ApiException.ioFailed("정의 파일 쓰기 실패 · 파일을 바꾸지 않았습니다");
                }
            }

            RegistrySnapshot after =
                    registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            AgentDef updatedDef =
                    findAgentDef(after, newName).orElseThrow(() -> ApiException.ioFailed("수정 확인 실패 · 다시 읽어보세요"));
            try {
                return buildAgentDetail(after, updatedDef, newFile);
            } catch (IOException e) {
                throw ApiException.ioFailed("수정 확인 실패 · 다시 읽어보세요");
            }
        });

        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/{name}")
    public ResponseEntity<AgentRemoveResult> delete(@PathVariable String name) {
        writeAccessGuard.assertWritable();

        AgentRemoveResult result = writeLock.runLocked(() -> {
            RegistrySnapshot fresh = registryService.rescanNow();
            AgentDef current = findAgentDef(fresh, name).orElseThrow(ApiException::agentNotFound);
            assertNotBusyForRemoval(name);

            Path file = pathGuard.resolve(".claude", "agents", name + ".md");
            TrashService.MoveResult moved;
            try {
                moved = trashService.move(pathGuard, file, name);
            } catch (IOException | IllegalArgumentException e) {
                throw ApiException.ioFailed("정의 파일을 휴지통으로 옮기지 못했습니다 · 아무것도 바꾸지 않았습니다");
            }

            String removedFromWorkflow = current.workflow();
            if (removedFromWorkflow != null) {
                try {
                    workflowConfigStore.removeMember(pathGuard, removedFromWorkflow, name);
                } catch (IOException | IllegalArgumentException e) {
                    restoreFromTrashQuietly(moved.trashFile(), file);
                    throw ApiException.ioFailed("구성 파일 갱신 실패 · 정의 파일을 휴지통에서 되돌렸습니다");
                }
            }

            registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            return new AgentRemoveResult(moved.relativePath(), removedFromWorkflow);
        });

        return ResponseEntity.ok(result);
    }

    /** FR-012-AC6·E2 — 제거 시점 상태가 running/waiting이면 거부한다. */
    private void assertNotBusyForRemoval(String name) {
        Status status = statusOf(name);
        if (status == Status.RUNNING || status == Status.WAITING) {
            throw ApiException.agentBusyOnRemove();
        }
    }

    /** ADR-08 "제거" 롤백 — 구성 파일 갱신 실패 시 정의 파일을 휴지통에서 원위치로 되돌린다(최선 노력). */
    private void restoreFromTrashQuietly(Path trashFile, Path originalFile) {
        try {
            trashService.restore(trashFile, originalFile);
        } catch (IOException ignored) {
            // 원복은 최선 노력이다(ADR-08) — 실패해도 상위 500 응답으로 사용자에게 이미 알린다.
        }
    }

    /** ADR-08 "수정(소속 변경)": 이전 구성 파일 → 새 구성 파일 → 정의 파일. 실패 시 역순 원복. 이름도 바뀌면 정의 파일 다음 옛 파일 삭제. */
    private void applyWorkflowChange(
            String oldWorkflow,
            String newWorkflow,
            String oldName,
            String newName,
            Role role,
            Path currentFile,
            Path newFile,
            boolean nameChanged,
            String originalContent,
            AgentDefinitionWriter.FrontmatterFields fields,
            String body) {
        Deque<Runnable> rollbacks = new ArrayDeque<>();
        try {
            if (oldWorkflow != null) {
                byte[] original = readConfigBytesQuietly(oldWorkflow);
                try {
                    workflowConfigStore.removeMember(pathGuard, oldWorkflow, oldName);
                } catch (IOException | IllegalArgumentException e) {
                    throw new WriteFailure("이전 구성 파일 갱신 실패 · 아무것도 바꾸지 않았습니다");
                }
                rollbacks.push(() -> restoreConfigQuietly(oldWorkflow, original));
            }
            if (newWorkflow != null) {
                byte[] original = readConfigBytesQuietly(newWorkflow);
                try {
                    workflowConfigStore.addMember(pathGuard, newWorkflow, newName, role);
                } catch (IOException | IllegalArgumentException e) {
                    throw new WriteFailure("새 구성 파일 갱신 실패 · 이전 상태로 되돌렸습니다");
                }
                rollbacks.push(() -> restoreConfigQuietly(newWorkflow, original));
            }

            try {
                agentDefinitionWriter.updateFile(newFile, originalContent, fields, body);
            } catch (IOException | IllegalArgumentException e) {
                throw new WriteFailure("정의 파일 쓰기 실패 · 구성 파일을 되돌렸습니다");
            }
            if (nameChanged) {
                rollbacks.push(() -> deleteQuietly(newFile));
                try {
                    definitionFileDeleter.delete(currentFile);
                } catch (IOException e) {
                    throw new WriteFailure("옛 정의 파일 삭제 실패 · 새 파일과 구성 파일을 되돌렸습니다");
                }
            }
        } catch (WriteFailure failure) {
            while (!rollbacks.isEmpty()) {
                rollbacks.pop().run();
            }
            throw ApiException.ioFailed(failure.getMessage());
        }
    }

    /**
     * ADR-08 "수정(이름 변경)": 새 파일 쓰기 → 구성 파일 갱신 → 옛 파일 삭제. 실패 시 되돌린다.
     * {@code newRoleOrNull}이 있으면(D-019 이름 변경 + 역할 변경 동시) 구성 파일 쓰기 1회에 역할
     * 교체도 함께 반영한다({@link WorkflowConfigStore#renameMember(PathGuard, String, String,
     * String, Role)}). null이면 기존 역할을 그대로 유지한다.
     */
    private void applyRenameOnly(
            String workflow,
            String oldName,
            String newName,
            Role newRoleOrNull,
            Path currentFile,
            Path newFile,
            String originalContent,
            AgentDefinitionWriter.FrontmatterFields fields,
            String body) {
        Deque<Runnable> rollbacks = new ArrayDeque<>();
        try {
            try {
                agentDefinitionWriter.updateFile(newFile, originalContent, fields, body);
            } catch (IOException | IllegalArgumentException e) {
                throw new WriteFailure("정의 파일 쓰기 실패 · 파일을 만들지 않았습니다");
            }
            rollbacks.push(() -> deleteQuietly(newFile));

            if (workflow != null) {
                byte[] original = readConfigBytesQuietly(workflow);
                try {
                    workflowConfigStore.renameMember(pathGuard, workflow, oldName, newName, newRoleOrNull);
                } catch (IOException | IllegalArgumentException e) {
                    throw new WriteFailure("구성 파일 갱신 실패 · 새 정의 파일을 되돌렸습니다");
                }
                rollbacks.push(() -> restoreConfigQuietly(workflow, original));
            }

            try {
                definitionFileDeleter.delete(currentFile);
            } catch (IOException e) {
                throw new WriteFailure("옛 정의 파일 삭제 실패 · 새 파일과 구성 파일을 되돌렸습니다");
            }
        } catch (WriteFailure failure) {
            while (!rollbacks.isEmpty()) {
                rollbacks.pop().run();
            }
            throw ApiException.ioFailed(failure.getMessage());
        }
    }

    /**
     * 이름은 그대로 두고 역할만 바꾼다(D-019). ADR-08 "소속 변경"과 같은 순서: 구성 파일을 먼저 쓰고
     * 정의 파일을 나중에 쓴다. 정의 파일 쓰기 실패 시 구성 파일을 원본 바이트로 되돌린다. 팀장 충돌
     * (다른 팀장이 이미 있음) 검증은 호출자({@link #update}) 쪽에서 이 메서드를 부르기 전에 끝낸다.
     */
    private void applyRoleChangeOnly(
            String workflow,
            String name,
            Role role,
            Path currentFile,
            String originalContent,
            AgentDefinitionWriter.FrontmatterFields fields,
            String body) {
        Deque<Runnable> rollbacks = new ArrayDeque<>();
        try {
            byte[] original = readConfigBytesQuietly(workflow);
            try {
                workflowConfigStore.setMemberRole(pathGuard, workflow, name, role);
            } catch (IOException | IllegalArgumentException e) {
                throw new WriteFailure("구성 파일 갱신 실패 · 아무것도 바꾸지 않았습니다");
            }
            rollbacks.push(() -> restoreConfigQuietly(workflow, original));

            try {
                agentDefinitionWriter.updateFile(currentFile, originalContent, fields, body);
            } catch (IOException | IllegalArgumentException e) {
                throw new WriteFailure("정의 파일 쓰기 실패 · 구성 파일을 되돌렸습니다");
            }
        } catch (WriteFailure failure) {
            while (!rollbacks.isEmpty()) {
                rollbacks.pop().run();
            }
            throw ApiException.ioFailed(failure.getMessage());
        }
    }

    /** 내부 전용 — ADR-08 롤백 트리거용. 사용자에게 보일 메시지를 담아 catch 블록에서 {@code ApiException}으로 바꾼다. */
    private static final class WriteFailure extends RuntimeException {
        WriteFailure(String message) {
            super(message);
        }
    }

    private byte[] readConfigBytesQuietly(String workflowName) {
        try {
            return workflowConfigStore.readRawBytes(pathGuard, workflowName);
        } catch (IOException e) {
            throw new WriteFailure("구성 파일을 읽을 수 없습니다 · 아무것도 바꾸지 않았습니다");
        }
    }

    private void restoreConfigQuietly(String workflowName, byte[] original) {
        try {
            workflowConfigStore.restoreRawBytes(pathGuard, workflowName, original);
        } catch (IOException ignored) {
            // 원복은 최선 노력이다(ADR-08) — 실패해도 상위 500 응답으로 사용자에게 이미 알린다.
        }
    }

    private static void deleteQuietly(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException ignored) {
            // 원복은 최선 노력이다(ADR-08).
        }
    }

    private static boolean isNameTaken(RegistrySnapshot snapshot, String name) {
        boolean validNameTaken = snapshot.agents().stream().anyMatch(a -> a.name().equals(name));
        boolean formatErrorFileTaken = snapshot.formatErrors().stream()
                .anyMatch(fe -> fe.kind() == FormatError.Kind.AGENT && fe.file().equals(name + ".md"));
        return validNameTaken || formatErrorFileTaken;
    }

    private static Optional<AgentDef> findAgentDef(RegistrySnapshot snapshot, String name) {
        return snapshot.agents().stream().filter(a -> a.name().equals(name)).findFirst();
    }

    private static FormatError findAgentFormatError(RegistrySnapshot snapshot, String name) {
        String fileName = name + ".md";
        return snapshot.formatErrors().stream()
                .filter(fe -> fe.kind() == FormatError.Kind.AGENT && fe.file().equals(fileName))
                .findFirst()
                .orElse(null);
    }

    private Status statusOf(String name) {
        AgentLive live = liveStateService.live().agents().get(name);
        return live == null ? Status.IDLE : live.status();
    }

    private AgentDetail buildAgentDetail(RegistrySnapshot snapshot, AgentDef def, Path file) throws IOException {
        ParsedAgentFile parsed = agentDefinitionParser.parse(file, def.filePath(), file.getFileName().toString());
        if (!parsed.isValid()) {
            throw new IOException("정의 파일을 다시 읽을 수 없습니다: " + parsed.formatErrorMessage());
        }
        AgentDefinition d = parsed.definition();
        FileRevision revision = revisionOf(file);
        Status status = statusOf(def.name());
        return new AgentDetail(
                def.name(),
                d.description(),
                d.model(),
                d.tools(),
                d.body(),
                def.filePath(),
                revision.revision(),
                revision.modifiedAt(),
                def.workflow(),
                def.role(),
                status,
                d.hasLiteralInheritModel());
    }

    private record FileRevision(String revision, OffsetDateTime modifiedAt) {}

    private static FileRevision revisionOf(Path file) throws IOException {
        FileTime mtime = Files.getLastModifiedTime(file);
        long size = Files.size(file);
        String revision = mtime.toMillis() + "-" + size;
        OffsetDateTime modifiedAt = mtime.toInstant().atZone(ZoneId.systemDefault()).toOffsetDateTime();
        return new FileRevision(revision, modifiedAt);
    }

    /**
     * 줄바꿈이 섞인 값은 거부한다(비차단 리뷰 제안, D-019 회신). {@code AgentDefinitionWriter}는
     * 알려진 키 값을 frontmatter 한 줄로 쓴다(ADR-07 "줄 단위 편집") — 값에 raw {@code \n}·{@code \r}이
     * 섞이면 그 줄이 실제로 둘 이상의 물리적 줄로 쪼개져 frontmatter가 깨지거나(다음 수정 때 줄 단위
     * 편집기가 잘못된 줄을 키로 오인) YAML이 줄바꿈을 접어(fold) 원래 값과 다르게 읽힌다. ui-spec 06
     * `설명`은 한 줄 입력이므로 정상 사용에서는 발생하지 않고, 이 검사는 방어선이다.
     */
    private static void assertNoLineBreak(String field, String value) {
        if (value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
            throw ApiException.validation(field, "줄바꿈을 포함할 수 없습니다");
        }
    }

    /** api-spec {@code AgentCreateRequest.toolsMode/tools} → 저장할 tools 목록(null = 전체 상속, FR-010-AC2). */
    private static List<String> normalizeTools(String toolsMode, List<String> tools) {
        if (toolsMode == null) {
            throw ApiException.validation("toolsMode", REQUIRED_MESSAGE);
        }
        if (toolsMode.equals("inherit")) {
            return null;
        }
        if (toolsMode.equals("explicit")) {
            List<String> cleaned =
                    tools == null ? List.of() : tools.stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
            if (cleaned.isEmpty()) {
                throw ApiException.validation("tools", "직접 선택은 1개 이상");
            }
            return cleaned;
        }
        throw ApiException.validation("toolsMode", "허용하지 않는 값");
    }

    /** api-spec {@code AgentDetail}. */
    public record AgentDetail(
            String name,
            String description,
            String model,
            List<String> tools,
            String body,
            String filePath,
            String revision,
            OffsetDateTime modifiedAt,
            String workflow,
            Role role,
            Status status,
            boolean hasLiteralInheritModel) {}

    /** api-spec {@code AgentCreateRequest}. */
    public record AgentCreateRequest(
            String name,
            String description,
            String model,
            String workflow,
            Role role,
            String toolsMode,
            List<String> tools,
            String body) {}

    /** api-spec {@code DELETE /api/agents/{name}} 200 응답. */
    public record AgentRemoveResult(String trashPath, String removedFromWorkflow) {}

    /** api-spec {@code AgentUpdateRequest}. */
    public record AgentUpdateRequest(
            String name,
            String description,
            String model,
            String workflow,
            Role role,
            String toolsMode,
            List<String> tools,
            String body,
            String expectedRevision,
            Boolean force) {}
}
