"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/date-utils";

interface Notification {
  id: string;
  user_id: string;
  type: "food" | "exercise" | "edit" | "delete" | "weight" | "goal" | "streak" | "system";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const NOTIFICATION_ICONS: Record<string, string> = {
  food: "🍽️",
  exercise: "🏃",
  edit: "📝",
  delete: "🗑️",
  weight: "⚖️",
  goal: "🎯",
  streak: "🔥",
  system: "ℹ️",
};

const NOTIFICATION_COLORS: Record<string, string> = {
  food: "bg-primary/10 border-primary/20",
  exercise: "bg-success/10 border-success/20",
  edit: "bg-gold/10 border-gold/20",
  delete: "bg-danger/10 border-danger/20",
  weight: "bg-primary/10 border-primary/20",
  goal: "bg-success/10 border-success/20",
  streak: "bg-gold/10 border-gold/20",
  system: "bg-secondary border-border",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error loading notifications:", error);
      // If table doesn't exist, show empty state
      setNotifications([]);
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  };

  const clearAllNotifications = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id);

    setNotifications([]);
  };

  const filteredNotifications = filter === "all" 
    ? notifications 
    : notifications.filter(n => n.type === filter);

  const groupByDate = (items: Notification[]) => {
    const groups: Record<string, Notification[]> = {};
    items.forEach(item => {
      const date = new Date(item.created_at).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return groups;
  };

  const groupedNotifications = groupByDate(filteredNotifications);

  const filterButtons = [
    { key: "all", label: "All", icon: "📋" },
    { key: "food", label: "Food", icon: "🍽️" },
    { key: "exercise", label: "Exercise", icon: "🏃" },
    { key: "edit", label: "Edits", icon: "📝" },
    { key: "delete", label: "Deleted", icon: "🗑️" },
    { key: "weight", label: "Weight", icon: "⚖️" },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-foreground">
            Activity Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track all your food logs, exercises, and changes
          </p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={clearAllNotifications}
            className="text-sm text-muted-foreground hover:text-danger transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
              filter === btn.key
                ? "bg-primary text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{btn.icon}</span>
            <span>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading activity...
        </div>
      ) : Object.keys(groupedNotifications).length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="font-display font-semibold text-lg text-foreground mb-2">
            No activity yet
          </h3>
          <p className="text-muted-foreground text-sm">
            Your food logs, exercises, and edits will appear here.
            <br />
            Start by logging something in the AI Diary!
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNotifications).map(([date, items]) => (
            <div key={date} className="space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                {date}
              </h3>
              <div className="space-y-2">
                {items.map((notification, idx) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className={`p-4 border ${NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.system}`}>
                      <div className="flex items-start gap-3">
                        <div className="text-2xl shrink-0">
                          {NOTIFICATION_ICONS[notification.type] || "📌"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-medium text-foreground truncate">
                              {notification.title}
                            </h4>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(notification.created_at).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {notification.message}
                          </p>
                          {notification.metadata && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {typeof notification.metadata.calories === 'number' && notification.metadata.calories > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-background/50">
                                  {notification.metadata.calories} cal
                                </span>
                              )}
                              {typeof notification.metadata.protein === 'number' && notification.metadata.protein > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-background/50">
                                  {notification.metadata.protein}g protein
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

