# 개발 기준

기능 코드는 `src/features/<기능>` 안에 두고 라우트는 화면 진입점만 조합한다. 데이터베이스 호출은 기능 서비스에 모으고 화면에서 Supabase 쿼리를 직접 만들지 않는다. 공통 UI는 `src/components`에 두며 기능 전용 스타일은 전역 토큰과 기존 모바일 중단점을 따른다.

서비스 입력은 Zod로 검증하고 실패는 `AppError`의 `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `CONFLICT`, `RATE_LIMITED` 중 하나로 변환한다. 성공 출력은 `docs/contracts.md`의 키와 의미를 바꾸지 않는다.

SQL은 순서형 migration으로만 변경한다. 직접 테이블 쓰기가 원자적 상태 변화를 우회하지 않도록 보안 RPC와 RLS grant를 확인하고, migration 순서에 의존하는 함수는 실제 빈 데이터베이스 적용 순서로 검토한다.

변경 전후 `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run test:db-contract`를 실행한다. 화면 흐름이 바뀌면 외부 서버를 이용한 Playwright 스모크 테스트를 추가하고, 정적 빌드 이후에만 Capacitor 동기화를 시도한다.
