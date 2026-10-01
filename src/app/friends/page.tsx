import { FriendsScreen } from "@/features/connections/friends-screen";
import { Suspense } from "react";

export default function FriendsPage() {
  return (
    <Suspense fallback={null}>
      <FriendsScreen />
    </Suspense>
  );
}
