import Image from "next/image";
import type { Reaction } from "@/types/contracts";
import styles from "@/features/tasks/task-experience.module.css";

export const reactionLabels = { lemon: "레몬", clap: "박수", heart: "좋아요", cheer: "응원" };

export function ReactionImage({
  reaction,
  decorative = false,
  className = "",
}: {
  reaction: Reaction;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={`/reactions/${reaction}.svg`}
      alt={decorative ? "" : reactionLabels[reaction]}
      width={32}
      height={32}
      unoptimized
      className={`${styles.reactionImage} ${className}`.trim()}
    />
  );
}
