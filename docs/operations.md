# 실행과 배포

Node.js 22 이상과 npm을 준비한 뒤 저장소 루트에서 `npm ci`를 실행한다. `.env.local`에 `.env.example`의 공개 Supabase URL·publishable key를 넣으면 실제 계정 모드가 되고, 둘 다 비어 있는 비프로덕션 환경에서는 `npm run dev:demo`로 샘플 화면을 확인한다.

현재 앱은 서울 리전의 전용 `lemontodolist` 프로젝트 (`jthltqvcoezawoplaxkd`)를 사용한다. 공개 URL은 `https://jthltqvcoezawoplaxkd.supabase.co`이고 `.env.local`은 Git에서 제외되므로 다른 개발 환경에서는 공개 키를 따로 설정한다. 8개 migration과 발송 함수 v1은 플러그인으로 적용했으며 CLI 로그인·프로젝트 link는 별도다. 원격 migration history는 로컬 파일의 버전과 일치한다.

현재 회원가입은 이메일·비밀번호 입력 후 즉시 세션을 받는 계약이다. [프로젝트 인증 설정](https://supabase.com/dashboard/project/jthltqvcoezawoplaxkd/auth/providers)의 User Signups에서 Confirm email을 끄고 저장해야 이 계약으로 테스트할 수 있다. 이메일 인증을 유지하려면 가입 대기·확인 흐름을 먼저 추가한다. Supabase 기본 가입·로그인 설정은 로컬 `config.toml`만 수정해도 클라우드에 자동 반영되지 않는다.

개발 서버는 `npm run dev`로 열고, 정적 산출물은 `npm run build`가 `out`에 만든다. 검증은 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`, `npm run test:db-contract`, `npm run test:e2e` 순서로 수행한다. E2E는 먼저 별도 터미널에서 `npm run dev:demo` 서버를 띄운 뒤 실행한다. `test:e2e:external`은 같은 동작을 하는 기존 별칭이다. Windows에서 Playwright가 직접 띄운 Next 개발 서버의 프로세스 정리가 멈추는 현상을 피하려고 서버를 별도로 관리한다.

Supabase migration은 연결된 프로젝트에 순서대로 적용하고, 로컬 데이터베이스를 사용할 수 있을 때 `npm run db:start`, `npm run db:reset`, `npm run test:db`를 실행한다. Docker 또는 로컬 Supabase가 없으면 해당 세 검사는 미실행 사유를 기록한다. 원격 pgTAP 검증은 테스트 SQL의 트랜잭션과 마지막 rollback을 유지하며 별도 결과로 기록한다. 이미 적용된 버전과 파일 내용을 확인한 뒤 미적용 migration만 순서대로 적용한다.

Capacitor 준비는 정적 빌드 후 `npm run cap:sync`로 웹 자산을 동기화한다. Android 프로젝트가 생성된 환경에서는 `npm run cap:android`로 Android Studio를 열고 실제 기기 알림·권한을 확인한다. iOS 서명과 APNs 자격은 macOS와 Apple 계정이 필요하므로 Windows에서는 구성 파일과 동기화까지만 확인한다.

## 휴대폰 완료 알림 연결

휴대폰 알림은 앱 안 `task_completed` 알림이 먼저 저장된 뒤 비동기 발송된다. 발송 실패는 완료·포인트·앱 안 알림을 되돌리지 않는다. 서버는 알림/기기 조합마다 `push_delivery_attempts`를 한 번만 선점하고 `sent` 또는 `failed`를 기록한다. 이 장부는 사용자에게 공개되지 않는다. 네트워크 발송 직후 서버가 중단되는 경우 중복 방지를 우선하므로 자동 재전송하지 않는다.

1. 이 저장소 전용 Supabase 프로젝트를 만들고 migration을 순서대로 적용한다. 다른 프로젝트의 데이터를 재사용하지 않는다.
2. `supabase functions deploy send-completion-push`로 함수를 배포한다. `supabase/config.toml`은 이 웹훅 함수만 `verify_jwt = false`로 지정하며, 함수 내부는 32자 이상 `PUSH_WEBHOOK_SECRET` 헤더 검사를 반드시 수행한다.
3. 프로젝트의 Edge Function secrets에 `PUSH_WEBHOOK_SECRET`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX`를 등록한다. Supabase가 제공하는 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`도 함수에서 사용한다. 비밀값을 `NEXT_PUBLIC_` 변수, 저장소, 모바일 프로젝트에 넣지 않는다.
4. Supabase Database Webhooks에서 `public.notifications`의 `INSERT` 이벤트만 대상으로 `send-completion-push` Edge Function에 POST한다. 사용자 정의 헤더 `x-lemon-webhook-secret`에 동일한 웹훅 비밀값을 설정하고 JSON 본문을 사용한다. 다른 알림 종류는 함수가 건너뛴다.
5. Android용 Firebase 앱 ID는 `com.lemonschedule.app`으로 등록하고 `google-services.json`을 `android/app/`에 둔다. 이 파일은 프로젝트별 설정이므로 공개 저장소에 올리기 전 검토한다. iOS에서는 Apple Developer Push Notifications capability와 올바른 provisioning profile/APNs 키를 설정한다. `AppDelegate.swift`에는 Capacitor 토큰 전달 메서드가 들어 있다. 개발용 빌드는 `APNS_USE_SANDBOX=true`, 배포용은 `false`로 맞춘다.
6. 두 계정·두 기기로 연결을 수락한 뒤 최초 완료를 한 번 만든다. 수신자의 앱 안 알림, `push_delivery_attempts` 한 행/기기, 실제 알림 표시와 탭 시 친구 완료 항목 이동을 확인한다. 재완료에는 새 완료 알림과 푸시 시도가 없어야 한다. 권한 거부·로그아웃·연결 해제·실패 상태도 따로 검사한다.

`npm run typecheck:edge`는 Edge Function의 정적 타입만 확인한다. Docker와 실제 Firebase/APNs 자격이 없는 개발 환경에서는 런타임·실기기 발송 검사를 통과로 기록하지 않는다.
