# MeetFlow Frontend

회의 녹음 업로드, STT 결과 확인, 화자 매핑, AI 요약, 할일 등록, 인앱 캘린더, Notion 내보내기 흐름을 시연하는 React Native 프론트엔드입니다.

## 실행

```bash
npm install
npm run web
```

또는 Expo Go로 확인하려면:

```bash
npm start
```

## 현재 범위

- 백엔드 미연결 상태의 프론트 mock 구현
- 로그인, 워크스페이스 생성, 사용자 초대
- 녹음 파일 업로드 UI와 STT 처리 상태
- 화자A/B/C 매핑 UI
- 화자 이름이 적용된 대화록과 회의 요약
- AI 추출 할일 검토 후 캘린더 등록
- 수동 할일 등록
- 인앱 캘린더 누적 표시
- Notion 캘린더 export mock
