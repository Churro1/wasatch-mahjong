import { Suspense } from "react";
import { Card } from "@/components/Card";
import CartContent from "./CartContent";

function CartFallback() {
  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] text-center mb-6">
          Cart
        </h1>
        <Card>
          <p className="text-[color:var(--wasatch-gray)] text-center">Loading your cart...</p>
        </Card>
      </div>
    </main>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<CartFallback />}>
      <CartContent />
    </Suspense>
  );
}