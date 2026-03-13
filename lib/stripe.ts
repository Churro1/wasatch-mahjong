import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

export function getStripe() {
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"));
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}