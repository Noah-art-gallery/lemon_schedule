# 현재 상태

## 구현됨

- 이메일·비밀번호 가입/로그인, 세션 복원, 인증된 계정의 재로그인 차단, 프로필·시간대·초대 코드, 차단 목록과 로그아웃 화면
- 할 일 생성·수정·논리 삭제, 없음/매일/매주/매월 반복, 월말 보정, 서버 오늘 기준, 완료·취소·최초 보상 RPC
- 초대 요청·수락·거절·취소, 친구 현황과 지난/미래 기록 추가 조회, 친구 전환 시 상세 무효화와 화면 재진입/주기 연결 재검증, 연결 해제·차단·해제, 완료 항목의 반응·응원글 조회/작성/수정/삭제
- 개인 펫 기본 이미지, 포인터/터치 도화지, 비공개 Storage 저장, 성장 포인트와 해금 꾸미기 선택
- 앱 안 알림 50개 단위 추가 조회·읽음 처리·상단 배지, Capacitor 기기 토큰 등록·OS 등록 해제 및 서버 발송 함수·시도 장부
- 레몬 색상 체계, 모바일 하단 메뉴, 데모 모드, 정적 export, Android/iOS 프로젝트와 웹 자산 동기화

## 검증됨

최신 UI 통합 상태에서 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`(30개 통과·2개 외부 의존성으로 건너뜀), `npm run test:db-contract`(14개 RLS 테이블·8개 migration), `npm run build`가 통과했다. Playwright 모바일·데스크톱 기본 흐름과 hydration 검사 20개는 기존 데모 서버 검증 결과다.

2026-10-03 서울 리전의 전용 Supabase `lemontodolist` (`jthltqvcoezawoplaxkd`)에 8개 migration을 적용했다. 미적용 상태였던 친구 프로필 정책의 UUID/bigint 컬럼 이름 충돌을 수정하고, 명시적으로 프로필 ID를 참조하는 후속 migration과 대기 요청 공개 범위 검사를 추가했다. 원격 migration 버전은 저장소 파일의 버전과 일치하도록 정리했다. 클라우드 DB에서 pgTAP 보안 검사 16개·행동 검사 103개가 모두 통과했으며, 검사 트랜잭션을 rollback한 뒤 계정·프로필·할 일 0건을 확인했다. 익명 REST 조회와 완료 RPC는 401/42501로 거부됐다.

로컬 `.env.local`에는 공개 URL·publishable key만 설정했고 Git에서 제외했다. 실제 연결 환경의 정적 빌드와 Android/iOS `cap:sync`가 통과했다. `send-completion-push` Edge Function v1도 배포했으며 GET 405와 웹훅 비밀값 미설정 POST 503 차단을 확인했다. 이메일 확인 옵션은 아직 켜져 있고 Firebase/APNs·웹훅 자격은 미설정이므로 즉시 가입과 휴대폰 푸시의 종단 간 성공은 주장하지 않는다.

## 남은 일

- 즉시 가입 계약에 맞춰 전용 프로젝트의 Confirm email 옵션을 끈 뒤 실제 Auth 가입·로그인과 동시 완료·차단 경합 통합 검사 2개를 실행한다. 배포 도메인과 이메일 운영 설정도 확정한다.
- Docker/Supabase 런타임 환경에서 빈 DB reset과 migration 재적용을 검증한다. 클라우드 적용·pgTAP 검사는 완료했지만 로컬 reset은 아직 미실행이다.
- Android SDK/Java와 iOS macOS 서명 환경, Firebase/APNs·웹훅 비밀값을 준비하고 Database Webhook을 연결한 뒤 네이티브 빌드·실기기 푸시를 확인한다.
- 오래된·먼 미래 친구 기록은 1년 단위로 더 불러올 수 있으며, 대량 발생 건 페이지네이션을 실제 DB에서 검증한다.
- 두 사용자 대표 화면 흐름과 같은 휴대폰에서의 계정 전환·기기 토큰 충돌을 수동 검증한다.
