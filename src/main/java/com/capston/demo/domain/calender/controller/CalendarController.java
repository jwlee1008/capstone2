package com.capston.demo.domain.calender.controller;


import com.capston.demo.domain.calender.controllerDocs.CalendarControllerDocs;
import com.capston.demo.domain.calender.dto.request.NotionSyncRequestDto;
import com.capston.demo.domain.calender.entity.Event;
import com.capston.demo.domain.calender.entity.Task;
import com.capston.demo.domain.calender.repository.EventRepository;
import com.capston.demo.domain.calender.repository.TaskRepository;
import com.capston.demo.domain.calender.service.NotionCalendarService;
import com.capston.demo.domain.user.entity.User;
import com.capston.demo.domain.user.repository.UserNotionAccountRepository;
import com.capston.demo.domain.user.repository.WorkspaceMemberRepository;
import com.capston.demo.global.security.CustomUserDetails;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
@Slf4j
public class CalendarController implements CalendarControllerDocs {

    // 이벤트를 조회/저장하는 JPA 리포지토리
    private final EventRepository eventRepository;
    private final TaskRepository taskRepository;
    // Event → Notion 페이지 생성 로직을 담당하는 서비스
    private final NotionCalendarService notionCalendarService;
    // 유저별로 연동된 Notion 계정 정보를 조회하는 리포지토리
    private final UserNotionAccountRepository userNotionAccountRepository;
    // 유저가 특정 워크스페이스의 멤버인지 확인하기 위한 리포지토리
    private final WorkspaceMemberRepository workspaceMemberRepository;

    /**
     * 단일 Event를 Notion 캘린더에 동기화하는 엔드포인트.
     * - 현재 로그인한 사용자와 연동된 Notion 계정이 있어야만 동작한다.
     */
    @PostMapping("/events/{eventId}/notion-sync")
    public ResponseEntity<?> syncEventToNotion(
            @PathVariable Long eventId
    ) {
        // SecurityContext에서 인증 정보(현재 로그인 사용자)를 가져옴
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) {
            // 인증 정보가 없거나 예상한 타입이 아니면 401 반환
            return ResponseEntity.status(401).body("Authentication required");
        }

        // CustomUserDetails에서 우리 서비스의 userId 추출
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Long userId = userDetails.getUserId();

        return eventRepository.findById(eventId)
                .map(event -> {
                    // 사용자가 이 이벤트가 속한 워크스페이스의 멤버인지 확인
                    Long workspaceId = event.getWorkspaceId();
                    if (workspaceId == null || !workspaceMemberRepository.existsByWorkspace_IdAndUser_Id(workspaceId, userId)) { //사용자가 이 이벤트가 속한 워크스페이스의 멤버인지 확인
                        return ResponseEntity.status(403).body("User is not a member of the workspace for this event");
                    }

                    // 유저의 Notion 연동정보(UserNotionAccount) 조회
                    return userNotionAccountRepository.findByUser(buildUserRef(userId))
                            .map(link -> {
                                if (link.getCalendarDatabaseId() == null || link.getCalendarDatabaseId().isBlank()) {
                                    return ResponseEntity.badRequest().body(Map.of("error", "캘린더로 사용할 노션 데이터베이스를 먼저 등록해주세요. PUT /api/oauth2/notion/calendar-database 를 사용하세요."));
                                }
                                //Event 엔티티를 기반으로 Notion 캘린더에 일정을 생성
                                String notionPageId = notionCalendarService.createEventInNotion(event, link.getAccessToken(), link.getCalendarDatabaseId()); //event 는 우리 Event, accessToken 은 노션 OAuth 토큰, databaseId 는 유저가 지정한 캘린더용 노션 DB ID
                                return ResponseEntity.ok().body(
                                        Map.of(
                                                "eventId", eventId, //이벤트 ID
                                                "notionPageId", notionPageId //생성된 Notion 페이지 ID
                                        )
                                ); //생성된 Notion 페이지 ID 반환
                            })
                            .orElseGet(() -> ResponseEntity.status(403).body(Map.of("error", "Notion account is not linked for this user"))); //Notion 계정이 연동되지 않은 경우 403 Forbidden 반환
                })
                // 해당 eventId 의 Event 가 없으면 404 반환
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * 특정 워크스페이스에 속한 모든 이벤트를 한 번에 Notion 캘린더와 동기화한다.
     */
    @PostMapping("/workspaces/{workspaceId}/notion-sync")
    public ResponseEntity<?> syncWorkspaceEventsToNotion(
            @PathVariable Long workspaceId
    ) {
        // SecurityContext에서 인증 정보(현재 로그인 사용자)를 가져옴
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) {
            return ResponseEntity.status(401).body("Authentication required");
        }

        // CustomUserDetails에서 우리 서비스의 userId 추출
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Long userId = userDetails.getUserId();

        // 사용자가 이 워크스페이스의 멤버인지 확인
        if (!workspaceMemberRepository.existsByWorkspace_IdAndUser_Id(workspaceId, userId)) {
            return ResponseEntity.status(403).body("User is not a member of this workspace");
        }

