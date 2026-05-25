package com.capston.demo.domain.calender.service;

import com.capston.demo.domain.calender.entity.Event;
import com.capston.demo.domain.calender.entity.Task;
import com.capston.demo.domain.user.dto.response.NotionCalendarTargetResponse;
import com.capston.demo.global.exception.BusinessException;
import com.capston.demo.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// Event 정보를 기반으로 Notion 캘린더(데이터베이스)에 페이지를 생성하는 서비스
@Service
@RequiredArgsConstructor
@Slf4j
public class NotionCalendarService {

    // HTTP 요청을 보내기 위한 Spring의 RestTemplate
    private final RestTemplate restTemplate;

    // 사용할 Notion API 버전 (요청 헤더에 넣어야 함)
    @Value("${spring.security.oauth2.client.provider.notion.notion-version:2022-06-28}")
    private String notionVersion;

    // Notion 페이지 생성 REST API 엔드포인트
    private static final String NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
    // Notion 검색 API (연동 워크스페이스 내 database 목록 조회)
    private static final String NOTION_SEARCH_URL = "https://api.notion.com/v1/search";
    // Notion database 단건 조회 (캘린더 이름 등)
    private static final String NOTION_DATABASES_URL = "https://api.notion.com/v1/databases/";
    private static final String NOTION_VIEWS_URL = "https://api.notion.com/v1/views";
    private static final String NOTION_VIEW_VERSION = "2026-03-11";
    // 일정 sync(createEventInNotion)와 동일한 컬럼명
    private static final String CALENDAR_TITLE_PROPERTY = "Name";
    private static final String CALENDAR_DATE_PROPERTY = "Date";
    private static final String DEFAULT_CALENDAR_DATABASE_NAME = "Meetflow 일정";
    private static final String DEFAULT_MEETING_NOTES_DATABASE_NAME = "Meetflow 회의록";

    /**
     * OAuth로 접근 가능한 Notion database 목록 조회 (캘린더 연결 화면용).
     */
    public List<NotionCalendarTargetResponse> searchCalendarTargets(String accessToken) {
        try {
            List<NotionCalendarTargetResponse> targets = new ArrayList<>();
            String cursor = null;

            do {
                Map<String, Object> body = new HashMap<>();
                body.put("filter", Map.of("value", "database", "property", "object"));
                body.put("page_size", 100);
                if (cursor != null) {
                    body.put("start_cursor", cursor);
                }

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, notionHeaders(accessToken));
                ResponseEntity<Map> response = restTemplate.exchange(
                        NOTION_SEARCH_URL,
                        HttpMethod.POST,
                        request,
                        Map.class
                );

                if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                    log.warn("Notion search failed. status={}, body={}", response.getStatusCode(), response.getBody());
                    throw new BusinessException(ErrorCode.NOTION_CALENDAR_TARGETS_FAILED);
                }

                Map<String, Object> responseBody = response.getBody();
                Object resultsObj = responseBody.get("results");
                if (resultsObj instanceof List<?> results) {
                    for (Object item : results) {
                        if (item instanceof Map<?, ?> raw) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> entry = (Map<String, Object>) raw;
                            mapDatabaseResult(entry).ifPresent(targets::add);
                        }
                    }
                }

