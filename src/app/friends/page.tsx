import { UserPlus } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/state-panel";

export default function FriendsPage() {
  return (
    <AppShell>
      <PageHeading
        eyebrow="TOGETHER"
        title="친구와 같이 해볼까요?"
        description="서로 연결되면 할 일을 확인하고 완료한 순간에 응원을 보낼 수 있어요."
      />
      <StatePanel
        kind="empty"
        title="아직 연결된 친구가 없어요"
        description="초대 코드를 입력하거나 내 초대 링크를 공유해 첫 친구를 만나보세요."
        action={
          <Button>
            <UserPlus size={18} aria-hidden="true" /> 친구 초대하기
          </Button>
        }
      />
    </AppShell>
  );
}
