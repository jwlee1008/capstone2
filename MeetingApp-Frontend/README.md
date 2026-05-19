# MeetFlow Frontend

회의 녹음 업로드, STT 결과 확인, 화자 매핑, AI 요약, 할일 등록, 인앱 캘린더, Notion 내보내기 흐름을 제공하는 React Native 프론트엔드입니다.

## 실행

```bash
npm install
npm start
```

웹 실행은 `http://localhost:3000` 프록시로 열립니다. 프록시가 `/api` 요청을 백엔드 `http://localhost:8080`으로 넘겨서 로컬 CORS 문제를 피합니다.

터미널에 뜨는 QR 코드를 휴대폰의 Expo Go 앱으로 스캔하면 됩니다. 같은 와이파이에서 LAN 연결이 막히면 터널 모드를 쓰세요.

```bash
npm run start:tunnel
```

## 백엔드 연결

Expo Go에서는 휴대폰의 `localhost`가 PC가 아니라 휴대폰 자신을 가리킵니다. 그래서 네이티브 앱 기본 API 주소는 Expo 개발 서버의 LAN IP를 기준으로 `http://<PC LAN IP>:8080`으로 자동 계산됩니다. 웹 실행에서는 기존처럼 `http://localhost:8080`을 사용합니다.

다른 주소를 쓰려면 `.env`에 아래 값을 넣어 실행하세요.

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080
```

## 현재 범위

- 백엔드 API 연결 시작: 로그인, 회원가입, 워크스페이스, 회의, 녹음 업로드, STT 요청, 화자 매핑, AI 분석, 할일, 캘린더 내보내기
- 화자 이름이 적용된 대화록과 회의 요약 표시
- AI 분석으로 생성된 할일과 직접 등록한 할일을 인앱 캘린더에 표시
- 수동 할일 등록
- 인앱 캘린더 누적 표시
- Notion 캘린더 export 요청
