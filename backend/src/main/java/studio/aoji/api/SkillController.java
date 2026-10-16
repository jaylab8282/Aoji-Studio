package studio.aoji.api;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.config.AppProperties;
import studio.aoji.skills.SkillEntry;
import studio.aoji.skills.SkillScanner;
import studio.aoji.usage.PeriodQuery;
import studio.aoji.usage.SkillsReport;
import studio.aoji.usage.SkillsReportService;

/**
 * 08 스킬 조회 (api-spec {@code GET /api/skills}, {@code GET /api/skills/{skill}}, FR-018·FR-019).
 * 이 컨트롤러는 읽기만 한다.
 */
@RestController
@RequestMapping("/api/skills")
public class SkillController {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9-]{1,64}$");

    private final SkillsReportService reportService;
    private final SkillScanner skillScanner;
    private final AppProperties appProperties;
    private final Clock clock;

    public SkillController(
            SkillsReportService reportService, SkillScanner skillScanner, AppProperties appProperties, Clock clock) {
        this.reportService = reportService;
        this.skillScanner = skillScanner;
        this.appProperties = appProperties;
        this.clock = clock;
    }

    @GetMapping
    public SkillsReport list(
            @RequestParam(name = "period", required = false) String period,
            @RequestParam(name = "tz", required = false) String tz) {
        return reportService.report(PeriodQuery.parse(period, tz, clock));
    }

    @GetMapping("/{skill}")
    public SkillDetail detail(@PathVariable("skill") String skill) {
        if (!NAME_PATTERN.matcher(skill).matches()) {
            throw ApiException.skillNotFound();
        }
        SkillEntry entry = skillScanner
                .find(Path.of(appProperties.getMountPath()), skill)
                .orElseThrow(ApiException::skillNotFound);
        if (entry.formatError() != null) {
            throw ApiException.skillUneditable();
        }
        return new SkillDetail(
                entry.name(),
                entry.description(),
                entry.userOnly(),
                entry.body(),
                entry.filePath(),
                entry.revision(),
                Instant.ofEpochMilli(entry.mtimeMillis()).atZone(clock.getZone()).toOffsetDateTime(),
                entry.imported());
    }
}
