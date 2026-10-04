package studio.aoji.stream;

/**
 * api-spec {@code Config}. 마운트 절대 경로는 담지 않는다({@code hostPath}만 예외, FR-014-AC4).
 * {@link SnapshotAssembler}가 {@code AppProperties}로 매 호출마다 계산한다.
 *
 * @param hostPath 맥북 절대 경로(07 표시, 도우미 명령 표시)
 * @param publicOrigin {@code http://127.0.0.1:<public-port>}
 * @param collectUrl {@code <publicOrigin>/hooks/events}
 * @param helperUrl 브라우저가 호출할 도우미 주소(ADR-12)
 * @param defaultSessionCommand {@code cd "<hostPath>" && claude}(FR-013-AC1)
 */
public record Config(
        String hostPath, String publicOrigin, String collectUrl, String helperUrl, String defaultSessionCommand) {}
