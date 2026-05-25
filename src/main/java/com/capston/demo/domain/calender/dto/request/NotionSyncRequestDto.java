package com.capston.demo.domain.calender.dto.request;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class NotionSyncRequestDto {

    // 여러 Event를 한 번에 동기화할 때 사용할 이벤트 ID 목록
    private List<Long> eventIds;

    private List<Long> taskIds;
}

