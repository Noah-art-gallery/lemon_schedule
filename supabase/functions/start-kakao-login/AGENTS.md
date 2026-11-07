# 카카오 간편로그인 시작

이 함수는 로그인 전 공개 진입점이다. 허용된 웹 Origin과 동일한 `/login/` 복귀 주소만 받으며 초대 코드 외 쿼리는 거부한다. `verify_jwt=false`는 로그인 전 호출을 위한 설정이며, 함수에서 프로젝트 publishable key를 Auth settings 요청으로 확인한다. legacy 키는 서버의 anon 키와 일치할 때만 허용한다. 서비스 역할 키와 관리자 Auth API를 사용하지 않는다.

Supabase Auth의 `/authorize`가 발급한 state를 그대로 반환하며 직접 서명하거나 사용자 세션을 만들지 않는다. upstream 리다이렉트는 따라가지 않고 카카오 호스트·Supabase callback·닉네임 scope를 확인한다. 응답은 `no-store`이며 state·키·사용자 정보를 로그에 남기지 않는다. 앱 복귀 후 기존 Supabase callback이 state 검증·토큰 교환을 담당한다.

Origin·복귀 주소 변조, 잘못된 키, upstream 응답 변조, CORS 사전 요청을 검사하고 사용자 데이터나 테이블 쓰기를 추가하지 않는다.
