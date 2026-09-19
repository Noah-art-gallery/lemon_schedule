import { Ban, Copy, LogOut, PencilLine } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ProfilePage() {
  return (
    <AppShell>
      <PageHeading
        eyebrow="MY PROFILE"
        title="내 정보"
        description="프로필과 초대 정보를 관리해요."
      />
      <div className="settings-stack">
        <Card as="section" className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            레
          </span>
          <div>
            <p className="eyebrow">NICKNAME</p>
            <h2>레몬 친구</h2>
            <p>Asia/Seoul</p>
          </div>
          <Button variant="secondary" size="sm">
            <PencilLine size={16} aria-hidden="true" /> 수정
          </Button>
        </Card>
        <Card as="section" className="invite-card">
          <div>
            <p className="eyebrow">MY INVITE CODE</p>
            <h2>LEMON0001</h2>
            <p>이 코드를 공유하면 상대가 연결 요청을 보낼 수 있어요.</p>
          </div>
          <Button variant="secondary">
            <Copy size={17} aria-hidden="true" /> 복사
          </Button>
        </Card>
        <div className="settings-actions">
          <Button variant="ghost">
            <Ban size={18} aria-hidden="true" /> 차단 목록
          </Button>
          <Button variant="ghost">
            <LogOut size={18} aria-hidden="true" /> 로그아웃
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
