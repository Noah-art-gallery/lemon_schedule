# 서비스 계약

모든 서비스는 인증 세션을 전제로 하며 오류는 코드와 사용자 메시지를 가진 `AppError`다. 가입은 `{ email, password, displayName, timeZone }`을 받아 `{ userId, profileId, inviteCode, timeZone }`을 반환한다. 로그인은 `{ email, password }`에서 `{ userId, session }`을 반환하고 로그아웃은 세션만 종료한다.

프로필 수정은 생략한 값을 유지하며 `{ profileId, displayName, timeZone, updatedAt }`을 반환한다. 연결 요청은 초대 코드로 `{ requestId, status: "pending" }`, 수락·거절은 `{ requestId, status }`, 취소는 `{ requestId, status: "cancelled" }`, 연결 해제는 `{ disconnected: true }`, 차단과 해제는 `{ blocked: true|false }`를 반환한다.

할 일 생성은 제목·날짜·선택 시간·반복을 받아 `{ taskId }`, 수정은 생략 필드 유지와 명시적 `dueTime: null` 제거를 포함해 `{ taskId, updatedAt }`, 삭제는 `{ taskId, deleted: true }`를 반환한다. 발생 조회는 `{ ownerId, from, to }`에서 발생 목록과 소유자 오늘 기준·완료율을 반환한다. 완료는 상태·시각·최초 완료 여부·보상 여부·포인트·완료 사건 ID를, 재개는 `{ status: "pending", rewardReversed: false }`를 반환한다.

응원은 완료 발생 건 ID와 선택 반응·120자 이하 메시지를 받아 응원 ID를 반환하고, 앱 화면은 현재 연결·가시성 규칙을 적용한다. 알림 조회는 `{ userId, cursor? }`를 받아 최신 50개씩 `{ items, nextCursor }`로 반환하고, 각 항목을 `{ notificationId, type, actorName, createdAt, readAt, target IDs }` 형태로 표시한다. 읽음 처리는 알림 ID와 읽은 시각을 저장한다. 펫 저장은 PNG Blob을 받아 사용자 전용 경로와 갱신 시각을 반환하고, 푸시 토큰 등록은 `{ token, platform, deviceId }`를 사용자별 활성 기기로 upsert한다.

펫 꾸미기는 `{ selectedColor: "leaf-green"|"lemon-yellow", selectedAccessory: null|"leaf-hat", selectedBackground: null|"sunny-garden" }`를 받아 같은 형태를 반환한다. 미해금 항목은 `FORBIDDEN`, 잘못된 값은 `INVALID_INPUT`이다. 모바일 로그아웃은 현재 계정·기기 토큰 행을 삭제하므로 같은 기기에서 다른 계정이 같은 APNs/FCM 토큰을 등록할 수 있다.

서버 웹훅 `POST /functions/v1/send-completion-push`는 `x-lemon-webhook-secret` 헤더와 `{ type: "INSERT", table: "notifications", record: { id: number } }` JSON을 받는다. 비밀값이 없거나 틀리면 401, 형식이 틀리면 400을 반환하며 데이터 조회를 시작하지 않는다. 유효한 완료 알림은 `{ sent, failed, skipped }`를, 이미 연결이 끊겼거나 완료가 취소된 알림은 `{ skipped: reason }`을 200으로 반환한다. 공급자 실패는 개별 기기 시도 행에 남기고 응답의 `failed` 수에 포함된다. 내부 조회 실패는 500 `{ error: "DISPATCH_FAILED" }`다. 이 인터페이스는 브라우저 사용자가 아닌 Supabase Database Webhook 전용이다.
