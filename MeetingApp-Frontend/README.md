# MeetFlow Frontend

회의 녹음 업로드, STT 결과 확인, 화자 매핑, AI 요약, 할일 등록, 인앱 캘린더, Notion 내보내기 흐름을 제공하는 React Native 프론트엔드입니다.

## 실행

```bash
npm install
npm run web
```

또는 Expo Go로 확인하려면:

```bash
npm start
```

## 백엔드 연결

기본 API 주소는 `http://localhost:8080`입니다. 다른 주소를 쓰려면 `.env`에 아래 값을 넣어 실행하세요.

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
```

## 현재 범위

- 백엔드 API 연결 시작: 로그인, 회원가입, 워크스페이스, 회의, 녹음 업로드, STT 요청, 화자 매핑, AI 분석, 할일, 캘린더 내보내기
- 백엔드가 꺼져 있거나 로그인 실패 시 기존 mock 흐름으로 화면 확인 가능
- 화자 이름이 적용된 대화록과 회의 요약 표시
- AI 추출 할일 검토 후 캘린더 등록
- 수동 할일 등록
- 인앱 캘린더 누적 표시
- Notion 캘린더 export 요청
