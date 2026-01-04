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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import { useToast } from "@/components/ui/toast-provider";
import type { Profile } from "@/types";

export default function SettingsPage() {
  const { profile: contextProfile, subscription, refreshData } = useDashboard();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

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
        goal_date: profile.goal_date,
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

  const handleResetAccount = async () => {
    if (resetConfirmText !== "RESET") return;
    
    setResetting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      showToast("You must be logged in", "error");
      setResetting(false);
      return;
    }

    try {
      // Delete all log entries first (they reference daily_logs)
      const { data: logs } = await supabase
        .from("daily_logs")
        .select("id")
        .eq("user_id", user.id);
      
      if (logs && logs.length > 0) {
        const logIds = logs.map(l => l.id);
        await supabase
          .from("log_entries")
          .delete()
          .in("daily_log_id", logIds);
      }

      // Delete daily logs
      await supabase
        .from("daily_logs")
        .delete()
        .eq("user_id", user.id);

      // Delete chat messages
      await supabase
        .from("chat_messages")
        .delete()
        .eq("user_id", user.id);

      // Delete notifications
      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id);

      // Reset current weight to starting weight in profile
      if (contextProfile) {
        await supabase
          .from("profiles")
          .update({ current_weight_kg: contextProfile.starting_weight_kg })
          .eq("id", user.id);
      }

      showToast("Account data reset successfully!", "success");
      setShowResetDialog(false);
      setResetConfirmText("");
      refreshData();
      
      // Reload the page to refresh everything
      window.location.reload();
    } catch (error) {
      console.error("Error resetting account:", error);
      showToast("Failed to reset account", "error");
    } finally {
      setResetting(false);
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
                onValueChange={(v) => setProfile({ ...profile, gender: v as "male" | "female" | "other" })}
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
                <Label>Goal Date</Label>
                <Input
                  type="date"
                  value={profile.goal_date || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, goal_date: e.target.value })
                  }
                  className="bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Activity Level</Label>
              <Select
                value={profile.activity_level || ""}
                onValueChange={(v) => setProfile({ ...profile, activity_level: v as "sedentary" | "light" | "moderate" | "active" | "very_active" })}
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
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full"
            >
              Log Out
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-4 bg-card border-danger/30">
          <h2 className="font-display font-semibold mb-2 text-danger">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Reset your account to start fresh. This will delete all your food logs, 
            exercise entries, weight history, and chat messages. Your profile information 
            (name, height, age, goals) will be kept.
          </p>
          <Button
            variant="outline"
            onClick={() => setShowResetDialog(true)}
            className="w-full border-danger/30 text-danger hover:bg-danger/10"
          >
            🔄 Reset Account Data
          </Button>
        </Card>
      </motion.div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-danger flex items-center gap-2">
              ⚠️ Reset Account Data
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This action cannot be undone. This will permanently delete:
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-danger">✕</span>
                <span>All daily food & calorie logs</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-danger">✕</span>
                <span>All exercise entries</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-danger">✕</span>
                <span>All weight history</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-danger">✕</span>
                <span>All AI diary chat messages</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-danger">✕</span>
                <span>All activity notifications</span>
              </li>
            </ul>
            
            <div className="mt-4 p-3 bg-success/10 rounded-lg">
              <p className="text-sm text-success flex items-center gap-2">
                <span>✓</span>
                <span>Your profile (name, height, age, goals) will be kept</span>
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <Label className="text-muted-foreground">
                Type <span className="font-mono font-bold text-foreground">RESET</span> to confirm
              </Label>
              <Input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                placeholder="Type RESET"
                className="bg-background font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowResetDialog(false); setResetConfirmText(""); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetAccount}
              disabled={resetConfirmText !== "RESET" || resetting}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {resetting ? "Resetting..." : "Reset All Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

