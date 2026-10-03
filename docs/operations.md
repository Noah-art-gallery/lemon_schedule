# 실행과 배포

Node.js 22 이상과 npm을 준비한 뒤 저장소 루트에서 `npm ci`를 실행한다. `.env.local`에 `.env.example`의 공개 Supabase URL·publishable key를 넣으면 실제 계정 모드가 되고, 둘 다 비어 있는 비프로덕션 환경에서는 `npm run dev:demo`로 샘플 화면을 확인한다.

현재 앱은 서울 리전의 전용 `lemontodolist` 프로젝트 (`jthltqvcoezawoplaxkd`)를 사용한다. 공개 URL은 `https://jthltqvcoezawoplaxkd.supabase.co`이고 `.env.local`은 Git에서 제외되므로 다른 개발 환경에서는 공개 키를 따로 설정한다. 10개 migration과 발송 함수 v1은 플러그인으로 적용했다. 2026-10-03 이 개발 환경의 CLI 로그인을 완료했으며 프로젝트 link는 별도다. 프로젝트별 CLI 작업에는 명시적인 `--project-ref`를 사용한다. 원격 migration history는 로컬 파일의 버전과 일치한다.

2026-10-03 Android Firebase 프로젝트 `lemon-todo-69959`의 패키지 `com.lemonschedule.app`을 확인해 `android/app/google-services.json`을 저장했다. 이 파일은 Git에서 제외되므로 다른 개발 환경에서는 별도로 준비한다. 서비스 계정 원본은 저장소·앱에 복사하지 않고 `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`만 원격 Edge Function secrets에 등록해 원본 값과 원격 해시의 일치를 확인했다. 64자 무작위 `PUSH_WEBHOOK_SECRET`도 원격에 등록해 해시 일치를 확인했다. 비밀 헤더가 없는 요청은 401, 올바른 헤더와 잘못된 이벤트는 400 `INVALID_EVENT`로 검증했으며 비밀값은 앱·저장소·채팅에 남기지 않았다. Database Webhook 연결도 완료했다. `private.enqueue_completion_push()`가 `notifications` INSERT마다 Vault 설정을 읽어 pg_net으로 ID만 비동기 POST한다. 실제 DB INSERT 스모크는 HTTP 200 `NOT_COMPLETION`을 확인했고 테스트 계정·알림은 정리했다. APNs 자격과 실제 휴대폰 푸시 수신 검증은 남아 있다.

