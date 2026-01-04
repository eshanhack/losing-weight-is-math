"use client";

import { useState, useEffect, createContext, useContext, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { Profile, Subscription } from "@/types";

// Notification type icons
const NOTIFICATION_ICONS: Record<string, string> = {
  food: "🍽️",
  exercise: "🏃",
  weight: "⚖️",
  edit: "✏️",
  delete: "🗑️",
  goal: "🎯",
  streak: "🔥",
  system: "📢",
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
}

// Notifications Dropdown Component
function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, message, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      setNotifications(data || []);
    } catch (error) {
      console.log("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-9 h-9 rounded-lg bg-secondary flex items-center justify-center transition-colors ${
          isOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-secondary/50">
              <h3 className="font-display font-semibold text-sm">Recent Activity</h3>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center">
                  <div className="flex justify-center gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <span className="text-3xl mb-2 block">📭</span>
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Log some food or exercise to get started!</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <div 
                      key={notification.id} 
                      className="px-4 py-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5">
                          {NOTIFICATION_ICONS[notification.type] || "📋"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {notification.message}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer - View All */}
            <Link 
              href="/dashboard/notifications" 
              onClick={() => setIsOpen(false)}
              className="block px-4 py-3 text-center text-sm font-medium text-primary hover:bg-primary/5 border-t border-border transition-colors"
            >
              View all activity →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  { href: "/dashboard/notifications", label: "Activity", icon: "🔔" },
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
  // refreshKey removed - was causing full page remount

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

  return (
    <ToastProvider>
    <DashboardContext.Provider value={{ refreshData, profile, subscription }}>
      <div className="min-h-screen bg-background">
        {/* Desktop Header */}
        <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full px-6">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-lg">🔥</span>
              </div>
              <span className="font-display font-bold text-lg text-foreground">
                LoseWeight<span className="text-primary">Math</span>
              </span>
            </Link>

            {/* Center Nav */}
            <nav className="flex items-center gap-1">
              {[
                { href: "/dashboard", label: "DASHBOARD" },
                { href: "/dashboard/diary", label: "AI DIARY" },
                { href: "/dashboard/notifications", label: "ACTIVITY" },
                { href: "/dashboard/settings", label: "SETTINGS" },
              ].map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-4">
              {/* Trial badge */}
              {isTrialing && (
                <Link href="/dashboard/subscribe">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-sm text-primary font-medium">
                      🎉 {trialDaysLeft} days left
                    </span>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary text-white">
                      Upgrade
                    </span>
                  </div>
                </Link>
              )}

              {/* Notifications Dropdown */}
              <NotificationsDropdown />

              {/* User avatar */}
              {profile && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-gold flex items-center justify-center">
                    <span className="font-display font-bold text-white text-sm">
                      {profile.first_name[0]}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-primary">🔥</span>
              </div>
              <span className="font-display font-bold">LWM</span>
            </div>
            {isTrialing && (
              <Link href="/dashboard/subscribe">
                <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {trialDaysLeft}d left
                </span>
              </Link>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="pt-14 lg:pt-16 pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Tabs */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-around h-full">
            {MOBILE_TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center gap-1 relative"
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className={`text-2xl ${isActive ? "" : "opacity-40"}`}
                  >
                    {tab.icon}
                  </motion.div>
                  <span
                    className={`text-[10px] font-medium ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute -bottom-1 w-12 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </DashboardContext.Provider>
    </ToastProvider>
  );
}
