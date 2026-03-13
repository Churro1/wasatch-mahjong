import { Suspense } from "react";
import { Card } from "@/components/Card";
import SuccessContent from "./SuccessContent";

function SuccessFallback() {
  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <Card>
          <p className="text-[color:var(--wasatch-gray)] text-center">Loading your confirmation...</p>
        </Card>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<SuccessFallback />}>
      <SuccessContent />
    </Suspense>
  );
}