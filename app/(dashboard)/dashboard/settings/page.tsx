"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import type { Profile } from "@/types";

export default function SettingsPage() {
  const { profile: contextProfile, subscription, refreshData } = useDashboard();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
    }
  }, [contextProfile]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMessage({ type: "error", text: "You must be logged in" });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        height_cm: profile.height_cm,
        current_weight_kg: profile.current_weight_kg,
        goal_weight_kg: profile.goal_weight_kg,
        target_date: profile.target_date,
        activity_level: profile.activity_level,
        gender: profile.gender,
      })
      .eq("id", user.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to save changes" });
    } else {
      setMessage({ type: "success", text: "Settings saved!" });
      refreshData();
    }

    setSaving(false);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
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

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto pb-24 lg:pb-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your profile and subscription
          </p>
        </div>

        {/* Subscription Status */}
        <Card className="p-4 bg-gradient-to-r from-gold/10 to-primary/10 border-gold/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Subscription
              </p>
              <p className="font-display font-semibold text-lg">
                {subscription?.status === "active"
                  ? "Pro Member ✨"
                  : subscription?.status === "trialing"
                  ? `Trial (${trialDaysLeft} days left)`
                  : "Free"}
              </p>
            </div>
            {subscription?.status !== "active" && (
              <Button asChild className="bg-gold hover:bg-gold/90 text-background">
                <a href="/dashboard/subscribe">Upgrade</a>
              </Button>
            )}
          </div>
        </Card>

        {/* Profile Settings */}
        <Card className="p-4 bg-card border-border">
          <h2 className="font-display font-semibold mb-4">Profile</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={profile.first_name || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, first_name: e.target.value })
                  }
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={profile.last_name || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, last_name: e.target.value })
                  }
                  className="bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={profile.gender || ""}
                onValueChange={(v) => setProfile({ ...profile, gender: v })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Height (cm)</Label>
                <Input
                  type="number"
                  value={profile.height_cm || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, height_cm: parseFloat(e.target.value) })
                  }
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Current Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={profile.current_weight_kg || ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      current_weight_kg: parseFloat(e.target.value),
                    })
                  }
                  className="bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Goal Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={profile.goal_weight_kg || ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      goal_weight_kg: parseFloat(e.target.value),
                    })
                  }
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={profile.target_date || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, target_date: e.target.value })
                  }
                  className="bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Activity Level</Label>
              <Select
                value={profile.activity_level || ""}
                onValueChange={(v) => setProfile({ ...profile, activity_level: v })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select activity level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
                  <SelectItem value="light">Light (exercise 1-3 days/week)</SelectItem>
                  <SelectItem value="moderate">Moderate (exercise 3-5 days/week)</SelectItem>
                  <SelectItem value="active">Active (exercise 6-7 days/week)</SelectItem>
                  <SelectItem value="very_active">Very Active (hard exercise daily)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {message && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`mt-4 p-3 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {message.text}
            </motion.div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-4 bg-primary hover:bg-primary/90"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </Card>

        {/* Account Actions */}
        <Card className="p-4 bg-card border-border">
          <h2 className="font-display font-semibold mb-4">Account</h2>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full border-danger/30 text-danger hover:bg-danger/10"
          >
            Log Out
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

