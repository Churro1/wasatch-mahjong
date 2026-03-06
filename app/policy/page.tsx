import { Card } from "@/components/Card";

export default function PolicyPage() {
  return (
    <main className="min-h-screen bg-[color:var(--wasatch-bg1)] px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <Card>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[color:var(--wasatch-blue)] mb-6">
            Terms & Cancellation Policy
          </h1>

          <div className="space-y-5 text-[color:var(--wasatch-gray)] leading-7">
            <section>
              <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-2">Bookings</h2>
              <p>
                Event bookings are confirmed only after successful payment. Class and open play capacity is limited,
                and spots are first-come, first-served.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-2">Cancellations</h2>
              <p>
                If you need to cancel, please do so from your dashboard as early as possible. Refund eligibility may
                depend on timing and whether your spot can be reassigned from the waitlist.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-2">Waitlist</h2>
              <p>
                If an event is full, you can join the waitlist. If a seat opens, we will contact you with next steps.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-bold text-[color:var(--wasatch-red)] mb-2">Contact</h2>
              <p>
                For policy questions, contact us from the Contact page. We are happy to help.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </main>
  );
}