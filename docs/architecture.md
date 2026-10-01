# 시스템 구성

브라우저 또는 Capacitor WebView가 `src/app` 라우트를 열고, 기능별 서비스가 Supabase 브라우저 클라이언트를 통해 인증·Postgres·Storage에 요청한다. 화면은 데이터 접근을 직접 조합하지 않고 기능 서비스의 입력·출력 계약을 사용한다.

핵심 흐름은 가입 화면 → Supabase Auth → 프로필 생성 트리거 → 홈에서 보안 RPC로 발생 건 조회 → 완료 RPC의 상태·포인트·앱 알림 생성 → 친구 화면의 연결된 읽기와 응원 RPC 순서다. 펫 그림은 `pet-drawings` 비공개 버킷에 사용자 경로로 저장하고, 저장된 경로를 소유자 전용 signed URL로 읽는다.

`src/components`는 앱 셸·내비게이션·공통 UI를 제공하고 기능 모듈은 이를 소비한다. `src/features/tasks`가 날짜·반복·완료의 기준을, `connections`가 승인된 네트워크를, `notifications`와 `encouragements`가 사회적 피드백을, `pet`이 개인 보상을 담당한다. `supabase/migrations`가 서버 권한과 원자적 상태 변화를 소유하며 클라이언트는 서비스 키를 갖지 않는다.

정적 Next.js 출력은 `out`에 생성되고 Capacitor가 같은 출력을 Android/iOS 프로젝트에 연결한다. 휴대폰은 허용 시 토큰을 Supabase에 등록한다. 완료 RPC가 앱 안 알림을 저장하면 Database Webhook이 `supabase/functions/send-completion-push`를 호출하고, 함수가 현재 연결·완료 상태를 재확인한 뒤 기기별 발송 시도를 선점해 FCM 또는 APNs에 보낸다. 발송 상태는 별도 장부에 남으며 외부 전송 실패는 완료·보상·앱 안 알림을 되돌리지 않는다. 브라우저에는 서버 발송 키나 기기 토큰 목록이 전달되지 않는다.
