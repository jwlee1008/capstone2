export const workspaceMembers = [
  { id: 'u1', name: '김민지', email: 'minji@team.com', role: 'PM' },
  { id: 'u2', name: '이준호', email: 'junho@team.com', role: '서비스 기획' },
  { id: 'u3', name: '박서연', email: 'seoyeon@team.com', role: 'Backend' },
];

export const transcriptSegments = [
  { id: 'seg1', speakerKey: 'A', time: '00:13', text: '이번 주 안에 회의 요약 화면에서 할일을 바로 등록할 수 있어야 합니다.' },
  { id: 'seg2', speakerKey: 'B', time: '00:41', text: '업로드 이후 처리 상태가 보이면 사용자가 기다리는 흐름이 더 명확할 것 같아요.' },
  { id: 'seg3', speakerKey: 'C', time: '01:28', text: '외부 캘린더 연동은 선택 기능으로 두고 인앱 캘린더를 먼저 완성합시다.' },
  { id: 'seg4', speakerKey: 'A', time: '02:04', text: '담당자와 마감일은 제안되더라도 등록 전에 수정할 수 있어야 합니다.' },
];

export const suggestedTasks = [
  { id: 'task1', title: '회의 정리 결과 화면 UI 확정', assignee: '이준호', dueDate: '2026-05-14', source: '회의 기록' },
  { id: 'task2', title: '처리 완료 상태 응답 규격 정리', assignee: '박서연', dueDate: '2026-05-15', source: '회의 기록' },
  { id: 'task3', title: '외부 캘린더 내보내기 범위 결정', assignee: '김민지', dueDate: '2026-05-17', source: '회의 기록' },
];

export const summaryBullets = [
  '녹음 파일 업로드 후 처리 상태와 화자 구분 결과를 사용자에게 보여준다.',
  '화자A, 화자B, 화자C를 워크스페이스 멤버 또는 직접 입력한 이름으로 매핑한다.',
  '제안된 할일은 담당자와 마감일을 검토한 뒤 인앱 캘린더에 등록한다.',
  '외부 캘린더 연동은 선택 기능으로 제공한다.',
];
