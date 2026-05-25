# MeetFlow Frontend

회의 녹음 업로드, STT 결과 확인, 화자 매핑, AI 요약, 할일 등록, 인앱 캘린더, Notion 내보내기 흐름을 제공하는 React Native 프론트엔드입니다.

## 실행

```bash
npm install
npm run web
```

`npm run web`은 프론트 프록시를 먼저 띄우고 Expo Web을 뒤에 붙입니다. 브라우저는 터미널에 표시되는 `Frontend proxy` 주소로 접속하면 됩니다.

기본값:

- Frontend proxy: `http://localhost:8081`
- Expo web: `http://localhost:8082`
- Backend: `http://localhost:8080`

이미 사용 중인 포트가 있으면 `npm run web`이 자동으로 다음 빈 포트를 찾아 사용합니다.

Expo Go 또는 직접 Expo 서버를 확인하려면:

```bash
npm start
```

## 백엔드 연결

프록시 실행 시 백엔드 주소를 바꾸려면 `BACKEND_ORIGIN`을 지정합니다.

PowerShell:

```powershell
$env:BACKEND_ORIGIN="http://localhost:8080"
npm run web
```

`.env` 예시:

```bash
BACKEND_ORIGIN=http://localhost:8080
```

`npm start`처럼 프록시 없이 Expo를 직접 실행할 때는 아래 값을 사용합니다. 단, 웹에서 직접 백엔드를 호출하면 백엔드 CORS 설정이 필요할 수 있습니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
```

## 현재 범위

- 백엔드 API 연결: 로그인, 회원가입, 워크스페이스, 회의, 녹음 업로드, STT 요청, 화자 매핑, AI 분석, 할일, 캘린더 내보내기
- 화자 이름이 적용된 대화록과 회의 요약 표시
- AI 추출 할일 검토 및 캘린더 등록
- 수동 할일 등록
- 인앱 캘린더 표시
- Notion 캘린더 export 요청
