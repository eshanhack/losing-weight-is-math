"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITY_DESCRIPTIONS, type ActivityLevel } from "@/lib/math";
import type { Profile, Subscription } from "@/types";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form fields
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedentary");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const [profileRes, subRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setGoalWeight(profileRes.data.goal_weight_kg.toString());
        setGoalDate(profileRes.data.goal_date);
        setActivityLevel(profileRes.data.activity_level);
      }
      if (subRes.data) setSubscription(subRes.data);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        goal_weight_kg: parseFloat(goalWeight),
        goal_date: goalDate,
        activity_level: activityLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to save changes" });
    } else {
      setMessage({ type: "success", text: "Settings saved!" });
      fetchData();
    }

    setSaving(false);
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your subscription?")) return;

    // In production, this would call Stripe to cancel
    alert("Please contact support to cancel your subscription.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-3xl font-bold mb-8">Settings</h1>

        {/* Profile section */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display text-xl font-semibold mb-4">Profile</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">First Name</Label>
                <p className="font-medium">{profile?.first_name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Name</Label>
                <p className="font-medium">{profile?.last_name}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="font-medium">{profile?.email}</p>
            </div>
          </div>
        </Card>

        {/* Goal section */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display text-xl font-semibold mb-4">Goal</h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="goalWeight">Goal Weight (kg)</Label>
              <Input
                id="goalWeight"
                type="number"
                step="0.1"
                value={goalWeight}
                onChange={(e) => setGoalWeight(e.target.value)}
                className="bg-background mt-1"
              />
            </div>
            <div>
              <Label htmlFor="goalDate">Target Date</Label>
              <Input
                id="goalDate"
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="bg-background mt-1"
              />
            </div>
            <div>
              <Label>Activity Level</Label>
              <div className="space-y-2 mt-2">
                {(Object.keys(ACTIVITY_DESCRIPTIONS) as ActivityLevel[]).map(
                  (level) => (
                    <Button
                      key={level}
                      type="button"
                      variant={activityLevel === level ? "default" : "outline"}
                      onClick={() => setActivityLevel(level)}
                      className="w-full justify-start text-left h-auto py-3"
                    >
                      <div>
                        <div className="font-medium capitalize">
                          {level.replace("_", " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ACTIVITY_DESCRIPTIONS[level]}
                        </div>
                      </div>
                    </Button>
                  )
                )}
              </div>
            </div>

            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === "success"
                    ? "bg-success-muted text-success"
                    : "bg-danger-muted text-danger"
                }`}
              >
                {message.text}
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>

        {/* Subscription section */}
        <Card className="p-6 bg-card border-border mb-6">
          <h2 className="font-display text-xl font-semibold mb-4">
            Subscription
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <p className="font-medium capitalize flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      subscription?.status === "active"
                        ? "bg-success"
                        : subscription?.status === "trialing"
                        ? "bg-gold"
                        : "bg-danger"
                    }`}
                  />
                  {subscription?.status || "Unknown"}
                </p>
              </div>
              <div className="text-right">
                <Label className="text-muted-foreground">Plan</Label>
                <p className="font-medium capitalize">
                  {subscription?.plan_type || "Trial"}
                </p>
              </div>
            </div>

            {subscription?.status === "trialing" && subscription.trial_ends_at && (
              <div className="p-3 rounded-lg bg-gold/10 border border-gold/20">
                <p className="text-sm text-gold">
                  Trial ends:{" "}
                  {new Date(subscription.trial_ends_at).toLocaleDateString()}
                </p>
              </div>
            )}

            {subscription?.current_period_ends_at && (
              <div>
                <Label className="text-muted-foreground">
                  {subscription.status === "active"
                    ? "Next billing date"
                    : "Access until"}
                </Label>
                <p className="font-medium">
                  {new Date(
                    subscription.current_period_ends_at
                  ).toLocaleDateString()}
                </p>
              </div>
            )}

            {subscription?.status === "active" && (
              <Button
                variant="outline"
                className="w-full text-danger hover:text-danger"
                onClick={handleCancelSubscription}
              >
                Cancel Subscription
              </Button>
            )}

            {subscription?.status === "trialing" && (
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => (window.location.href = "/dashboard/subscribe")}
              >
                Upgrade Now
              </Button>
            )}
          </div>
        </Card>

        {/* Danger zone */}
        <Card className="p-6 bg-card border-danger/20">
          <h2 className="font-display text-xl font-semibold mb-4 text-danger">
            Danger Zone
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your account, there is no going back. Please be
            certain.
          </p>
          <Button
            variant="outline"
            className="text-danger hover:text-danger border-danger/20 hover:border-danger/50"
            onClick={() =>
              alert("Please contact support to delete your account.")
            }
          >
            Delete Account
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

