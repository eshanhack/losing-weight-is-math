"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDashboard } from "../../layout";

const PLANS = [
  {
    name: "Monthly",
    price: "$24.95",
    period: "/month",
    priceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
    popular: false,
  },
  {
    name: "Annual",
    price: "$179",
    period: "/year",
    priceId: process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID,
    popular: true,
    savings: "Save 40%",
  },
];

export default function SubscribePage() {
  const { profile, subscription } = useDashboard();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (priceId: string | undefined) => {
    if (!priceId) return;
    setLoading(priceId);

    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await response.json();

      if (error) {
        console.error("Checkout error:", error);
        setLoading(null);
        return;
      }

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error("Error:", error);
      setLoading(null);
    }
  };

  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active";

  if (isActive) {
    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto pb-24 lg:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="text-center py-12">
            <span className="text-6xl">✨</span>
            <h1 className="font-display text-3xl font-bold mt-4">
              You're a Pro Member!
            </h1>
            <p className="text-muted-foreground mt-2">
              Thanks for supporting Losing Weight is Math
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto pb-24 lg:pb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <span className="text-5xl">🚀</span>
          <h1 className="font-display text-3xl font-bold mt-4">
            Upgrade to Pro
          </h1>
          <p className="text-muted-foreground mt-2">
            {isTrialing
              ? `Your trial ends in ${trialDaysLeft} days. Keep your progress going!`
              : "Unlock unlimited access to all features"}
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: plan.popular ? 0.1 : 0 }}
            >
              <Card
                className={`p-6 bg-card border-border relative overflow-hidden ${
                  plan.popular ? "border-primary" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">
                    {plan.savings}
                  </div>
                )}

                <h2 className="font-display font-semibold text-xl">
                  {plan.name}
                </h2>

                <div className="mt-4">
                  <span className="font-display text-4xl font-bold">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-success">✓</span>
                    Unlimited AI food logging
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">✓</span>
                    Full calendar access
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">✓</span>
                    Weight predictions & analytics
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">✓</span>
                    Streak tracking & achievements
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">✓</span>
                    Priority support
                  </li>
                </ul>

                <Button
                  onClick={() => handleSubscribe(plan.priceId)}
                  disabled={loading !== null}
                  className={`w-full mt-6 ${
                    plan.popular
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-secondary hover:bg-secondary/80"
                  }`}
                >
                  {loading === plan.priceId
                    ? "Loading..."
                    : `Choose ${plan.name}`}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="text-center text-sm text-muted-foreground">
          <p>🔒 Secure payment via Stripe</p>
          <p className="mt-1">Cancel anytime • No hidden fees</p>
        </div>
      </motion.div>
    </div>
  );
}


