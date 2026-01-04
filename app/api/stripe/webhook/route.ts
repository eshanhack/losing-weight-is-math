import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Lazy initialization of Stripe
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  return new Stripe(key);
}

// Lazy initialization of Supabase admin client
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

// Helper to safely get period end from subscription
function getPeriodEndDate(subscription: Record<string, unknown>): string {
  const periodEnd = subscription.current_period_end;
  if (typeof periodEnd === 'number') {
    return new Date(periodEnd * 1000).toISOString();
  }
  return new Date().toISOString();
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();

  if (!stripe || !supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const referralCode = session.metadata?.referral_code;

        if (userId && session.subscription) {
          // Get subscription details
          const subscriptionData = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          // Cast to Record for flexible property access
          const subscription = subscriptionData as unknown as Record<string, unknown>;

          // Determine plan type from items
          const items = subscription.items as { data?: Array<{ price?: { id?: string } }> };
          const priceId = items?.data?.[0]?.price?.id;
          const planType =
            priceId === process.env.STRIPE_MONTHLY_PRICE_ID
              ? "monthly"
              : "annual";

          // Update subscription in database
          await supabase
            .from("subscriptions")
            .update({
              stripe_subscription_id: subscription.id as string,
              plan_type: planType,
              status: "active",
              current_period_ends_at: getPeriodEndDate(subscription),
              referral_code_used: referralCode || null,
            })
            .eq("user_id", userId);

          // Update referral code usage
          if (referralCode) {
            const { data: refCode } = await supabase
              .from("referral_codes")
              .select("uses_count")
              .eq("code", referralCode)
              .single();
            
            if (refCode) {
              await supabase
                .from("referral_codes")
                .update({ uses_count: (refCode.uses_count || 0) + 1 })
                .eq("code", referralCode);
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscriptionEvent = event.data.object;
        const subscription = subscriptionEvent as unknown as Record<string, unknown>;

        // Find user by stripe subscription ID
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id as string)
          .single();

        if (sub) {
          await supabase
            .from("subscriptions")
            .update({
              status: subscription.status === "active" ? "active" : "past_due",
              current_period_ends_at: getPeriodEndDate(subscription),
            })
            .eq("user_id", sub.user_id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscriptionEvent = event.data.object;
        const subscription = subscriptionEvent as unknown as Record<string, unknown>;

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id as string)
          .single();

        if (sub) {
          await supabase
            .from("subscriptions")
            .update({
              status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("user_id", sub.user_id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (sub) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("user_id", sub.user_id);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
