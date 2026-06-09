import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSiteOrigin } from "@/lib/siteUrl";
import { getPassProductBySlug } from "@/lib/passes";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe = getStripe();
  const siteOrigin = getSiteOrigin(req);
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { passSlug } = await req.json();
  const passProduct = getPassProductBySlug(typeof passSlug === "string" ? passSlug : "social-six-pass");

  if (!passProduct) {
    return NextResponse.json({ error: "Pass not found." }, { status: 404 });
  }

  const purchaserEmail = user.email || "";
  const purchaserName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : purchaserEmail.split("@")[0] || "Wasatch Mahjong Guest";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${siteOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}/passes`,
      customer_email: purchaserEmail || undefined,
      client_reference_id: user.id,
      metadata: {
        purchaseType: "pass",
        passSlug: passProduct.slug,
        passName: passProduct.name,
        passUses: String(passProduct.totalUses),
        passPrice: String(passProduct.priceCents),
        purchaserUserId: user.id,
        purchaserEmail,
        purchaserName,
        currency: "usd",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: passProduct.priceCents,
            product_data: {
              name: passProduct.name,
              description: passProduct.shortDescription,
            },
          },
        },
      ],
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create pass checkout session." },
      { status: 500 }
    );
  }
}