                Object hasMore = responseBody.get("has_more");
                cursor = Boolean.TRUE.equals(hasMore) ? asString(responseBody.get("next_cursor")) : null;
            } while (cursor != null && !cursor.isBlank());

            targets.sort(Comparator.comparing(NotionCalendarTargetResponse::getName, String.CASE_INSENSITIVE_ORDER));
            return targets;
        } catch (BusinessException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Notion search API error: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.NOTION_CALENDAR_TARGETS_FAILED, e);
        } catch (Exception e) {
            log.error("Error while searching Notion databases: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.NOTION_CALENDAR_TARGETS_FAILED, e);
        }
    }

    private java.util.Optional<NotionCalendarTargetResponse> mapDatabaseResult(Map<String, Object> entry) {
        if (!"database".equals(asString(entry.get("object")))) {
            return java.util.Optional.empty();
        }
        Object archived = entry.get("archived");
        if (Boolean.TRUE.equals(archived)) {
            return java.util.Optional.empty();
        }

        String id = asString(entry.get("id"));
        if (id == null || id.isBlank()) {
            return java.util.Optional.empty();
        }

        String name = extractTitle(entry.get("title"));
        if (name.isBlank()) {
            name = "이름 없는 데이터베이스";
        }

        String url = asString(entry.get("url"));
        return java.util.Optional.of(new NotionCalendarTargetResponse(id, name, "database", url));
    }

    private java.util.Optional<NotionCalendarTargetResponse> findAccessibleNameDateDatabase(String accessToken) {
        try {
            String cursor = null;
            do {
                Map<String, Object> body = new HashMap<>();
                body.put("filter", Map.of("value", "database", "property", "object"));
                body.put("page_size", 100);
                if (cursor != null) {
                    body.put("start_cursor", cursor);
                }

                ResponseEntity<Map> response = restTemplate.exchange(
                        NOTION_SEARCH_URL,
                        HttpMethod.POST,
                        new HttpEntity<>(body, notionHeaders(accessToken)),
                        Map.class
                );

                if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                    return java.util.Optional.empty();
                }

                Object resultsObj = response.getBody().get("results");
                if (resultsObj instanceof List<?> results) {
                    for (Object item : results) {
                        if (!(item instanceof Map<?, ?> raw)) {
                            continue;
                        }
                        @SuppressWarnings("unchecked")
                        Map<String, Object> entry = (Map<String, Object>) raw;
                        if (hasNameDateSchema(entry) || fetchDatabase(accessToken, entry).map(this::hasNameDateSchema).orElse(false)) {
                            return mapDatabaseResult(entry);
                        }
                    }
                }

                cursor = Boolean.TRUE.equals(response.getBody().get("has_more"))
                        ? asString(response.getBody().get("next_cursor"))
                        : null;
            } while (cursor != null && !cursor.isBlank());
        } catch (Exception e) {
            log.warn("Failed to find existing Notion calendar database: {}", e.getMessage());
        }
        return java.util.Optional.empty();
    }

    private java.util.Optional<Map<String, Object>> fetchDatabase(String accessToken, Map<String, Object> entry) {
        String id = asString(entry.get("id"));
        if (id == null || id.isBlank()) {
            return java.util.Optional.empty();
        }
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_DATABASES_URL + id,
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = response.getBody();
                return java.util.Optional.of(body);
            }
        } catch (Exception ignored) {
        }
        return java.util.Optional.empty();
    }

    private boolean hasNameDateSchema(Map<String, Object> database) {
        Object propertiesObj = database.get("properties");
        if (!(propertiesObj instanceof Map<?, ?> properties)) {
            return false;
        }

        Object titleObj = properties.get(CALENDAR_TITLE_PROPERTY);
        Object dateObj = properties.get(CALENDAR_DATE_PROPERTY);
        return hasPropertyType(titleObj, "title") && hasPropertyType(dateObj, "date");
    }

    private boolean hasPropertyType(Object propertyObj, String type) {
        if (!(propertyObj instanceof Map<?, ?> property)) {
            return false;
        }
        return type.equals(asString(property.get("type"))) || property.containsKey(type);
    }

    private void ensureCalendarView(String accessToken, String databaseId, boolean removeDefaultTableView) {
        try {
            if (databaseId == null || databaseId.isBlank()) {
                return;
            }
            java.util.Optional<String> existingCalendarViewId = findViewIdByType(accessToken, databaseId, "calendar");
            if (existingCalendarViewId.isPresent()) {
                return;
            }

            String dataSourceId = fetchDataSourceId(accessToken, databaseId)
                    .orElseThrow(() -> new IllegalStateException("Notion data_source_id not found"));

            Map<String, Object> body = new HashMap<>();
            body.put("database_id", databaseId);
            body.put("data_source_id", dataSourceId);
            body.put("name", "Calendar");
            body.put("type", "calendar");

            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_VIEWS_URL,
                    HttpMethod.POST,
                    new HttpEntity<>(body, notionViewHeaders(accessToken)),
                    Map.class
            );

            String createdViewId = response.getBody() == null ? null : asString(response.getBody().get("id"));
            if (removeDefaultTableView && createdViewId != null && !createdViewId.isBlank()) {
                deleteDefaultTableViews(accessToken, databaseId, createdViewId);
            }
        } catch (Exception e) {
            log.warn("Failed to create Notion calendar view for databaseId={}: {}", databaseId, e.getMessage());
        }
    }

    private java.util.Optional<String> fetchDataSourceId(String accessToken, String databaseId) {
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_DATABASES_URL + databaseId.trim(),
                    HttpMethod.GET,
                    new HttpEntity<>(notionViewHeaders(accessToken)),
                    Map.class
            );
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return java.util.Optional.empty();
            }

            Object dataSourcesObj = response.getBody().get("data_sources");
            if (dataSourcesObj instanceof List<?> dataSources && !dataSources.isEmpty()) {
                Object first = dataSources.get(0);
                if (first instanceof Map<?, ?> dataSource) {
                    String id = asString(dataSource.get("id"));
                    if (id != null && !id.isBlank()) {
                        return java.util.Optional.of(id);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch Notion data source id for databaseId={}: {}", databaseId, e.getMessage());
        }
        return java.util.Optional.empty();
    }

    private java.util.Optional<String> findViewIdByType(String accessToken, String databaseId, String type) {
        for (Map<String, Object> view : listViews(accessToken, databaseId)) {
            if (type.equals(asString(view.get("type")))) {
                String id = asString(view.get("id"));
                if (id != null && !id.isBlank()) {
                    return java.util.Optional.of(id);
                }
            }
        }
        return java.util.Optional.empty();
    }

    private List<Map<String, Object>> listViews(String accessToken, String databaseId) {
        List<Map<String, Object>> views = new ArrayList<>();
        try {
            String url = UriComponentsBuilder.fromHttpUrl(NOTION_VIEWS_URL)
                    .queryParam("database_id", databaseId)
                    .build()
                    .toUriString();
            ResponseEntity<Map> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    new HttpEntity<>(notionViewHeaders(accessToken)),
                    Map.class
            );
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return views;
            }
            Object resultsObj = response.getBody().get("results");
            if (!(resultsObj instanceof List<?> results)) {
                return views;
            }
            for (Object item : results) {
                if (!(item instanceof Map<?, ?> raw)) {
                    continue;
                }
                String id = asString(raw.get("id"));
                if (id == null || id.isBlank()) {
                    continue;
                }
                retrieveView(accessToken, id).ifPresent(views::add);
            }
        } catch (Exception e) {
            log.warn("Failed to list Notion views for databaseId={}: {}", databaseId, e.getMessage());
        }
        return views;
    }

    private java.util.Optional<Map<String, Object>> retrieveView(String accessToken, String viewId) {
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_VIEWS_URL + "/" + viewId,
                    HttpMethod.GET,
                    new HttpEntity<>(notionViewHeaders(accessToken)),
                    Map.class
            );
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = response.getBody();
                return java.util.Optional.of(body);
            }
        } catch (Exception ignored) {
        }
        return java.util.Optional.empty();
    }

    private void deleteDefaultTableViews(String accessToken, String databaseId, String keepViewId) {
        for (Map<String, Object> view : listViews(accessToken, databaseId)) {
            String id = asString(view.get("id"));
            if (id == null || id.equals(keepViewId)) {
                continue;
            }
            if (!"table".equals(asString(view.get("type")))) {
                continue;
            }
            if (!"Default view".equals(asString(view.get("name")))) {
                continue;
            }
            try {
                restTemplate.exchange(
                        NOTION_VIEWS_URL + "/" + id,
                        HttpMethod.DELETE,
                        new HttpEntity<>(notionViewHeaders(accessToken)),
                        Map.class
                );
            } catch (Exception e) {
                log.warn("Failed to delete default Notion table view id={}: {}", id, e.getMessage());
            }
        }
    }

    /**
     * Notion에 일정용 database를 새로 생성한다 (Name·Date 속성 — sync와 동일).
     *
     * @param parentPageId null 이면 search 로 첫 page 사용
     */
    public NotionCalendarTargetResponse createCalendarDatabase(String accessToken, String name, String parentPageId) {
        if (parentPageId == null || parentPageId.isBlank()) {
            java.util.Optional<NotionCalendarTargetResponse> existing = findAccessibleNameDateDatabase(accessToken);
            if (existing.isPresent()) {
                ensureCalendarView(accessToken, existing.get().getId(), false);
                return existing.get();
            }
        }

        NotionCalendarTargetResponse created =
                createNameDateDatabase(accessToken, name, parentPageId, DEFAULT_CALENDAR_DATABASE_NAME);
        ensureCalendarView(accessToken, created.getId(), true);
        return created;
    }

    /**
     * Notion에 회의록 export용 database를 새로 생성한다 (Name·Date 속성 — 캘린더와 동일).
     *
     * @param parentPageId null 이면 search 로 첫 page 사용
     */
    public NotionCalendarTargetResponse createMeetingNotesDatabase(String accessToken, String name, String parentPageId) {
        return createNameDateDatabase(accessToken, name, parentPageId, DEFAULT_MEETING_NOTES_DATABASE_NAME);
    }

    private NotionCalendarTargetResponse createNameDateDatabase(String accessToken,
                                                                String name,
                                                                String parentPageId,
                                                                String defaultName) {
        try {
            String dbName = (name == null || name.isBlank()) ? defaultName : name.trim();
            String resolvedParentPageId = resolveParentPageId(accessToken, parentPageId);

            Map<String, Object> parent = Map.of(
                    "type", "page_id",
                    "page_id", resolvedParentPageId
            );

            Map<String, Object> titleBlock = Map.of(
                    "type", "text",
                    "text", Map.of("content", dbName)
            );

            Map<String, Object> properties = new HashMap<>();
            properties.put(CALENDAR_TITLE_PROPERTY, Map.of("title", new HashMap<>()));
            properties.put(CALENDAR_DATE_PROPERTY, Map.of("date", new HashMap<>()));

            Map<String, Object> body = new HashMap<>();
            body.put("parent", parent);
            body.put("title", List.of(titleBlock));
            body.put("properties", properties);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, notionHeaders(accessToken));
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_DATABASES_URL,
                    HttpMethod.POST,
                    request,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.warn("Notion create database failed. status={}, body={}", response.getStatusCode(), response.getBody());
                throw new BusinessException(ErrorCode.NOTION_CALENDAR_CREATE_FAILED);
            }

            Map<String, Object> responseBody = response.getBody();
            return mapDatabaseResult(responseBody)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOTION_CALENDAR_CREATE_FAILED));
        } catch (BusinessException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Notion create database API error: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.NOTION_CALENDAR_CREATE_FAILED, e);
        } catch (Exception e) {
            log.error("Error while creating Notion calendar database: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.NOTION_CALENDAR_CREATE_FAILED, e);
        }
    }

    private String resolveParentPageId(String accessToken, String parentPageId) {
        if (parentPageId != null && !parentPageId.isBlank()) {
            return parentPageId.trim();
        }
        return searchFirstAccessiblePageId(accessToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTION_CALENDAR_CREATE_FAILED));
    }

    private java.util.Optional<String> searchFirstAccessiblePageId(String accessToken) {
        Map<String, Object> body = new HashMap<>();
        body.put("filter", Map.of("value", "page", "property", "object"));
        body.put("page_size", 20);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, notionHeaders(accessToken));
        ResponseEntity<Map> response = restTemplate.exchange(
                NOTION_SEARCH_URL,
                HttpMethod.POST,
                request,
                Map.class
        );

        if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            return java.util.Optional.empty();
        }

        Object resultsObj = response.getBody().get("results");
        if (!(resultsObj instanceof List<?> results)) {
            return java.util.Optional.empty();
        }

        for (Object item : results) {
            if (!(item instanceof Map<?, ?> raw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> entry = (Map<String, Object>) raw;
            if (!"page".equals(asString(entry.get("object"))) || Boolean.TRUE.equals(entry.get("archived"))) {
                continue;
            }
            String id = asString(entry.get("id"));
            if (id != null && !id.isBlank()) {
                return java.util.Optional.of(id);
            }
        }
        return java.util.Optional.empty();
    }

    /**
     * 등록된 calendar database ID 로 Notion DB 제목 조회 (status 화면용).
     * 실패 시 null 반환 — status API 전체는 실패하지 않음.
     */
    public String fetchDatabaseName(String accessToken, String databaseId) {
        if (databaseId == null || databaseId.isBlank()) {
            return null;
        }
        try {
            HttpEntity<Void> request = new HttpEntity<>(notionHeaders(accessToken));
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_DATABASES_URL + databaseId.trim(),
                    HttpMethod.GET,
                    request,
                    Map.class
            );
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String name = extractTitle(response.getBody().get("title"));
                return name.isBlank() ? null : name;
            }
        } catch (Exception e) {
            log.warn("Failed to fetch Notion database name for id={}: {}", databaseId, e.getMessage());
        }
        return null;
    }

    private HttpHeaders notionHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);
        headers.set("Notion-Version", notionVersion);
        return headers;
    }

    private HttpHeaders notionViewHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);
        headers.set("Notion-Version", NOTION_VIEW_VERSION);
        return headers;
    }

    private String extractTitle(Object titleObj) {
        if (!(titleObj instanceof List<?> titleList)) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Object block : titleList) {
            if (block instanceof Map<?, ?> raw) {
                @SuppressWarnings("unchecked")
                Map<String, Object> part = (Map<String, Object>) raw;
                Object textObj = part.get("plain_text");
                if (textObj == null && part.get("text") instanceof Map<?, ?> textMap) {
                    textObj = ((Map<?, ?>) textMap).get("content");
                }
                if (textObj != null) {
                    sb.append(textObj);
                }
            }
        }
        return sb.toString().trim();
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public String syncTaskInNotion(Task task, String accessToken, String databaseId) {
        if (task == null || task.getDueDate() == null) {
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED);
        }

        try {
            ensureCalendarView(accessToken, databaseId, true);

            String pageId = task.getNotionPageId();
            if (pageId == null || pageId.isBlank()) {
                pageId = findExistingTaskPageId(task, accessToken, databaseId).orElse(null);
            }

            if (pageId != null && !pageId.isBlank()) {
                try {
                    return updateTaskPage(task, accessToken, pageId);
                } catch (HttpClientErrorException e) {
                    if (e.getStatusCode() != HttpStatus.NOT_FOUND) {
                        throw e;
                    }
                    log.warn("Notion task page not found. taskId={}, pageId={}", task.getId(), pageId);
                }
            }

            return createTaskPage(task, accessToken, databaseId);
        } catch (BusinessException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Notion API error while syncing task: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        } catch (Exception e) {
            log.error("Error while syncing Notion task: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        }
    }

    public Optional<String> archiveTaskInNotion(Task task, String accessToken, String databaseId) {
        if (task == null) {
            return Optional.empty();
        }

        try {
            String pageId = task.getNotionPageId();
            if (pageId == null || pageId.isBlank()) {
                pageId = findExistingTaskPageId(task, accessToken, databaseId).orElse(null);
            }
            if (pageId == null || pageId.isBlank()) {
                return Optional.empty();
            }

            archivePageInNotion(pageId, accessToken);
            return Optional.of(pageId);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                log.warn("Notion task page already missing. taskId={}, pageId={}", task.getId(), task.getNotionPageId());
                return Optional.empty();
            }
            log.error("Notion API error while archiving task: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error while archiving Notion task: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        }
    }

    private String createTaskPage(Task task, String accessToken, String databaseId) {
        HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(
                buildTaskNotionPageRequest(task, databaseId),
                notionHeaders(accessToken)
        );
        ResponseEntity<Map> response = restTemplate.exchange(
                NOTION_PAGES_URL,
                HttpMethod.POST,
                requestEntity,
                Map.class
        );

        if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
            String id = asString(response.getBody().get("id"));
            if (id != null && !id.isBlank()) {
                return id;
            }
        }

        log.warn("Failed to create Notion task. status={}, body={}", response.getStatusCode(), response.getBody());
        throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED);
    }

    private String updateTaskPage(Task task, String accessToken, String pageId) {
        Map<String, Object> body = new HashMap<>();
        body.put("properties", buildTaskProperties(task));

        ResponseEntity<Map> response = restTemplate.exchange(
                NOTION_PAGES_URL + "/" + pageId,
                HttpMethod.PATCH,
                new HttpEntity<>(body, notionHeaders(accessToken)),
                Map.class
        );

        if (response.getStatusCode().is2xxSuccessful()) {
            String responsePageId = response.getBody() == null ? null : asString(response.getBody().get("id"));
            return responsePageId == null || responsePageId.isBlank() ? pageId : responsePageId;
        }

        log.warn("Failed to update Notion task. status={}, body={}", response.getStatusCode(), response.getBody());
        throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED);
    }

    private void archivePageInNotion(String pageId, String accessToken) {
        Map<String, Object> body = Map.of("archived", true);
        ResponseEntity<Map> response = restTemplate.exchange(
                NOTION_PAGES_URL + "/" + pageId,
                HttpMethod.PATCH,
                new HttpEntity<>(body, notionHeaders(accessToken)),
                Map.class
        );

        if (!response.getStatusCode().is2xxSuccessful()) {
            log.warn("Failed to archive Notion page. status={}, body={}", response.getStatusCode(), response.getBody());
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED);
        }
    }

    private Map<String, Object> buildTaskNotionPageRequest(Task task, String databaseId) {
        Map<String, Object> body = new HashMap<>();
        body.put("parent", Map.of("database_id", databaseId));
        body.put("properties", buildTaskProperties(task));
        return body;
    }

    private Map<String, Object> buildTaskProperties(Task task) {
        Map<String, Object> properties = new HashMap<>();
        Map<String, Object> titleText = Map.of(
                "type", "text",
                "text", Map.of("content", task.getTitle())
        );
        properties.put(CALENDAR_TITLE_PROPERTY, Map.of("title", List.of(titleText)));

        Map<String, Object> date = new HashMap<>();
        date.put("start", task.getDueDate().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        properties.put(CALENDAR_DATE_PROPERTY, Map.of("date", date));
        return properties;
    }

    private Optional<String> findExistingTaskPageId(Task task, String accessToken, String databaseId) {
        if (task.getTitle() == null || task.getTitle().isBlank() || task.getDueDate() == null) {
            return Optional.empty();
        }

        try {
            Map<String, Object> body = new HashMap<>();
            body.put("page_size", 20);
            body.put("filter", Map.of(
                    "property", CALENDAR_TITLE_PROPERTY,
                    "title", Map.of("equals", task.getTitle())
            ));

            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_DATABASES_URL + databaseId + "/query",
                    HttpMethod.POST,
                    new HttpEntity<>(body, notionHeaders(accessToken)),
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return Optional.empty();
            }

            Object resultsObj = response.getBody().get("results");
            if (!(resultsObj instanceof List<?> results)) {
                return Optional.empty();
            }

            String taskDate = task.getDueDate().toLocalDate().toString();
            for (Object item : results) {
                if (!(item instanceof Map<?, ?> raw)) {
                    continue;
                }
                if (Boolean.TRUE.equals(raw.get("archived"))) {
                    continue;
                }
                if (!taskDate.equals(extractPageDateKey(raw))) {
                    continue;
                }
                String id = asString(raw.get("id"));
                if (id != null && !id.isBlank()) {
                    return Optional.of(id);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to find existing Notion task page. taskId={}, error={}", task.getId(), e.getMessage());
        }
        return Optional.empty();
    }

    private String extractPageDateKey(Map<?, ?> page) {
        Object propertiesObj = page.get("properties");
        if (!(propertiesObj instanceof Map<?, ?> properties)) {
            return null;
        }
        Object datePropertyObj = properties.get(CALENDAR_DATE_PROPERTY);
        if (!(datePropertyObj instanceof Map<?, ?> dateProperty)) {
            return null;
        }
        Object dateObj = dateProperty.get("date");
        if (!(dateObj instanceof Map<?, ?> date)) {
            return null;
        }
        String start = asString(date.get("start"));
        if (start == null || start.length() < 10) {
            return null;
        }
        return start.substring(0, 10);
    }

    /**
     * Event 엔티티 정보를 기반으로 Notion 캘린더(데이터베이스)에 일정을 생성한다.
     *
     * @param event       생성할 이벤트
     * @param accessToken Notion OAuth 액세스 토큰
     * @param databaseId  일정을 생성할 노션 데이터베이스 ID (유저별로 등록한 값)
     * @return 생성된 Notion 페이지 ID
     */
    public String createEventInNotion(Event event, String accessToken, String databaseId) { //Event 엔티티를 기반으로 Notion 캘린더에 일정을 생성
        try {
            HttpHeaders headers = notionHeaders(accessToken); //요청 헤더 구성 (JSON, Bearer 토큰, Notion-Version)

            // Event 엔티티를 Notion 페이지 생성 요청 바디로 변환
            ensureCalendarView(accessToken, databaseId, true);
            Map<String, Object> body = buildNotionPageRequest(event, databaseId);

            // 최종 HTTP 요청 엔티티
            HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            // Notion 페이지 생성 API 호출
            //RestTemplate 로 POST https://api.notion.com/v1/pages 호출
            ResponseEntity<Map> response = restTemplate.exchange(
                    NOTION_PAGES_URL,
                    HttpMethod.POST,
                    requestEntity,
                    Map.class
            );

            // 성공 응답이며 바디가 존재하면, 생성된 페이지의 id 를 추출
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object id = response.getBody().get("id");
                if (id instanceof String) {
                    return (String) id;
                }
            }

            // 이 시점까지 오면 실패로 간주
            log.warn("Failed to create Notion event. status={}, body={}", response.getStatusCode(), response.getBody());
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED);
        } catch (BusinessException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Notion API error while creating event: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        } catch (Exception e) {
            log.error("Error while creating Notion event: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.NOTION_EVENT_CREATE_FAILED, e);
        }
    }

    // Event 엔티티를 Notion 페이지 생성용 요청 바디(Map 구조)로 변환
    private Map<String, Object> buildNotionPageRequest(Event event, String databaseId) {
        Map<String, Object> body = new HashMap<>(); //Notion 페이지 생성용 요청 바디(Map 구조), 리턴할 Map 생성

        // 어떤 데이터베이스에 페이지를 생성할지 설정 (유저별 등록 DB)
        Map<String, Object> parent = Map.of(
                "database_id", databaseId
        );

        Map<String, Object> properties = new HashMap<>(); //properties 는 Notion 페이지 생성용 요청 바디(Map 구조)의 속성들을 저장할 Map

        // 제목·날짜만 전송 (노션 DB 컬럼 이름이 "Name", "Date"인 경우)
        Map<String, Object> titleText = Map.of(
                "type", "text",
                "text", Map.of("content", event.getTitle())
        );
        properties.put("Name", Map.of(
                "title", new Object[]{titleText}
        ));

        DateTimeFormatter formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
        Map<String, Object> date = new HashMap<>();
        date.put("start", event.getStartAt().format(formatter)); //시작일시 설정
        date.put("end", event.getEndAt().format(formatter)); //종료일시 설정
        //properties.Date 에 시작/종료 날짜
        properties.put("Date", Map.of("date", date)); // Date 속성에 시작일시와 종료일시 설정

        // 최종 body 에 parent, properties 를 설정
        body.put("parent", parent);
        body.put("properties", properties);
        return body;
    }
}

