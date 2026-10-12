import Link from "next/link";
import { CharacterSprite } from "@/components/ui/character-sprite";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="레몬스케줄 할 일">
      <span className="brand__mark" aria-hidden="true">
        <CharacterSprite name="avatar-lemon" size={30} />
      </span>
      <span className="brand__name">레몬스케줄</span>
    </Link>
  );
}
