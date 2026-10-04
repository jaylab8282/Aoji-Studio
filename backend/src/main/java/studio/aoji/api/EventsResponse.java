package studio.aoji.api;

import java.util.List;
import studio.aoji.events.EventRowResponse;

/** api-spec {@code GET /api/events}·{@code GET /api/agents/{name}/events} 응답 {@code { items: [...] }}. */
public record EventsResponse(List<EventRowResponse> items) {

    public EventsResponse {
        items = List.copyOf(items);
    }
}
