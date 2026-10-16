package studio.aoji.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 스킬 쓰기 API 테스트 공용 호출 도구(브라우저 토큰·Origin 포함). */
public final class SkillApiClient {

    public static final String ORIGIN = "http://127.0.0.1:4180";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;

    public SkillApiClient(MockMvc mockMvc, ObjectMapper objectMapper) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
    }

    private String token() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ORIGIN)).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }

    public MvcResult create(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/api/skills")
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    public MvcResult update(String name, Map<String, Object> body) throws Exception {
        return mockMvc.perform(put("/api/skills/" + name)
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    public MvcResult remove(String name) throws Exception {
        return mockMvc.perform(delete("/api/skills/" + name)
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", token()))
                .andReturn();
    }

    /** 미리보기(multipart {@code file}). */
    public MvcResult preview(byte[] zip) throws Exception {
        return mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart(
                                "/api/skills/import/preview")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "skill.zip", "application/zip", zip))
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", token()))
                .andReturn();
    }

    public MvcResult importSkill(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/api/skills/import")
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    public MvcResult detail(String name) throws Exception {
        return mockMvc.perform(get("/api/skills/" + name).header("Origin", ORIGIN)).andReturn();
    }

    public JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    public String revisionOf(String name) throws Exception {
        return json(detail(name)).get("revision").asString();
    }
}