        // 현재 유저와 연동된 Notion 계정이 있는지 확인
        return userNotionAccountRepository.findByUser(buildUserRef(userId))
                .map(link -> {
                    if (link.getCalendarDatabaseId() == null || link.getCalendarDatabaseId().isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "캘린더로 사용할 노션 데이터베이스를 먼저 등록해주세요. PUT /api/oauth2/notion/calendar-database 를 사용하세요."));
                    }
                    List<Event> events = eventRepository.findByWorkspaceIdAndCreatedBy(workspaceId, userId);
                    if (events.isEmpty()) {
                        return ResponseEntity.ok().body(Map.of(
                                "workspaceId", workspaceId,
                                "syncedCount", 0
                        ));
                    }

                    List<Map<String, Object>> results = events.stream()
                            .map(event -> {
                                String notionPageId = notionCalendarService.createEventInNotion(event, link.getAccessToken(), link.getCalendarDatabaseId());
                                return Map.<String, Object>of(
                                        "eventId", event.getId(),
                                        "notionPageId", notionPageId
                                );
                            })
                            .toList();

                    return ResponseEntity.ok().body(Map.of(
                            "workspaceId", workspaceId,
                            "syncedCount", results.size(),
                            "results", results
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(403).body(Map.of("error", "Notion account is not linked for this user")));
    }

