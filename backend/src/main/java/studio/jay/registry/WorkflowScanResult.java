package studio.jay.registry;

import java.util.List;

/**
 * {@code .jaystudio/teams/*.json} 스캔 결과 (FR-002-AC5·AC6, FR-006-AC11 준비).
 *
 * @param workflows 정상 구성 파일만
 * @param formatErrors workflow·broken-ref 형식 오류 목록
 */
public record WorkflowScanResult(List<Workflow> workflows, List<FormatError> formatErrors) {

    public WorkflowScanResult {
        workflows = List.copyOf(workflows);
        formatErrors = List.copyOf(formatErrors);
    }
}
