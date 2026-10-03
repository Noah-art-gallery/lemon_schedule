# 엔지니어링 메모

홈의 오늘 날짜는 브라우저 시간이 아니라 조회 대상 소유자의 `profile_private.time_zone`을 기준으로 하는 `get_owner_today` 결과다. 브라우저 날짜는 초기 범위 요청에만 쓰므로 날짜 경계 기능을 바꿀 때 서버 반환 날짜로 분류하는지 확인한다.

반복 발생 건은 요청된 범위에서 서버가 보충하며, 완료·과거 행은 보존한다. 월 반복은 원래 작업의 기준일을 anchor로 삼아 2월 28일을 다음 달 기준일로 잘못 이어가지 않는다. 반복 규칙을 바꾸면 미래 pending 행만 다시 만들고 완료 행을 재작성하지 않는다.

Next.js는 정적 export를 사용하므로 서버 전용 런타임 API를 라우트에 추가하지 않는다. Supabase가 설정되지 않은 개발 환경은 명시적인 비프로덕션 데모 모드에서만 샘플 데이터를 보여 주며, 데모 성공을 실제 포인트·알림 저장으로 표현하지 않는다.

Playwright 브라우저 바이너리는 디스크가 부족한 환경에서 재다운로드하지 말고 시스템 Chrome과 이미 실행한 서버를 사용한다. Docker가 없는 환경에서는 로컬 Supabase pgTAP 결과를 추정하지 않는다. 원격 DB에서 실제 실행한 검사는 로컬 reset과 구분해 기록하고, 검사용 계정·데이터는 트랜잭션 rollback으로 남기지 않는다. identity sequence는 rollback해도 증가하므로 행동 검사는 ID 1을 가정하지 않고 생성된 ID를 저장해 사용한다. pgTAP `throws_ok`에는 SQLSTATE·예상 오류·설명을 명시하고, 뷰 옵션은 `pg_options_to_table`로 읽어 `true`/`on` 표현 차이에 의존하지 않는다.

Windows에서 Playwright가 `webServer`로 Next 개발 서버를 직접 띄우면 검사가 끝나도 프로세스 정리 단계에서 멈출 수 있다. 별도 터미널에서 `npm run dev:demo`를 실행하고 `npm run test:e2e`를 호출하면 종료 코드 0을 확인할 수 있다. 웹 산출물을 네이티브에 반영할 때는 `npm run build`가 만든 `out`을 확인한 뒤 `npm run cap:sync`를 실행하고 Android/iOS 자산 복사 로그를 확인한다.

관리형 pg_net 객체는 `supabase_admin` 소유여서 프로젝트 역할의 REVOKE가 성공 종료돼도 경고와 함께 무효일 수 있다. ACL 숫자만으로 API 노출을 단정하지 말고 실제 Data API 스키마 거부와 공개 RPC 중계 부재를 검증한다. Vault 설정 변경 검사는 직접 UPDATE 대신 `vault.update_secret()`을 사용하고 rollback한다. 큐 body는 bytea이므로 `convert_from(body, 'UTF8')::jsonb`로 읽는다. pg_net 요청은 트랜잭션 commit 후 발송되므로 rollback 테스트를 실제 네트워크 검증이라고 보고하지 않는다. 실제 호출 스모크는 기기 없는 전용 계정·알림을 commit해 안전한 건너뛰기 응답을 확인하고 정확한 UUID·이메일로 정리한다.
