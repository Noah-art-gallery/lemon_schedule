# 현재 상태

## 구현됨

- 이메일·비밀번호 가입/로그인, 세션 복원, 인증된 계정의 재로그인 차단, 프로필·시간대·초대 코드, 차단 목록과 로그아웃 화면
- 할 일 생성·수정·논리 삭제, 없음/매일/매주/매월 반복, 월말 보정, 서버 오늘 기준, 완료·취소·최초 보상 RPC
- 초대 요청·수락·거절·취소, 친구 현황과 지난/미래 기록 추가 조회, 친구 전환 시 상세 무효화와 화면 재진입/주기 연결 재검증, 연결 해제·차단·해제, 완료 항목의 반응·응원글 조회/작성/수정/삭제
- 개인 펫 기본 이미지, 포인터/터치 도화지, 비공개 Storage 저장, 성장 포인트와 해금 꾸미기 선택
- 앱 안 알림 50개 단위 추가 조회·읽음 처리·상단 배지, Capacitor 기기 토큰 등록·OS 등록 해제 및 서버 발송 함수·시도 장부
- 레몬 색상 체계, 모바일 하단 메뉴, 데모 모드, 정적 export, Android/iOS 프로젝트와 웹 자산 동기화

## 검증됨

최신 UI 통합 상태에서 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`(30개 통과·2개 외부 의존성으로 건너뜀), `npm run test:db-contract`(14개 RLS 테이블·10개 migration), `npm run build`가 통과했다. Playwright 모바일·데스크톱 기본 흐름과 hydration 검사 20개는 기존 데모 서버 검증 결과다.

2026-10-03 서울 리전의 전용 Supabase `lemontodolist` (`jthltqvcoezawoplaxkd`)에 8개 migration을 적용했다. 미적용 상태였던 친구 프로필 정책의 UUID/bigint 컬럼 이름 충돌을 수정하고, 명시적으로 프로필 ID를 참조하는 후속 migration과 대기 요청 공개 범위 검사를 추가했다. 원격 migration 버전은 저장소 파일의 버전과 일치하도록 정리했다. 클라우드 DB에서 pgTAP 보안 검사 16개·행동 검사 103개가 모두 통과했으며, 검사 트랜잭션을 rollback한 뒤 계정·프로필·할 일 0건을 확인했다. 익명 REST 조회와 완료 RPC는 401/42501로 거부됐다.

로컬 `.env.local`에는 공개 URL·publishable key만 설정했고 Git에서 제외했다. 실제 연결 환경의 정적 빌드와 Android/iOS `cap:sync`가 통과했다. `send-completion-push` Edge Function v1도 배포했으며 GET 405와 웹훅 비밀값 미설정 POST 503 차단을 확인했다. 2026-10-03 Android `google-services.json`의 패키지·프로젝트 일치를 확인해 Git 제외 경로에 저장했고, CLI 로그인 후 Firebase 서버 자격 3개(`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`)를 Edge Function secrets에 등록했다. 원본 값과 원격 해시가 일치하는 것을 확인했으며 서버 키는 앱·저장소에 복사하지 않았다. 추가로 64자 무작위 `PUSH_WEBHOOK_SECRET`을 등록해 원격 해시를 확인했다. 비밀 헤더 없는 POST는 401, 올바른 헤더와 잘못된 이벤트의 POST는 400 `INVALID_EVENT`로 확인했으며 알림·발송 데이터는 생성하지 않았다. Database Webhook 트리거와 Vault 설정도 연결했고, 실제 INSERT의 HTTP 200 `NOT_COMPLETION` 응답을 확인했다. 추가 migration의 API 경계 검사와 pgTAP 보안 16개·행동 103개·웹훅 12개(총 131개)가 통과했다. 테스트 계정·알림·대기 요청 0건과 Vault 설정 2개 보존을 확인했다. APNs 자격과 실제 휴대폰 푸시 수신은 아직 검증되지 않았다.

2026-10-03 사용자가 Confirm email을 끈 뒤 Auth settings 200과 `mailer_autoconfirm=true`를 확인했다. 공개 키·실제 Auth 계정으로 동시 완료와 수락/차단 경합 통합 검사 2개가 Node 환경에서 통과했다. 생성된 4개 테스트 계정의 비밀번호 로그인, 친구 완료 조회, 비공개 프로필·펫·기기 토큰 격리, 비연결 사용자 할 일 차단, 응원 알림과 재완료 무보상도 실제 API에서 확인했다. 전역 로그아웃 후 이번 검사에서 생성한 UUID·이메일이 정확히 일치하는 4개 계정만 삭제했으며 계정·프로필·할 일 0건을 확인했다. 실제 브라우저·모바일 화면 검증과 구분되는 API 검증 결과다.

## 남은 일

- 배포 도메인과 이메일 운영 설정을 확정한다. 즉시 가입·비밀번호 로그인과 동시 완료·차단 경합 API 검사는 완료했다.
- Docker/Supabase 런타임 환경에서 빈 DB reset과 migration 재적용을 검증한다. 클라우드 적용·pgTAP 검사는 완료했지만 로컬 reset은 아직 미실행이다.
- 이 Windows PC에서 Android Studio·SDK·ADB 설치 파일과 PATH의 Java를 확인했다. SDK 패키지·JDK 버전 호환성과 네이티브 Gradle 빌드는 아직 검증하지 않았다. Android 실기기를 연결해 설치·푸시를 확인하고, iOS는 macOS 서명 환경·APNs 자격을 별도로 준비한다. Database Webhook 연결과 Android Firebase 설정 파일·서버 FCM 자격·웹훅 비밀값 등록은 완료했다.
- 오래된·먼 미래 친구 기록은 1년 단위로 더 불러올 수 있으며, 대량 발생 건 페이지네이션을 실제 DB에서 검증한다.
- 두 사용자 대표 화면 흐름과 같은 휴대폰에서의 계정 전환·기기 토큰 충돌을 수동 검증한다.

## 다음 세션 시작점

사용자 요청은 Android 실기기에 앱을 설치하고 실제 푸시를 검증하는 것이다. 아직 폰 연결·설치 완료 보고는 없다. 먼저 `docs/operations.md`의 Android 최초 설치 절차를 따르고 ADB 기기 인식부터 확인한다. `npm run build` → `npm run cap:sync` → `npm run cap:android` 순서를 지킨다. 기존 웹훅·migration을 중복 생성하거나 재적용하지 않는다. `.env.local`과 `android/app/google-services.json`은 이 PC에만 있고 Git에서 제외돼 있다. Firebase 서비스 계정 원본을 앱·저장소에 복사하지 않으며 서버 비밀값은 이미 Supabase에 등록돼 있다. 웹훅 공유 비밀값은 Edge secrets와 Vault에 보관되므로 이전 채팅의 메모리 값에 의존할 필요가 없다. 실제 발송·알림 탭 이동·재완료 중복 방지·권한 거부·로그아웃·같은 기기 계정 전환을 검증하기 전에는 푸시 출시 완료로 보고하지 않는다.
