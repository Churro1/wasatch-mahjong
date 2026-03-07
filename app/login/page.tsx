import { Suspense } from "react";
import { Card } from "@/components/Card";
import LoginContent from "./LoginContent";

function LoginFallback() {
  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-[color:var(--wasatch-blue)] text-center mb-3">Log In</h1>
        <p className="text-[color:var(--wasatch-gray)] text-center">Loading sign-in form...</p>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
