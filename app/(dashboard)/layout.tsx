"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Subscription } from "@/types";

// Context to share refresh function across components
interface DashboardContextType {
  refreshData: () => void;
  profile: Profile | null;
  subscription: Subscription | null;
}

const DashboardContext = createContext<DashboardContextType>({
  refreshData: () => {},
  profile: null,
  subscription: null,
});

export const useDashboard = () => useContext(DashboardContext);

// Mobile bottom tabs
const MOBILE_TABS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/diary", label: "AI Diary", icon: "💬" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const [profileRes, subRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (subRes.data) setSubscription(subRes.data);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshData = useCallback(() => {
    setRefreshKey(k => k + 1);
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isTrialing = subscription?.status === "trialing";
  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  // Check if we're on the main dashboard (not diary or settings)
  const isMainDashboard = pathname === "/dashboard";
  const isDiary = pathname === "/dashboard/diary";

  return (
    <DashboardContext.Provider value={{ refreshData, profile, subscription }}>
      <div className="min-h-screen bg-background">
        {/* Desktop Header */}
        <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between w-full px-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-2xl">🧮</span>
              <span className="font-display font-bold text-xl">
                Losing Weight is Math
              </span>
            </Link>

            <div className="flex items-center gap-4">
              {/* Trial banner */}
              {isTrialing && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20">
                  <span className="text-sm text-gold">
                    🎉 {trialDaysLeft} days left
                  </span>
                  <Link href="/dashboard/subscribe">
                    <Button size="sm" className="h-7 bg-gold hover:bg-gold/90 text-background">
                      Upgrade
                    </Button>
                  </Link>
                </div>
              )}

              {/* User menu */}
              {profile && (
                <div className="flex items-center gap-3">
                  <Link href="/dashboard/settings">
                    <Button variant="ghost" size="sm">
                      <span className="mr-2">⚙️</span>
                      Settings
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="font-display font-bold text-primary text-sm">
                        {profile.first_name[0]}
                      </span>
                    </div>
                    <span className="font-medium">{profile.first_name}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    Logout
                  </Button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧮</span>
              <span className="font-display font-bold">LWIM</span>
            </div>
            {isTrialing && (
              <Link href="/dashboard/subscribe">
                <span className="text-xs text-gold bg-gold/10 px-2 py-1 rounded-full">
                  {trialDaysLeft}d left
                </span>
              </Link>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="pt-14 lg:pt-16 pb-20 lg:pb-0">
          <div key={refreshKey}>{children}</div>
        </main>

        {/* Mobile Bottom Tabs */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="flex items-center justify-around h-full">
            {MOBILE_TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center gap-1"
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className={`text-2xl ${isActive ? "" : "opacity-50"}`}
                  >
                    {tab.icon}
                  </motion.div>
                  <span
                    className={`text-xs ${
                      isActive ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 w-12 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </DashboardContext.Provider>
  );
}
