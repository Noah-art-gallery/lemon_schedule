# 서비스 계약

서비스 오류는 코드와 사용자 메시지를 가진 `AppError`다. `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `CONFLICT`, `RATE_LIMITED`로 분류한다. 가입은 이메일·비밀번호·닉네임·시간대에서 사용자 ID·프로필 ID·초대 코드·시간대를 반환하고, 로그인은 사용자 ID·세션을 반환한다. 프로필 수정은 생략 필드를 유지한다.

연결 요청은 초대 코드에서 요청 ID와 pending 상태를 반환한다. 수락·거절·취소는 요청 ID와 최종 상태를, 연결 해제는 `{ disconnected: true }`, 차단·해제는 `{ blocked: true|false }`를 반환한다. 요청 종류와 현재 당사자를 서버가 검증한다.

할 일 생성은 제목·날짜·선택 시간·반복에서 `{ taskId }`를 반환한다. 수정은 생략 값 유지와 명시적 `dueTime: null` 시간 제거를 구분한다. 삭제는 논리 삭제다. 발생 조회는 소유자·날짜 범위에서 발생 목록과 소유자 오늘 기준을 반환한다. 큰 범위는 나눠 요청하고 행 페이지를 끝까지 읽는다. 완료 결과의 `firstCompletion`, `rewardGranted`, 포인트와 완료 사건 ID가 보상 표시의 기준이다.

`getOccurrenceDetail({ occurrenceId })`는 발생 건·소유자·삭제 여부·행동 권한·응원 목록·요약을 반환한다. `listOwnHistory`와 `listSocialActivity`는 최초 완료 시각과 발생 건 ID의 복합 커서로 추가 조회한다. 응원 요약은 최대 100개 발생 건씩 조회한다. 소유자 기록에는 삭제·재개한 발생 건이 남고 친구 조회는 현재 연결과 완료 상태를 적용한다. 접근 불가 오류는 과거 상세 캐시로 대체하지 않는다.

응원 쓰기는 완료 발생 건 ID·선택 반응·120자 이하 글을 받으며 하나 이상의 내용이 필요하다. 동일 작성자·발생 건 쓰기는 기존 응원을 수정하며 새 소식을 반복 생성하지 않는다. 소유자 숨김과 작성자 삭제는 별도 권한이다.

`listInbox({ filter, cursor?, limit? })`는 `all`, `encouragement`, `connection` 필터와 ID 커서로 `{ items, nextCursor }`를 반환한다. 항목은 종류·작성자 이름·읽은 시각·대상 ID·안전한 미리보기·접근 가능 여부를 포함한다. 직접 소식 세 종류만 대상이며 `task_completed`는 제외한다. `markAllInboxRead({ throughId })`는 그 ID 이하의 모든 직접 소식 종류에 적용한다. 개별 읽음은 실제로 해결한 대상과 소식 ID를 맞춘 뒤 호출한다.

펫 저장은 PNG Blob을 새 사용자 UUID/파일 UUID 경로에 올리고 경로·갱신 시각을 반환한다. 꾸미기는 선택 색상·스티커·배경을 받아 같은 형태로 반환하며 미해금 값은 `FORBIDDEN`이다. 기기 등록은 token·platform·deviceId를 받아 계정과 기기를 연결한다. 휴대폰 알림 켜짐은 OS 권한과 해당 계정 서버 등록이 함께 확인된 상태다. 웹은 unsupported이며 로그아웃은 해당 기기 서버 행과 OS 등록을 해제한다.

`POST /functions/v1/send-completion-push`는 `x-lemon-webhook-secret` 헤더와 `{ type: "INSERT", table: "notifications", record: { id: number } }`를 받는다. 인증 헤더 오류는 401, 형식 오류는 400이며 DB 조회 전에 거부한다. 직접 소식은 현재 연결·차단·응원 가시성·요청 상태를 다시 확인해 `{ sent, failed, skipped }` 또는 `{ skipped: reason }`을 반환한다. 완료 이벤트는 건너뛴다. 내부 조회 실패는 500 `DISPATCH_FAILED`이며 공급자 실패는 기기별 장부에 남긴다. 함수 이름과 INSERT 웹훅 주소는 기존 배포 호환성을 유지한다.

## 활동·상세·소식 조회 형식

조회 서비스는 현재 로그인 세션을 사용한다. 사용자 ID는 UUID, 발생 건·응원·소식 ID는 양의 안전 정수, 날짜는 `YYYY-MM-DD`, 시각은 ISO 8601이다. 없는 값은 `null`, 빈 페이지는 `{ items: [], nextCursor: null }`이다. 인증 누락은 `UNAUTHENTICATED`, 권한 거부는 `FORBIDDEN`, 없는 상세는 `NOT_FOUND`, 입력·응답 형식 오류는 `INVALID_INPUT`으로 거부하며 실패를 빈 목록으로 바꾸지 않는다.

`CompletionCursor`는 `{ firstCompletedAt: string, occurrenceId: number }`다. 활동·기록은 두 값의 내림차순으로 이어가며 기본 20개, 최대 100개를 반환한다. 소식은 ID 내림차순이며 기본 50개, 최대 100개다. 다음 요청에는 반환한 커서를 그대로 전달하고 `nextCursor: null`에서 끝낸다.

| 서비스                       | 입력                                                                                    | 반환                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listSocialActivity`         | `{ friendId?: UUID, cursor?: CompletionCursor, limit?: number }`                        | `{ items: Array<{ occurrence, owner: { id, displayName }, summary }>, nextCursor: CompletionCursor \| null }`                                    |
| `listOwnHistory`             | `{ cursor?: CompletionCursor, limit?: number }`                                         | `{ items: Array<{ occurrence, taskDeleted: boolean, summary }>, nextCursor: CompletionCursor \| null }`                                          |
| `getOccurrenceDetail`        | `{ occurrenceId: number }`                                                              | `{ occurrence, owner: { id, displayName }, taskDeleted: boolean, permissions: { canEdit, canComplete, canEncourage }, encouragements, summary }` |
| `listEncouragementSummaries` | `{ occurrenceIds: number[] }` (최대 100개)                                              | `{ items: Array<{ occurrenceId, summary }> }`; 읽을 수 없는 ID는 누락하며 응원 0개로 해석하지 않는다                                             |
| `listInbox`                  | `{ filter: "all" \| "encouragement" \| "connection", cursor?: number, limit?: number }` | `{ items: InboxItem[], nextCursor: number \| null }`                                                                                             |
| `getInboxUnreadCount`        | 없음                                                                                    | `{ unreadCount: number }`                                                                                                                        |
| `markAllInboxRead`           | `{ throughId: number }`                                                                 | `{ updatedCount: number, readAt: string }`                                                                                                       |
| `getDevicePushState`         | 없음                                                                                    | `{ status: "unsupported" \| "off" \| "denied" \| "on" }`; 확인 실패는 `AppError`이며 `on`으로 추정하지 않는다                                    |

