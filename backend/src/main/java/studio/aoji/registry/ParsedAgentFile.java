package studio.aoji.registry;

/**
 * {@link AgentDefinitionParser} 단일 파일 파싱 결과. {@code definition}과
 * {@code formatErrorMessage} 중 정확히 하나만 채워진다.
 *
 * @param relativeFilePath 마운트 루트 기준 상대 경로(예: {@code .claude/agents/architect.md}).
 *     {@code AgentDef.filePath}와 "name 중복 (...)" 메시지 안의 다른 파일 참조에 쓴다(architecture.md §6.1).
 * @param fileName 파일명만(예: {@code architect.md}). api-spec {@code FormatError.file}에 쓴다.
 */
public record ParsedAgentFile(
        String relativeFilePath, String fileName, AgentDefinition definition, String formatErrorMessage) {

    public static ParsedAgentFile ok(String relativeFilePath, String fileName, AgentDefinition definition) {
        return new ParsedAgentFile(relativeFilePath, fileName, definition, null);
    }

    public static ParsedAgentFile error(String relativeFilePath, String fileName, String message) {
        return new ParsedAgentFile(relativeFilePath, fileName, null, message);
    }

    public boolean isValid() {
        return formatErrorMessage == null;
    }
}
