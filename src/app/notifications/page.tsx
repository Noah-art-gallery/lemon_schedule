import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/state-panel";

export default function NotificationsPage() {
  return (
    <AppShell>
      <PageHeading eyebrow="NEWS" title="알림" description="친구의 완료와 받은 응원을 모아봐요." />
      <StatePanel
        kind="empty"
        title="아직 새 알림이 없어요"
        description="친구가 할 일을 완료하거나 응원을 보내면 여기에 나타나요."
        action={<Button variant="secondary">새로 확인하기</Button>}
      />
    </AppShell>
  );
}
