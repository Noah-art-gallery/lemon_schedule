import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="레몬스케줄 할 일">
      <span className="brand__mark" aria-hidden="true">
        <Image src="/images/lemon-schedule-logo.jpg" alt="" width={40} height={40} priority />
      </span>
      <span className="brand__name">레몬스케줄</span>
    </Link>
  );
}