현재 회원가입은 이메일·비밀번호 입력 후 즉시 세션을 받는 계약이다. 2026-10-03 사용자가 [프로젝트 인증 설정](https://supabase.com/dashboard/project/jthltqvcoezawoplaxkd/auth/providers)의 Confirm email을 끈 뒤 실제 가입·로그인 검증을 완료했다. 새 프로젝트도 즉시 가입 계약을 사용할 경우 같은 옵션을 끈다. 이메일 인증을 유지하려면 가입 대기·확인 흐름을 먼저 추가한다. Supabase 기본 가입·로그인 설정은 로컬 `config.toml`만 수정해도 클라우드에 자동 반영되지 않는다.

현재 환경에서 실제 통합 검사는 PowerShell에서 `$env:RUN_SUPABASE_INTEGRATION = '1'`을 설정한 뒤 `node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/supabase/supabase.integration.test.ts --environment node`로 실행했다. 이 검사는 실제 Auth 테스트 계정을 생성하므로 완료 후 해당 검사에서 생성된 UUID·이메일을 확인하고 전역 로그아웃과 계정 정리를 수행한다. 사용자 계정이나 생성 시점만으로 넓게 삭제하지 않는다.

개발 서버는 `npm run dev`로 열고, 정적 산출물은 `npm run build`가 `out`에 만든다. 검증은 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`, `npm run test:db-contract`, `npm run test:e2e` 순서로 수행한다. E2E는 먼저 별도 터미널에서 `npm run dev:demo` 서버를 띄운 뒤 실행한다. `test:e2e:external`은 같은 동작을 하는 기존 별칭이다. Windows에서 Playwright가 직접 띄운 Next 개발 서버의 프로세스 정리가 멈추는 현상을 피하려고 서버를 별도로 관리한다.

Supabase migration은 연결된 프로젝트에 순서대로 적용하고, 로컬 데이터베이스를 사용할 수 있을 때 `npm run db:start`, `npm run db:reset`, `npm run test:db`를 실행한다. Docker 또는 로컬 Supabase가 없으면 해당 세 검사는 미실행 사유를 기록한다. 원격 pgTAP 검증은 테스트 SQL의 트랜잭션과 마지막 rollback을 유지하며 별도 결과로 기록한다. 이미 적용된 버전과 파일 내용을 확인한 뒤 미적용 migration만 순서대로 적용한다.

Capacitor 준비는 정적 빌드 후 `npm run cap:sync`로 웹 자산을 동기화한다. Android 프로젝트가 생성된 환경에서는 `npm run cap:android`로 Android Studio를 열고 실제 기기 알림·권한을 확인한다. iOS 서명과 APNs 자격은 macOS와 Apple 계정이 필요하므로 Windows에서는 구성 파일과 동기화까지만 확인한다.

## Android 최초 실기기 설치

2026-10-03 이 PC에서 `C:/Program Files/Android/Android Studio/bin/studio64.exe`, 사용자 LocalAppData 아래 `Android/Sdk`와 `platform-tools/adb.exe`, PATH의 Java를 확인했다. 설치 파일의 존재만 확인한 것이며 SDK·JDK 버전 호환성, Gradle 빌드·APK 설치 성공을 의미하지 않는다.

1. 폰의 개발자 옵션에서 USB 디버깅을 켜고 데이터 전송 가능한 USB 케이블로 연결한다. 폰에 표시되는 디버깅 허용 창은 사용자가 직접 승인한다.
2. SDK의 `platform-tools/adb.exe devices`로 대상이 `device`인지 확인한다. `unauthorized`이면 폰의 승인부터 처리하고, 여러 대상이 있으면 설치할 기기를 명시한다. Windows 드라이버가 필요한 기기는 제조사 드라이버를 준비한다.
3. 저장소 루트에서 아래 명령을 순서대로 실행한다. 실패하면 다음 단계로 넘어가지 않는다.

```powershell
npm run build
npm run cap:sync
npm run cap:android
```

4. Android Studio에서 Gradle 동기화를 완료하고 연결된 기기를 선택한 뒤 Run으로 개발용 앱을 설치한다. Gradle의 JDK·SDK 오류가 있으면 실제 버전을 확인해 해결한다. 앱 ID는 `com.lemonschedule.app`이다.
5. 앱에서 실제 계정으로 로그인하고 알림 권한을 허용해 기기 토큰이 등록되는지 확인한다. 휴대폰 완료 알림은 아래 두 계정·두 기기 절차로 검증한다. 수신 앱은 백그라운드로 두되 강제 종료하지 않는다.

Google Play 배포용 서명·AAB와 iOS 설치는 별도 작업이다. 실기기에서 동작하지 않은 항목은 검증 완료로 기록하지 않는다.

## 휴대폰 완료 알림 연결

휴대폰 알림은 앱 안 `task_completed` 알림이 먼저 저장된 뒤 비동기 발송된다. 발송 실패는 완료·포인트·앱 안 알림을 되돌리지 않는다. 서버는 알림/기기 조합마다 `push_delivery_attempts`를 한 번만 선점하고 `sent` 또는 `failed`를 기록한다. 이 장부는 사용자에게 공개되지 않는다. 네트워크 발송 직후 서버가 중단되는 경우 중복 방지를 우선하므로 자동 재전송하지 않는다.

1. 이 저장소 전용 Supabase 프로젝트를 만들고 migration을 순서대로 적용한다. 다른 프로젝트의 데이터를 재사용하지 않는다.
2. `supabase functions deploy send-completion-push`로 함수를 배포한다. `supabase/config.toml`은 이 웹훅 함수만 `verify_jwt = false`로 지정하며, 함수 내부는 32자 이상 `PUSH_WEBHOOK_SECRET` 헤더 검사를 반드시 수행한다.
3. 프로젝트의 Edge Function secrets에 `PUSH_WEBHOOK_SECRET`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX`를 등록한다. Supabase가 제공하는 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`도 함수에서 사용한다. 비밀값을 `NEXT_PUBLIC_` 변수, 저장소, 모바일 프로젝트에 넣지 않는다.
4. 이 프로젝트는 migration으로 `public.notifications`의 INSERT 전용 `send_completion_push` 트리거를 연결했다. 같은 목적의 대시보드 웹훅을 중복 생성하지 않는다. Vault의 `lemon_push_function_url`에는 함수 HTTPS URL, `lemon_push_webhook_secret`에는 Edge secrets의 `PUSH_WEBHOOK_SECRET`과 같은 값을 등록한다. 비밀값은 migration에 넣지 않는다. 회전할 때는 Edge secret과 Vault 양쪽을 함께 갱신한다. 비공개 트리거가 `x-lemon-webhook-secret` 헤더와 이벤트·알림 ID만 비동기 POST하고 다른 알림 종류는 Edge Function이 건너뛴다.
5. Android용 Firebase 앱 ID는 `com.lemonschedule.app`으로 등록하고 `google-services.json`을 `android/app/`에 둔다. 이 파일은 프로젝트별 설정이므로 공개 저장소에 올리기 전 검토한다. iOS에서는 Apple Developer Push Notifications capability와 올바른 provisioning profile/APNs 키를 설정한다. `AppDelegate.swift`에는 Capacitor 토큰 전달 메서드가 들어 있다. 개발용 빌드는 `APNS_USE_SANDBOX=true`, 배포용은 `false`로 맞춘다.
6. 두 계정·두 기기로 연결을 수락한 뒤 최초 완료를 한 번 만든다. 수신자의 앱 안 알림, `push_delivery_attempts` 한 행/기기, 실제 알림 표시와 탭 시 친구 완료 항목 이동을 확인한다. 재완료에는 새 완료 알림과 푸시 시도가 없어야 한다. 권한 거부·로그아웃·연결 해제·실패 상태도 따로 검사한다.

`npm run typecheck:edge`는 Edge Function의 정적 타입만 확인한다. Docker와 실제 Firebase/APNs 자격이 없는 개발 환경에서는 런타임·실기기 발송 검사를 통과로 기록하지 않는다.
