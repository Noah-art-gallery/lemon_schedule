import { Leaf } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="레몬스케줄 홈">
      <span className="brand__mark" aria-hidden="true">
        <span>●</span>
        <Leaf size={13} strokeWidth={2.6} />
      </span>
      <span className="brand__name">레몬스케줄</span>
    </Link>
  );
}
