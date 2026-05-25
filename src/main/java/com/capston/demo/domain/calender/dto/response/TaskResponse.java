package com.capston.demo.domain.calender.dto.response;

import com.capston.demo.domain.calender.entity.Task;
import com.capston.demo.domain.calender.entity.TaskSource;
import com.capston.demo.domain.calender.entity.TaskStatus;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class TaskResponse {

    private final Long id;
    private final Long workspaceId;
    private final Long meetingId;
    private final Long assigneeId;
    private final String assigneeName;
    private final Long createdBy;
    private final String title;
    private final String description;
    private final LocalDateTime dueDate;
    private final TaskStatus status;
    private final TaskSource source;
    private final LocalDateTime createdAt;
    private final String notionPageId;
    private final LocalDateTime notionSyncedAt;

    public TaskResponse(Task task) {
        this.id = task.getId();
        this.workspaceId = task.getWorkspaceId();
        this.meetingId = task.getMeetingId();
        this.assigneeId = task.getAssigneeId();
        this.assigneeName = task.getAssigneeName();
        this.createdBy = task.getCreatedBy();
        this.title = task.getTitle();
        this.description = task.getDescription();
        this.dueDate = task.getDueDate();
        this.status = task.getStatus();
        this.source = task.getSource();
        this.createdAt = task.getCreatedAt();
        this.notionPageId = task.getNotionPageId();
        this.notionSyncedAt = task.getNotionSyncedAt();
    }
}
