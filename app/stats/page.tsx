"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

interface Stats {
  totalUsers: number;
  activeSubscribers: number;
  monthlySubscribers: number;
  annualSubscribers: number;
  trialUsers: number;
  conversionRate: number;
  totalWeightLost: number;
  signupsToday: number;
  signupsThisWeek: number;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminAndFetchStats();
  }, []);

  const checkAdminAndFetchStats = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Check if admin
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (user.email !== adminEmail) {
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    // Fetch stats - in production this would use the service role
    // For now, we'll use mock data
    setStats({
      totalUsers: 1247,
      activeSubscribers: 312,
      monthlySubscribers: 198,
      annualSubscribers: 114,
      trialUsers: 89,
      conversionRate: 25.0,
      totalWeightLost: 4892,
      signupsToday: 23,
      signupsThisWeek: 156,
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 bg-card border-border text-center">
          <p className="text-2xl mb-2">🔒</p>
          <h1 className="font-display text-xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            This page is only accessible to administrators.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-8">
            <span className="text-4xl">📊</span>
            <div>
              <h1 className="font-display text-3xl font-bold">Admin Stats</h1>
              <p className="text-muted-foreground">
                Real-time analytics dashboard
              </p>
            </div>
          </div>

          {/* Hero stat */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="p-8 bg-gradient-to-br from-success/20 to-success/5 border-success/20 text-center">
              <p className="text-muted-foreground mb-2">
                Total Weight Lost by Users
              </p>
              <p className="font-display text-6xl font-bold text-success">
                {stats?.totalWeightLost.toLocaleString()}
              </p>
              <p className="text-2xl text-muted-foreground mt-2">kg</p>
            </Card>
          </motion.div>

          {/* Main stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6 bg-card border-border">
                <p className="text-sm text-muted-foreground mb-1">
                  Total Users
                </p>
                <p className="font-display text-3xl font-bold">
                  {stats?.totalUsers.toLocaleString()}
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card className="p-6 bg-card border-border">
                <p className="text-sm text-muted-foreground mb-1">
                  Active Subscribers
                </p>
                <p className="font-display text-3xl font-bold text-primary">
                  {stats?.activeSubscribers.toLocaleString()}
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-6 bg-card border-border">
                <p className="text-sm text-muted-foreground mb-1">
                  Trial Users
                </p>
                <p className="font-display text-3xl font-bold text-gold">
                  {stats?.trialUsers.toLocaleString()}
                </p>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card className="p-6 bg-card border-border">
                <p className="text-sm text-muted-foreground mb-1">
                  Conversion Rate
                </p>
                <p className="font-display text-3xl font-bold text-success">
                  {stats?.conversionRate}%
                </p>
              </Card>
            </motion.div>
          </div>

          {/* Subscription breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="p-6 bg-card border-border">
                <h2 className="font-display text-lg font-semibold mb-4">
                  Subscription Breakdown
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Monthly</span>
                    <span className="font-display font-bold">
                      {stats?.monthlySubscribers}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{
                        width: `${
                          ((stats?.monthlySubscribers || 0) /
                            (stats?.activeSubscribers || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Annual</span>
                    <span className="font-display font-bold">
                      {stats?.annualSubscribers}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-gold h-2 rounded-full"
                      style={{
                        width: `${
                          ((stats?.annualSubscribers || 0) /
                            (stats?.activeSubscribers || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Card className="p-6 bg-card border-border">
                <h2 className="font-display text-lg font-semibold mb-4">
                  Recent Signups
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Today</span>
                    <span className="font-display text-2xl font-bold text-success">
                      +{stats?.signupsToday}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">This Week</span>
                    <span className="font-display text-2xl font-bold">
                      +{stats?.signupsThisWeek}
                    </span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Funnel visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="p-6 bg-card border-border">
              <h2 className="font-display text-lg font-semibold mb-6">
                Conversion Funnel
              </h2>
              <div className="space-y-4">
                {[
                  {
                    label: "Total Users",
                    value: stats?.totalUsers || 0,
                    width: 100,
                  },
                  {
                    label: "Active (7+ days)",
                    value: Math.round((stats?.totalUsers || 0) * 0.6),
                    width: 60,
                  },
                  {
                    label: "Completed Trial",
                    value: Math.round((stats?.totalUsers || 0) * 0.4),
                    width: 40,
                  },
                  {
                    label: "Paid Subscribers",
                    value: stats?.activeSubscribers || 0,
                    width: 25,
                  },
                ].map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-muted-foreground">
                        {step.label}
                      </span>
                      <span className="font-display font-bold">
                        {step.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded h-8 overflow-hidden">
                      <div
                        className="h-full bg-primary/30 rounded transition-all duration-500"
                        style={{ width: `${step.width}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

