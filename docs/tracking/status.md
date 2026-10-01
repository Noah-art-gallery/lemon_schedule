# 현재 상태

## 구현됨

- 이메일·비밀번호 가입/로그인, 세션 복원, 인증된 계정의 재로그인 차단, 프로필·시간대·초대 코드, 차단 목록과 로그아웃 화면
- 할 일 생성·수정·논리 삭제, 없음/매일/매주/매월 반복, 월말 보정, 서버 오늘 기준, 완료·취소·최초 보상 RPC
- 초대 요청·수락·거절·취소, 친구 현황과 지난/미래 기록 추가 조회, 친구 전환 시 상세 무효화와 화면 재진입/주기 연결 재검증, 연결 해제·차단·해제, 완료 항목의 반응·응원글 조회/작성/수정/삭제
- 개인 펫 기본 이미지, 포인터/터치 도화지, 비공개 Storage 저장, 성장 포인트와 해금 꾸미기 선택
- 앱 안 알림 50개 단위 추가 조회·읽음 처리·상단 배지, Capacitor 기기 토큰 등록·OS 등록 해제 및 서버 발송 함수·시도 장부
- 레몬 색상 체계, 모바일 하단 메뉴, 데모 모드, 정적 export, Android/iOS 프로젝트와 웹 자산 동기화

## 검증됨

최신 UI 통합 상태에서 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:edge`, `npm test -- --run`(30개 통과·2개 외부 의존성으로 건너뜀), `npm run test:db-contract`(14개 RLS 테이블·7개 migration), `npm run build`가 통과했다. Playwright 모바일·데스크톱 기본 흐름 18개가 시스템 Chrome과 별도 데모 서버에서 통과했고, 정적 빌드 뒤 `npm run cap:sync`가 Android/iOS 모두 통과했다. Edge Function은 비밀 헤더·이벤트 검증 단위 검사와 정적 타입 검사만 완료했다.

## 남은 일

- Docker/Supabase 런타임을 사용할 수 있는 환경에서 migration 적용과 pgTAP 행동 검사를 실제로 실행한다.
- Android SDK/Java와 iOS macOS 서명 환경, Firebase/APNs 자격에서 네이티브 빌드·실기기 푸시를 확인한다. Supabase 웹훅·Edge Function 배포도 실제 프로젝트에서 검증한다.
- 오래된·먼 미래 친구 기록은 1년 단위로 더 불러올 수 있으며, 대량 발생 건 페이지네이션을 실제 DB에서 검증한다.
- 실제 Supabase 프로젝트의 이메일 설정과 배포 도메인을 넣고 두 사용자 대표 흐름을 수동 검증한다.
