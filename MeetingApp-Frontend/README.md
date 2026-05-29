# Meno Frontend

Meno는 me(eting) + no(te)를 뜻합니다. 회의 녹음 업로드, STT 결과 확인, 화자 매핑, AI 요약, 할일 등록, 인앱 캘린더, Notion 내보내기 흐름을 제공하는 React Native 프론트엔드입니다.

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

`npm start`는 맥북 LAN IP를 자동으로 찾아 `EXPO_PUBLIC_API_BASE_URL=http://<맥북-LAN-IP>:8080`을 Expo Go 번들에 주입합니다. Expo CLI 기본 실행이 필요하면 `npm run start:expo`를 사용합니다.

터미널에는 Expo Go OAuth 딥링크도 함께 출력됩니다. 백엔드 OAuth 콜백을 Expo Go로 되돌리려면 백엔드 실행 환경에 출력된 값을 그대로 넣어야 합니다.

```bash
NOTION_LINK_DEEP_LINK=exp://<맥북-LAN-IP>:<Expo-Port>/--/notion/link
APP_NOTION_LINK_DEEP_LINK=exp://<맥북-LAN-IP>:<Expo-Port>/--/notion/link
APP_OAUTH_MOBILE_NOTION_LOGIN_DEEP_LINK=exp://<맥북-LAN-IP>:<Expo-Port>/--/oauth/notion
APP_OAUTH_MOBILE_GOOGLE_DEEP_LINK=exp://<맥북-LAN-IP>:<Expo-Port>/--/oauth/google
```

Notion OAuth는 승인 후 HTTPS 콜백으로 돌아오므로, Expo Go에서 실제 연동을 끝까지 확인하려면 `OAUTH_BASE_URL`이 `localhost`가 아니라 ngrok 같은 HTTPS 터널 주소여야 합니다.

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

`npm start`처럼 프록시 없이 Expo를 직접 실행할 때 주소를 직접 고정해야 하면 아래 값을 사용합니다. Expo Go 실기기는 `localhost` 대신 휴대폰에서 접근 가능한 맥북 LAN IP를 넣어야 합니다. 단, 웹에서 직접 백엔드를 호출하면 백엔드 CORS 설정이 필요할 수 있습니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080
```

## Android 앱 버전 테스트

Android 앱 식별자는 `com.jwlee.meno`입니다. Expo 앱 이름, slug, scheme은 모두 `Meno` / `meno`로 맞춰져 있습니다.

Preview APK 빌드:

```bash
npm run build:android:preview
```

현재 Mac에는 Flutter 개발용 Android toolchain이 이미 준비되어 있어서 `build:android:preview`는 로컬 EAS 빌드로 실행됩니다. 결과 APK는 `dist/meno-preview.apk`에 생성됩니다.

클라우드 빌드가 필요할 때만 아래 명령을 사용합니다.

```bash
npm run build:android:preview:cloud
```

Production AAB 빌드:

```bash
npm run build:android:production
```

EAS를 처음 쓰는 환경에서는 위 명령 중 Expo 로그인, EAS 프로젝트 생성 확인이 한 번 필요할 수 있습니다.

Preview APK는 [eas.json](./eas.json)의 `build.preview.env.EXPO_PUBLIC_API_BASE_URL` 값을 앱에 포함합니다. 현재 기본값은 배포 백엔드 `https://meno-app.shop`입니다.

Standalone APK에서 OAuth 딥링크를 확인하려면 백엔드 실행 환경도 Meno scheme으로 맞춥니다.

```bash
APP_OAUTH_MOBILE_GOOGLE_DEEP_LINK=meno://oauth/google
APP_OAUTH_MOBILE_NOTION_LOGIN_DEEP_LINK=meno://oauth/notion
NOTION_LINK_DEEP_LINK=meno://notion/link
APP_NOTION_LINK_DEEP_LINK=meno://notion/link
```

현재 배포 백엔드가 기존 `meetflow://` 딥링크를 반환할 수 있어 Android 앱은 `meno://`와 `meetflow://`를 모두 받을 수 있게 설정되어 있습니다. 백엔드 환경변수가 Meno scheme으로 반영되면 `meno://`만 사용하면 됩니다.

반복 테스트 흐름:

1. 배포 백엔드 `https://meno-app.shop`이 열리는지 확인합니다.
2. `npm run build:android:preview`로 APK를 빌드합니다.
3. EAS 빌드 URL에서 APK를 내려받아 Android 기기에 설치합니다.
4. 로그인, 회의 생성, 녹음 업로드, 분석, 캘린더/Notion 흐름을 테스트합니다.
5. 피드백을 프론트 코드에 반영한 뒤 preview APK를 다시 빌드합니다.

## 현재 범위

- 백엔드 API 연결: 로그인, 회원가입, 워크스페이스, 회의, 녹음 업로드, STT 요청, 화자 매핑, AI 분석, 할일, 캘린더 내보내기
- 화자 이름이 적용된 대화록과 회의 요약 표시
- AI 추출 할일 검토 및 캘린더 등록
- 수동 할일 등록
- 인앱 캘린더 표시
- Notion 캘린더 export 요청
