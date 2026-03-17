import { Suspense } from "react";
import WaitlistContent from "./WaitlistContent";

export default function WaitlistPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12" />}>
      <WaitlistContent />
    </Suspense>
  );
}
