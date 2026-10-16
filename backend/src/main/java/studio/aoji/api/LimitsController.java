package studio.aoji.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.statusline.Limits;
import studio.aoji.statusline.LimitsService;

/** 10 구독 플랜·5시간·주간 한도 (api-spec {@code GET /api/limits}, FR-027). 읽기 전용이다. */
@RestController
@RequestMapping("/api")
public class LimitsController {

    private final LimitsService limitsService;

    public LimitsController(LimitsService limitsService) {
        this.limitsService = limitsService;
    }

    @GetMapping("/limits")
    public Limits limits() {
        return limitsService.limits();
    }
}
