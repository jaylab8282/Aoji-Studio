package studio.jay.api;

import java.util.List;

/** api-spec {@code GET /api/events}·{@code GET /api/agents/{name}/events} 응답 {@code { items: [...] }}. */
public record EventsResponse(List<EventRowResponse> items) {

    public EventsResponse {
        items = List.copyOf(items);
    }
}