발생 건 `occurrence`에는 `id`, `task_id`, `owner_id`, `occurrence_date`, `title_snapshot`, `due_time`, `recurrence_snapshot`, `status`, `completed_at`, `first_completed_at`, `reopened_at`, `created_at`, `updated_at`이 있다. 시간·완료·재개 시각은 없으면 `null`이다. `status`는 `pending | completed`, 반복은 `none | daily | weekly | monthly`다.

응원 목록 항목은 `{ id, occurrence_id, author_id, owner_id, authorName, reaction, message, visibility, created_at, updated_at }`이다. `reaction`은 `lemon | clap | heart | cheer | null`, 글은 `string | null`, 공개 상태는 `visible | hidden_by_owner | deleted_by_author`다.

요약 `summary`는 `{ count, reactions: { lemon, clap, heart, cheer }, latestMessage, myEncouragement }`다. 수치는 현재 일반 표시가 허용되는 행만 센다. `latestMessage`는 `{ encouragementId, authorName, message, createdAt } | null`, `myEncouragement`는 `{ id, reaction, message, visibility } | null`이며 자기 글만 포함한다. 숨긴 자기 글은 작성자 편집에 사용할 수 있으나 다른 사람의 요약에 노출하지 않는다.

`InboxItem`은 `{ id, type, actorName, createdAt, readAt, occurrenceId, encouragementId, connectionRequestId, target, availability, taskTitle, messagePreview, reaction }`이다. `type`은 직접 소식 세 종류이며 `readAt`과 대상 ID는 `null`일 수 있다. `availability`는 `available | unavailable`이다. `unavailable`에서는 `target`, `taskTitle`, `messagePreview`, `reaction`이 모두 `null`이다. 숨긴 글은 소유자에게 상세를 열 권한이 있어도 일반 미리보기에 넣지 않는다.

응원 링크는 `/?occurrence=<id>&encouragement=<id>`, 요청은 `/friends/?request=<id>`, 수락은 `/friends/?friend=<UUID>`다. 기존 `/?occurrence=<id>`와 `/friends/?friend=<UUID>&occurrence=<id>`도 지원한다. 웹훅의 완료 이벤트 응답은 HTTP 200 `{ skipped: "DIRECT_NOTIFICATION_ONLY" }`다.
