# 레몬스케줄 프로젝트 안내

레몬스케줄은 친구·가족과 완료 현황을 공유하고, 완료 순간 개인 펫의 응원을 받는 모바일 중심 투두리스트 MVP다. Next.js 정적 웹 앱을 Capacitor로 감쌀 수 있게 유지하며, 지금은 핵심 사회적 완료 흐름을 작고 검증 가능하게 만드는 데 집중한다.

## 프로젝트 구조

```
├── AGENTS.md / CLAUDE.md → 작업 전 핵심 제약과 탐색 경로
├── docs/
│   ├── architecture.md → 화면·서비스·데이터 경계
│   ├── business-rules.md → 계정·할 일·연결·보상 규칙
│   ├── security.md → 인증·RLS·비공개 데이터 원칙
│   ├── standards.md → 코드·검증·변경 규칙
│   ├── engineering-notes.md → 시간대·반복·정적 빌드의 주의점
│   ├── operations.md → 설치·환경 변수·실행·배포 절차
│   ├── contracts.md → 서비스 입력·출력·오류 계약
│   └── tracking/
│       ├── status.md → 구현·검증·남은 범위
│       ├── findings.md → 현재 해결하지 못한 외부 의존성
│       └── decisions/ → 중요한 선택의 기록
├── src/
│   ├── app/ → 라우트와 전역 스타일
│   ├── components/AGENTS.md → 앱 셸·공통 UI 경계
│   ├── lib/AGENTS.md → 환경·오류·Supabase 기반
│   └── features/
│       ├── auth/AGENTS.md → 인증 모듈
│       ├── connections/AGENTS.md → 친구·차단 모듈
│       ├── encouragements/AGENTS.md → 응원 모듈
│       ├── home/AGENTS.md → 오늘 할 일 모듈
│       ├── notifications/AGENTS.md → 앱 안 알림 모듈
│       ├── pet/AGENTS.md → 개인 펫 모듈
│       ├── profile/AGENTS.md → 내 정보 모듈
│       ├── push/AGENTS.md → 휴대폰 기기 등록
│       └── tasks/AGENTS.md → 할 일·반복·완료 모듈
└── supabase/functions/send-completion-push/AGENTS.md → 서버 휴대폰 알림 발송
```

## 먼저 지킬 것

- 친구·비연결 사용자·차단 사용자의 데이터가 섞이지 않도록 서버 RLS와 보안 RPC를 우선 확인한다.
- 완료·포인트·완료 알림은 한 번만 인정되어야 하며, 클라이언트의 여러 요청으로 중복 지급하지 않는다.
- 사용자의 이메일·펫 원본·기기 토큰은 다른 사용자에게 노출하지 않는다.
- 데이터베이스 변경은 새 순서형 migration과 계약 검사를 함께 추가하고, 직접 테이블 쓰기를 권한 있는 RPC로 우회하지 않는다.
- 사용자에게 보이는 모든 서비스 오류는 `AppError`의 계약 코드를 사용한다.

## 작업 전 체크리스트

모든 변경은 `docs/standards.md`, `docs/engineering-notes.md`, 해당 기능 폴더의 `AGENTS.md`를 먼저 읽는다. RLS·migration을 바꿀 때는 `docs/security.md`와 SQL 계약 검사를 먼저 확인하고, 날짜·반복을 바꿀 때는 저장된 소유자 시간대와 월말 규칙을 확인한다. 정적 빌드와 Capacitor 동기화를 바꿀 때는 `docs/operations.md`의 출력 디렉터리 순서를 따른다.

## 문제 보고

데이터 격리 위반, 인증 우회, 보상 중복, migration 적용 실패는 즉시 사용자에게 알리고 작업을 멈춘다. 그 외 재현 가능한 문제는 원인과 영향, 지금 해결할 수 없는 이유를 `docs/tracking/findings.md`에 남긴다.

## 검증 명령

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`, `npm run test:db-contract`, `npm run build`를 통과시킨다. 화면 변경은 별도 데모 서버에서 브라우저 스모크 테스트도 확인한다.

## Next.js 규칙

이 저장소의 Next.js 버전은 기존 관례와 다른 변경 사항을 포함할 수 있다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 확인하고 deprecation 안내를 따른다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
