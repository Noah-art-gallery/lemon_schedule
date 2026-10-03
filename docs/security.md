# 보안 정책

인증은 Supabase 이메일·비밀번호 세션으로 처리한다. 보호 라우트는 세션이 없으면 로그인 화면으로 보내며, 서버 데이터 접근은 화면의 숨김이 아니라 RLS·보안 RPC가 최종 판단한다.

프로필 공개 정책은 본인·승인된 연결·대기 요청의 당사자에게만 닉네임을 보여 주고 이메일은 공개하지 않는다. 할 일은 소유자와 승인된 연결에게만 읽히며 쓰기는 소유자 RPC만 허용한다. 차단 행은 차단 사용자 본인만 관리하고 차단 우선 검사가 연결보다 먼저 실행된다.

펫 원본은 공개 버킷이 아닌 `pet-drawings` 버킷에서 사용자 UUID 경로로 저장한다. 클라이언트는 원본 경로를 다른 사용자에게 전달하지 않고 소유자 확인 후 짧은 signed URL을 만든다. 기기 토큰은 본인 행만 읽고 쓰며 로그아웃 시 해당 기기 행을 삭제하고 OS 푸시 등록도 해제한다. 기존 세션 만료와 새 계정 인증 전에도 OS 등록을 해제하며, 기기 등록 실패 시 재해제한다. 동일한 기기의 토큰이 다른 계정에서 재등록될 수 있어 비활성 행으로 남기지 않는다. 강제 세션 만료 후 남은 서버 토큰 행과 재등록 충돌은 실기기 검증 전 출시 차단 조건이다.

완료 알림 웹훅은 사용자 세션을 받지 않는다. 서버에만 보관하는 32자 이상 공유 비밀 헤더가 일치해야 하고, 함수는 알림 ID를 권한 있는 DB 조회로 재검증한다. 현재 연결·차단·완료 상태가 허용되지 않으면 발송하지 않는다. 발송 시도 장부와 공급자 응답 ID는 서버 역할만 읽고 쓰며 일반 사용자는 접근할 수 없다. FCM/APNs 키·Supabase 서버 키는 Edge Function 비밀값으로만 저장한다. 웹훅 공유 비밀값은 Edge Function secret과 DB 호출용 Vault에만 보관하고 앱 번들·저장소·로그에 노출하지 않는다. 유출 시 해당 키를 교체하고 이전 값을 폐기한다.

모든 보안 RPC는 인증 사용자와 대상 소유자·연결 상태를 다시 확인하고, 사용자 쌍 또는 네트워크 잠금으로 동시 요청을 직렬화한다. migration을 바꿀 때는 RLS 계약 스크립트와 행동 SQL을 함께 갱신하며, 로컬 Supabase가 실행되지 않는 경우 그 사실을 성공으로 가장하지 않는다.

2026-10-03 클라우드 Advisors는 로그인 사용자에게 공개된 `SECURITY DEFINER` RPC 19개를 WARN으로, 정책 없이 RLS만 켠 `push_delivery_attempts`를 INFO로 표시했다. RPC는 완료·보상·연결을 원자적으로 처리하기 위한 의도된 진입점이며 인증·소유권·연결 검사를 함수 내부에서 수행한다. 발송 장부는 일반 사용자 권한을 철회하고 서버만 사용하므로 사용자 정책을 만들지 않는다. 실제 pgTAP 119개와 익명 API 거부를 확인했으며 이후 RPC 변경 시 같은 검사를 다시 수행한다. [RPC 권한 Advisor 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS 정책 없는 테이블 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

2026-10-03 웹훅 연결 검증에서 관리형 pg_net 0.20.4의 큐·응답 테이블 PUBLIC 권한을 확인했다. 소유자는 `supabase_admin`이며 프로젝트 `postgres`가 실행한 REVOKE는 경고만 내고 권한을 변경하지 못했다. 이는 앱 API 접근 허용을 의미하지 않는다. 실제 공개 키 요청에서 `net`, `vault`, `private` 스키마는 모두 406 `PGRST106`으로 거부됐고 공개 RPC에서 해당 내부 기능으로 연결되는 함수는 0개다. 웹훅 함수는 private 스키마의 트리거 전용이며 anon·authenticated EXECUTE가 없다. Vault 읽기 권한도 두 역할에 없다. 앞으로 net·vault·private를 API 노출 스키마에 추가하거나 공개 RPC로 중계하지 않는다. 큐 ACL 자체의 추가 강화는 Supabase 지원이 필요하며, 이를 수정했다고 보고하지 않는다.