    /**
     * 특정 워크스페이스에 속한 모든 이벤트를 조회한다.
     * - 현재 로그인한 사용자가 해당 워크스페이스의 멤버인 경우에만 조회 가능하다.
     */
    @GetMapping("/workspaces/{workspaceId}/events")
    public ResponseEntity<?> getWorkspaceEvents( //특정 워크스페이스에 속한 모든 이벤트를 조회
                                                 @PathVariable Long workspaceId
    ) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication(); //SecurityContext에서 인증 정보(현재 로그인 사용자)를 가져옴
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) { //인증 정보가 없거나 예상한 타입이 아니면 401 반환
            return ResponseEntity.status(401).body("Authentication required");
        }

        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal(); //CustomUserDetails에서 우리 서비스의 userId 추출
        Long userId = userDetails.getUserId();

        if (!workspaceMemberRepository.existsByWorkspace_IdAndUser_Id(workspaceId, userId)) { //사용자가 이 워크스페이스의 멤버인지 확인
            return ResponseEntity.status(403).body("User is not a member of this workspace");
        }

        List<Event> events = eventRepository.findByWorkspaceIdAndCreatedBy(workspaceId, userId); //해당 워크스페이스에서 현재 사용자가 생성한 Event 조회
        return ResponseEntity.ok(events);
    }

    /**
     * 여러 Event를 한 번에 Notion 캘린더에 동기화하는 배치 엔드포인트.
     * - 각 이벤트마다 워크스페이스 멤버십을 확인한 뒤, 멤버가 아닌 이벤트는 건너뛴다.
     */
    @PostMapping("/events/notion-sync-batch")
    public ResponseEntity<?> syncEventsToNotionBatch(
            @RequestBody NotionSyncRequestDto request
    ) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication(); //SecurityContext에서 인증 정보(현재 로그인 사용자)를 가져옴
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) { //인증 정보가 없거나 예상한 타입이 아니면 401 반환
            return ResponseEntity.status(401).body("Authentication required");
        }

        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal(); //CustomUserDetails에서 우리 서비스의 userId 추출
        Long userId = userDetails.getUserId();

        // Notion 연동 정보 확인 (없으면 전체 요청 거절)
        return userNotionAccountRepository.findByUser(buildUserRef(userId))
                .map(link -> {
                    if (link.getCalendarDatabaseId() == null || link.getCalendarDatabaseId().isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "캘린더로 사용할 노션 데이터베이스를 먼저 등록해주세요. PUT /api/oauth2/notion/calendar-database 를 사용하세요."));
                    }
                    String accessToken = link.getAccessToken();
                    String databaseId = link.getCalendarDatabaseId();
                    List<Long> eventIds = request.getEventIds();

                    if (eventIds == null || eventIds.isEmpty()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "eventIds must not be empty"));
                    }

                    List<Map<String, Object>> results = eventIds.stream()
                            .map(id -> eventRepository.findById(id)
                                    .map(event -> {
                                        Long workspaceId = event.getWorkspaceId();
                                        if (workspaceId == null || !workspaceMemberRepository.existsByWorkspace_IdAndUser_Id(workspaceId, userId)) {
                                            return Map.<String, Object>of(
                                                    "eventId", id,
                                                    "status", "FORBIDDEN_WORKSPACE"
                                            );
                                        }

                                        String notionPageId = notionCalendarService.createEventInNotion(event, accessToken, databaseId);
                                        return Map.<String, Object>of(
                                                "eventId", id,
                                                "status", "SUCCESS",
                                                "notionPageId", notionPageId
                                        );
                                    })
                                    .orElseGet(() -> Map.<String, Object>of(
                                            "eventId", id,
                                            "status", "NOT_FOUND"
                                    )))
                            .toList();

                    return ResponseEntity.ok(Map.of(
                            "requestedCount", eventIds.size(),
                            "results", results
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(403).body(Map.of("error", "Notion account is not linked for this user")));
    }

    // User 리포지토리를 직접 사용하지 않고도, userId 만으로
    // User 프록시(참조용 객체)를 만들어 JPA 연관관계 조회에 활용하기 위한 헬퍼 메서드
    @PostMapping("/tasks/notion-sync-batch")
    public ResponseEntity<?> syncTasksToNotionBatch(
            @RequestBody NotionSyncRequestDto request
    ) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) {
            return ResponseEntity.status(401).body("Authentication required");
        }

        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Long userId = userDetails.getUserId();

        return userNotionAccountRepository.findByUser(buildUserRef(userId))
                .map(link -> {
                    if (link.getCalendarDatabaseId() == null || link.getCalendarDatabaseId().isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "Notion calendar database is not configured"));
                    }

                    List<Long> taskIds = request.getTaskIds();
                    if (taskIds == null || taskIds.isEmpty()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "taskIds must not be empty"));
                    }

                    String accessToken = link.getAccessToken();
                    String databaseId = link.getCalendarDatabaseId();
                    List<Map<String, Object>> results = taskIds.stream()
                            .map(id -> syncOneTaskToNotion(id, userId, accessToken, databaseId))
                            .toList();
                    long syncedCount = results.stream()
                            .filter(result -> "SUCCESS".equals(result.get("status")))
                            .count();

                    return ResponseEntity.ok(Map.of(
                            "requestedCount", taskIds.size(),
                            "syncedCount", syncedCount,
                            "results", results
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(403).body(Map.of("error", "Notion account is not linked for this user")));
    }

    @DeleteMapping("/tasks/{taskId}/notion-sync")
    public ResponseEntity<?> archiveTaskFromNotion(
            @PathVariable Long taskId
    ) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof CustomUserDetails)) {
            return ResponseEntity.status(401).body("Authentication required");
        }

        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Long userId = userDetails.getUserId();

        Optional<Task> taskOptional = taskRepository.findById(taskId);
        if (taskOptional.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Task task = taskOptional.get();
        if (!canAccessTask(task, userId)) {
            return ResponseEntity.status(403).body(Map.of("error", "User is not a member of the workspace for this task"));
        }

        return userNotionAccountRepository.findByUser(buildUserRef(userId))
                .map(link -> {
                    if (link.getCalendarDatabaseId() == null || link.getCalendarDatabaseId().isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error", "Notion calendar database is not configured"));
                    }

                    Optional<String> archivedPageId = notionCalendarService.archiveTaskInNotion(
                            task,
                            link.getAccessToken(),
                            link.getCalendarDatabaseId()
                    );
                    task.setNotionPageId(null);
                    task.setNotionSyncedAt(null);
                    taskRepository.save(task);

                    Map<String, Object> result = new HashMap<>();
                    result.put("taskId", taskId);
                    result.put("status", archivedPageId.isPresent() ? "ARCHIVED" : "NOT_SYNCED");
                    archivedPageId.ifPresent(pageId -> result.put("notionPageId", pageId));
                    return ResponseEntity.ok(result);
                })
                .orElseGet(() -> ResponseEntity.status(403).body(Map.of("error", "Notion account is not linked for this user")));
    }

    private Map<String, Object> syncOneTaskToNotion(Long taskId, Long userId, String accessToken, String databaseId) {
        Map<String, Object> result = new HashMap<>();
        result.put("taskId", taskId);

        Optional<Task> taskOptional = taskRepository.findById(taskId);
        if (taskOptional.isEmpty()) {
            result.put("status", "NOT_FOUND");
            return result;
        }

        Task task = taskOptional.get();
        if (!canAccessTask(task, userId)) {
            result.put("status", "FORBIDDEN_WORKSPACE");
            return result;
        }

        if (task.getDueDate() == null) {
            result.put("status", "SKIPPED_NO_DUE_DATE");
            return result;
        }

        try {
            String notionPageId = notionCalendarService.syncTaskInNotion(task, accessToken, databaseId);
            task.setNotionPageId(notionPageId);
            task.setNotionSyncedAt(LocalDateTime.now());
            taskRepository.save(task);
            result.put("status", "SUCCESS");
            result.put("notionPageId", notionPageId);
            return result;
        } catch (Exception e) {
            log.warn("Failed to sync task to Notion. taskId={}, error={}", taskId, e.getMessage());
            result.put("status", "FAILED");
            result.put("message", e.getMessage());
            return result;
        }
    }

    private boolean canAccessTask(Task task, Long userId) {
        Long workspaceId = task.getWorkspaceId();
        if (workspaceId != null) {
            return workspaceMemberRepository.existsByWorkspace_IdAndUser_Id(workspaceId, userId);
        }
        return task.getCreatedBy() != null && task.getCreatedBy().equals(userId);
    }

    private User buildUserRef(Long userId) {
        User u = new User();
        u.setId(userId);
        return u;
    }
}

