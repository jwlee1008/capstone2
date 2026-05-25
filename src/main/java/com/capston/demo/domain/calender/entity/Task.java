package com.capston.demo.domain.calender.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "tasks")
@Getter
@Setter
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long workspaceId;

    private Long assigneeId;

    @Column(name = "assignee_name", length = 100)
    private String assigneeName;

    private Long createdBy;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private LocalDateTime dueDate;

    @Enumerated(EnumType.STRING)
    private TaskStatus status = TaskStatus.TODO;

    @Enumerated(EnumType.STRING)
    private TaskSource source = TaskSource.MANUAL;

    private Long meetingId;

    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "notion_page_id", length = 100)
    private String notionPageId;

    private LocalDateTime notionSyncedAt;
}

