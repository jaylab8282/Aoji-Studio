package studio.jay.api;

import java.io.IOException;
import java.nio.file.Path;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.config.AppProperties;
import studio.jay.files.PathGuard;
import studio.jay.files.WriteLock;
import studio.jay.live.LiveStateService;
import studio.jay.registry.RegistryService;
import studio.jay.registry.RegistrySnapshot;
import studio.jay.registry.Workflow;
import studio.jay.registry.WorkflowConfigStore;
import studio.jay.registry.WorkflowNameValidator;
import studio.jay.stream.SseHub;

/**
 * 워크플로우 추가·삭제 (api-spec {@code POST /api/workflows}, {@code DELETE
 * /api/workflows/{workflow}}, FR-008, FR-017). Origin 규칙·브라우저 토큰은 {@code OriginFilter}·
 * {@code BrowserTokenFilter}가 이미 적용한다(architecture.md §5) — {@code READ_ONLY}만
 * {@link WriteAccessGuard}로 이 컨트롤러가 직접 검사한다.
 *
 * <p>쓰기 흐름은 architecture.md §3.2 그대로다: {@link WriteLock} 안에서 최신 상태로 다시 스캔해
 * 검증(중복 이름·원본 인원)한 뒤 {@link WorkflowConfigStore}로 쓰고, 같은 락 안에서 다시 스캔해
 * 응답 전에 {@code RegistryService}를 갱신하고 SSE로 방송한다(FR-008-AC4 "바로 나타난다"). 검증
 * 직전에 다시 스캔하는 이유는 확인 창이 열려 있는 사이 다른 탭이 파일을 바꿨을 수 있어서다
 * (FR-017-E1 "확인 사이에 팀원이 추가됨").
 */
@RestController
@RequestMapping("/api/workflows")
public class WorkflowController {

    private final RegistryService registryService;
    private final WorkflowConfigStore workflowConfigStore;
    private final WriteLock writeLock;
    private final WriteAccessGuard writeAccessGuard;
    private final SseHub sseHub;
    private final LiveStateService liveStateService;
    private final PathGuard pathGuard;

    public WorkflowController(
            RegistryService registryService,
            WorkflowConfigStore workflowConfigStore,
            WriteLock writeLock,
            WriteAccessGuard writeAccessGuard,
            SseHub sseHub,
            LiveStateService liveStateService,
            AppProperties appProperties) {
        this.registryService = registryService;
        this.workflowConfigStore = workflowConfigStore;
        this.writeLock = writeLock;
        this.writeAccessGuard = writeAccessGuard;
        this.sseHub = sseHub;
        this.liveStateService = liveStateService;
        // 마운트 루트는 기동 후 바뀌지 않으므로(FR-001-AC5) RegistryService와 같은 방식으로 한 번만 만든다.
        this.pathGuard = new PathGuard(Path.of(appProperties.getMountPath()));
    }

    @PostMapping
    public ResponseEntity<Workflow> create(@RequestBody(required = false) CreateWorkflowRequest request) {
        writeAccessGuard.assertWritable();

        String rawName = request == null ? null : request.name();
        String normalizedName = WorkflowNameValidator.normalize(rawName);
        if (!WorkflowNameValidator.isValidFormat(normalizedName)) {
            throw ApiException.validation("name", WorkflowNameValidator.VALIDATION_MESSAGE);
        }
        String description = request == null || request.description() == null ? "" : request.description();

        Workflow created = writeLock.runLocked(() -> {
            RegistrySnapshot fresh = registryService.rescanNow();
            boolean duplicate = WorkflowNameValidator.isDuplicate(
                    normalizedName, fresh.workflows().stream().map(Workflow::name).toList());
            if (duplicate) {
                throw ApiException.validation("name", "이미 있는 이름입니다");
            }

            try {
                workflowConfigStore.create(pathGuard, normalizedName, description);
            } catch (IOException | IllegalArgumentException e) {
                // IllegalArgumentException은 PathGuard가 경로 이탈·심볼릭 링크 대상을 거부할 때 던진다
                // (conventions.md §3 MUST). 사용자에게는 다른 쓰기 실패와 동일하게 IO_FAILED로 보인다.
                throw ApiException.ioFailed("구성 파일 쓰기 실패 · 파일을 만들지 않았습니다");
            }

            RegistrySnapshot after =
                    registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            return after.workflows().stream()
                    .filter(workflow -> workflow.name().equals(normalizedName))
                    .findFirst()
                    .orElseThrow(() -> ApiException.ioFailed("워크플로우 생성 확인 실패 · 다시 읽어보세요"));
        });

        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @DeleteMapping("/{workflow}")
    public ResponseEntity<Void> delete(@PathVariable String workflow) {
        writeAccessGuard.assertWritable();

        writeLock.runLocked(() -> {
            RegistrySnapshot fresh = registryService.rescanNow();
            Workflow target = fresh.workflows().stream()
                    .filter(w -> w.name().equals(workflow))
                    .findFirst()
                    .orElseThrow(ApiException::workflowNotFound);

            if (target.rawMemberCount() > 0) {
                throw ApiException.workflowNotEmpty();
            }

            try {
                workflowConfigStore.delete(pathGuard, workflow);
            } catch (IOException | IllegalArgumentException e) {
                throw ApiException.ioFailed("구성 파일 삭제 실패 · 파일을 그대로 두었습니다");
            }

            registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            return null;
        });

        return ResponseEntity.noContent().build();
    }

    /** api-spec {@code POST /api/workflows} 요청 본문. */
    public record CreateWorkflowRequest(String name, String description) {}
}
