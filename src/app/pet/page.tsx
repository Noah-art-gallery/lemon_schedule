import { Palette, Sparkles } from "lucide-react";
import Image from "next/image";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PetPage() {
  return (
    <AppShell>
      <PageHeading
        eyebrow="MY LEMON PET"
        title="나만의 펫"
        description="직접 그린 펫과 함께 완료를 차곡차곡 쌓아보세요."
      />
      <section className="pet-page-grid">
        <Card tone="lemon" className="pet-stage">
          <span className="level-badge">LEVEL 1</span>
          <Image
            src="/images/lemon-pet-default.png"
            alt="아직 직접 그린 펫이 없을 때 보이는 기본 레몬 펫"
            width={360}
            height={360}
            className="pet-stage__image"
            priority
          />
          <div className="pet-stage__message">
            <Sparkles size={17} aria-hidden="true" /> 오늘의 완료를 기다리고 있어요!
          </div>
        </Card>
        <Card className="pet-details">
          <p className="eyebrow">GROWTH</p>
          <h2>레몬 포인트 0</h2>
          <p>할 일을 처음 완료할 때마다 1포인트를 받아요.</p>
          <div className="level-progress" aria-label="다음 레벨까지 0 / 5 포인트">
            <span style={{ width: "0%" }} />
          </div>
          <Button fullWidth size="lg">
            <Palette size={18} aria-hidden="true" /> 빈 도화지에서 그리기
          </Button>
        </Card>
      </section>
    </AppShell>
  );
}
