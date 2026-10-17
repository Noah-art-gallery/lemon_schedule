import { CharacterSprite } from "@/components/ui/character-sprite";
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
    <CharacterSprite
      name={`reaction-${reaction}`}
      alt={decorative ? "" : reactionLabels[reaction]}
      size={32}
      className={`${styles.reactionImage} ${className}`.trim()}
    />
  );
}
