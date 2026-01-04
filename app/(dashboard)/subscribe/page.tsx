"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SubscribePage() {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          referralCode: referralCode || undefined,
        }),
      });

      const { url, error } = await response.json();

      if (error) {
        alert(error);
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="font-display text-4xl font-bold mb-4">
          Keep Your Momentum
        </h1>
        <p className="text-muted-foreground text-lg">
          Your 7-day trial is over. Don't lose your progress.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Monthly Plan */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card
            className={`p-8 bg-card cursor-pointer transition-all ${
              selectedPlan === "monthly"
                ? "border-primary ring-2 ring-primary"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("monthly")}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Monthly</h2>
                <p className="text-sm text-muted-foreground">
                  Billed monthly
                </p>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === "monthly"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selectedPlan === "monthly" && (
                  <svg
                    className="w-4 h-4 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="mb-6">
              <span className="font-display text-4xl font-bold">$24.95</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Unlimited AI food logging
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Daily weight tracking
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Progress analytics
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Cancel anytime
              </li>
            </ul>
          </Card>
        </motion.div>

        {/* Annual Plan */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card
            className={`p-8 bg-card cursor-pointer transition-all relative overflow-hidden ${
              selectedPlan === "annual"
                ? "border-primary ring-2 ring-primary"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("annual")}
          >
            {/* Best value badge */}
            <div className="absolute top-4 right-4 bg-gold text-background text-xs font-bold px-3 py-1 rounded-full">
              SAVE 40%
            </div>

            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Annual</h2>
                <p className="text-sm text-muted-foreground">Billed yearly</p>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedPlan === "annual"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selectedPlan === "annual" && (
                  <svg
                    className="w-4 h-4 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="mb-6">
              <span className="font-display text-4xl font-bold">$179</span>
              <span className="text-muted-foreground">/year</span>
              <p className="text-sm text-success mt-1">
                $14.92/month — Save $120
              </p>
            </div>

            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Everything in Monthly
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Priority support
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                Early access to features
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gold">★</span>
                Best value
              </li>
            </ul>
          </Card>
        </motion.div>
      </div>

      {/* Referral code */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <Card className="p-6 bg-card border-border">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label className="text-sm text-muted-foreground block mb-2">
                Have a referral code?
              </label>
              <Input
                placeholder="Enter code"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="bg-background uppercase"
              />
            </div>
            {referralCode && (
              <div className="text-sm text-success">
                ✓ Code applied — 10% off!
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-center"
      >
        <Button
          size="lg"
          className="w-full sm:w-auto px-12 py-6 text-lg bg-primary hover:bg-primary/90"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            "Redirecting to checkout..."
          ) : (
            <>
              Subscribe —{" "}
              {selectedPlan === "monthly"
                ? referralCode
                  ? "$22.46/mo"
                  : "$24.95/mo"
                : referralCode
                ? "$161.10/yr"
                : "$179/yr"}
            </>
          )}
        </Button>

        <p className="text-sm text-muted-foreground mt-4">
          Secure payment powered by Stripe. Cancel anytime.
        </p>
      </motion.div>

      {/* Money back guarantee */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-12"
      >
        <Card className="p-6 bg-success-muted/20 border-success/20 text-center">
          <p className="font-display font-semibold text-lg mb-2">
            💚 30-Day Money Back Guarantee
          </p>
          <p className="text-sm text-muted-foreground">
            Not seeing results? Get a full refund within 30 days, no questions
            asked.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}

