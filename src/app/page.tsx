import { Check, Clock3, Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";

export default function HomePage() {
  return (
    <AppShell notificationCount={2}>
      <PageHeading
        eyebrow="9월 17일 목요일"
        title="오늘도 한 걸음, 같이 해요"
        description="작은 완료가 쌓일수록 레몬 펫도 함께 자라요."
        action={
          <Link className="button button--primary button--md" href="/?new-task=1">
            <Plus size={18} aria-hidden="true" />
            <span>할 일 추가</span>
          </Link>
        }
      />

      <section className="home-grid" aria-label="오늘 요약">
        <Card as="section" tone="lemon" className="pet-summary">
          <div className="pet-summary__copy">
            <span className="status-pill">
              <Sparkles size={14} aria-hidden="true" /> 레몬 펫의 응원
            </span>
            <h2>벌써 두 가지나 해냈어요!</h2>
            <p>한 번만 더 완료하면 오늘의 목표를 모두 채워요.</p>
          </div>
          <Image
            src="/images/lemon-pet-default.png"
            alt="두 팔을 들고 응원하는 기본 레몬 펫"
            width={240}
            height={240}
            className="pet-summary__image"
            priority
          />
          <ProgressRing completed={2} total={3} />
        </Card>

        <Card as="section" className="task-section" aria-labelledby="today-tasks-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2 id="today-tasks-title">오늘 할 일</h2>
            </div>
            <span className="task-count">2 / 3</span>
          </div>
          <ul className="task-list">
            <li className="task-row task-row--completed">
              <button type="button" className="task-check" aria-label="물 2잔 마시기 완료 취소">
                <Check size={17} aria-hidden="true" />
              </button>
              <span className="task-row__body">
                <strong>물 2잔 마시기</strong>
                <small>완료했어요</small>
              </span>
            </li>
            <li className="task-row task-row--completed">
              <button type="button" className="task-check" aria-label="영어 단어 10개 완료 취소">
                <Check size={17} aria-hidden="true" />
              </button>
              <span className="task-row__body">
                <strong>영어 단어 10개</strong>
                <small>매일 반복</small>
              </span>
            </li>
            <li className="task-row">
              <button type="button" className="task-check" aria-label="저녁 산책 완료로 표시" />
              <span className="task-row__body">
                <strong>저녁 산책</strong>
                <small>
                  <Clock3 size={13} aria-hidden="true" /> 오후 7:30
                </small>
              </span>
            </li>
          </ul>
        </Card>
      </section>

      <Card as="section" className="overdue-card" aria-labelledby="overdue-title">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow eyebrow--warm">DON&apos;T FORGET</p>
            <h2 id="overdue-title">밀린 할 일</h2>
          </div>
          <span className="overdue-count">1</span>
        </div>
        <div className="task-row task-row--overdue">
          <button type="button" className="task-check" aria-label="책상 정리 완료로 표시" />
          <span className="task-row__body">
            <strong>책상 정리</strong>
            <small>어제 · 완료하면 친구들에게 알려요</small>
          </span>
        </div>
      </Card>
    </AppShell>
  );
}
