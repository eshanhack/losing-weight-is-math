"use client";

import { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { getLocalDateString, formatTime } from "@/lib/date-utils";
import { useToast } from "@/components/ui/toast-provider";
import { 
  logNotification, 
  createFoodNotification, 
  createExerciseNotification, 
  createEditNotification, 
  createDeleteNotification,
  createWeightNotification,
} from "@/lib/notifications";
import {
  calculateAge,
  calculateBMR,
  calculateTDEE,
  calculateDailyBalance,
  calculateRealWeight,
  calculate7DayBalance,
  predictWeight30Days,
  calculateStreak,
  calculateProteinGoal,
  formatBalance,
  formatBalanceWithGoal,
  calculateRequiredDailyDeficit,
} from "@/lib/math";
import type { Profile, DailyLog, Subscription, AIParseResponse, LogEntry } from "@/types";

// ============================================================================
// RESIZABLE PANEL HOOK
// ============================================================================

function useResizable(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          setWidth(newWidth);
        }
      }
    },
    [isResizing, minWidth, maxWidth]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return { width, isResizing, startResizing };
}

// ============================================================================
// TYPES
// ============================================================================

interface CalendarDay {
  date: string;
  dayOfMonth: number;
  weight: number | null;
  weightChange: number | null; // Difference from previous day
  balance: number;
  protein: number;
  isSuccess: boolean;
  isLocked: boolean;
  isFuture: boolean;
  isToday: boolean;
  hasData: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parsedData?: AIParseResponse;
  confirmed?: boolean;
  timestamp?: string; // ISO timestamp
}

interface DayEntry {
  id: string;
  description: string;
  calories: number;
  protein_grams: number;
  entry_type: "food" | "exercise";
  created_at: string;
}

// ============================================================================
// DASHBOARD STATS COMPONENT
// ============================================================================

// Progress bar component
function ProgressBar({ value, max, showGradient = false }: { value: number; max: number; showGradient?: boolean }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${
          showGradient ? "progress-gradient" : "bg-primary"
        }`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function DashboardStats({
  stats,
  calendar,
  profile,
  logs,
  onDayClick,
  onTodayCardClick,
  onRealWeightCardClick,
}: {
  stats: {
    todayBalance: number;
    todayIntake: number;
    todayOuttake: number;
    todayProtein: number;
    proteinGoal: number;
    maintenanceCalories: number;
    goalDeficit: number;
    sevenDayBalance: number;
    sevenDayAverage: number;
    realWeight: number | null;
    realWeightChange: number | null;
    predictedWeight: number | null;
    predictedChange: number | null;
    streak: number;
  };
  calendar: CalendarDay[];
  profile: Profile | null;
  logs: DailyLog[];
  onDayClick: (day: CalendarDay) => void;
  onTodayCardClick: () => void;
  onRealWeightCardClick: () => void;
}) {
  // Format balance with goal comparison
  const formattedBalance = formatBalanceWithGoal(stats.todayBalance, stats.goalDeficit);
  const formattedSevenDay = formatBalance(stats.sevenDayBalance);
  
  // Calculate progress: how much of your "calorie budget" have you used?
  // Budget = Maintenance - Goal deficit (e.g., 2000 - 1000 = 1000 cal budget)
  const caloriesBudget = stats.maintenanceCalories + stats.goalDeficit; // goalDeficit is negative, so this subtracts
  const caloriesUsed = stats.todayIntake - stats.todayOuttake; // Net intake after exercise
  const budgetProgress = caloriesBudget > 0 ? Math.round((caloriesUsed / caloriesBudget) * 100) : 0;
  const proteinProgress = stats.proteinGoal > 0 ? Math.round((stats.todayProtein / stats.proteinGoal) * 100) : 0;

  return (
    <div className="space-y-6 h-full custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-foreground">
            My Progress
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your daily caloric balance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill pill-success">Active</span>
          <span className="pill pill-muted">This Week</span>
        </div>
      </div>

      {/* Stat Cards - FitFuel style */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        {/* Card 1: Today's Balance - Clickable to see breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card 
            onClick={onTodayCardClick}
            className={`p-4 lg:p-5 bg-card border-border h-full card-hover cursor-pointer ${
              formattedBalance.color === "success" ? "border-success/30" : 
              formattedBalance.color === "warning" ? "border-gold/30" : 
              formattedBalance.color === "danger" ? "border-danger/30" : ""
            }`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`icon-container ${
                formattedBalance.color === "success" ? "bg-success/10" : 
                formattedBalance.color === "warning" ? "bg-gold/10" : 
                formattedBalance.color === "danger" ? "bg-danger/10" : "bg-primary/10"
              }`}>
                <span className="text-lg">📊</span>
              </div>
              <span className={`pill ${
                formattedBalance.color === "success" ? "pill-success" : 
                formattedBalance.color === "warning" ? "pill-warning" : 
                formattedBalance.color === "danger" ? "pill-danger" : "pill-muted"
              }`}>
                {formattedBalance.vsGoalText}
              </span>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-1">Today's Balance</h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className={`font-display text-2xl lg:text-3xl font-bold ${
                formattedBalance.color === "success" ? "text-success" : 
                formattedBalance.color === "warning" ? "text-gold" : 
                formattedBalance.color === "danger" ? "text-danger" : "text-foreground"
              }`}>
                {formattedBalance.text}
              </span>
              <span className="text-sm text-muted-foreground">kcal</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Eaten</span>
                <span>{stats.todayIntake.toLocaleString()} kcal</span>
              </div>
              <div className="flex justify-between">
                <span>Burned</span>
                <span className="text-success">+{stats.todayOuttake.toLocaleString()} kcal</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border">
                <span>Goal</span>
                <span>{stats.goalDeficit.toLocaleString()} kcal</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Card 2: 7-Day Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="p-4 lg:p-5 bg-card border-border h-full card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className={`icon-container ${formattedSevenDay.isDeficit ? "bg-success/10" : "bg-primary/10"}`}>
                <span className="text-lg">📈</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-1">7-Day Total</h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className={`font-display text-2xl lg:text-3xl font-bold ${
                formattedSevenDay.color === "success" ? "text-success" : formattedSevenDay.color === "danger" ? "text-danger" : "text-foreground"
              }`}>
                {formattedSevenDay.text}
              </span>
              <span className="text-sm text-muted-foreground">kcal</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Daily avg:</span>
              <span className={formattedSevenDay.isDeficit ? "text-success" : "text-danger"}>
                {stats.sevenDayAverage < 0 ? "" : "+"}{stats.sevenDayAverage}/day
              </span>
            </div>
          </Card>
        </motion.div>

        {/* Card 3: Real Weight - Clickable to log weight */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card 
            className="p-4 lg:p-5 bg-card border-border h-full card-hover cursor-pointer hover:border-primary/50 transition-colors"
            onClick={onRealWeightCardClick}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="icon-container bg-primary/10">
                <span className="text-lg">⚖️</span>
              </div>
              <span className="text-[10px] text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-full">
                Tap to log
              </span>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-1">Real Weight</h3>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display text-2xl lg:text-3xl font-bold text-foreground">
                {stats.realWeight?.toFixed(1) || "—"}
              </span>
              <span className="text-sm text-muted-foreground">kg</span>
              {stats.realWeightChange !== null && stats.realWeightChange !== 0 && (
                <span className={`text-sm font-medium ${stats.realWeightChange < 0 ? "text-success" : "text-danger"}`}>
                  {stats.realWeightChange > 0 ? "+" : ""}{stats.realWeightChange} kg
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>📊 7-day average</span>
                {profile?.goal_weight_kg && (
                  <>
                    <span>•</span>
                    <span>🎯 Goal: {profile.goal_weight_kg}kg</span>
                  </>
                )}
              </div>
              {profile?.starting_weight_kg && (
                <span className="text-muted-foreground/70">
                  Started at {profile.starting_weight_kg}kg
                </span>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Card 4: Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="p-4 lg:p-5 bg-card border-border border-gold/20 h-full card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="icon-container bg-gold/10">
                <span className="text-lg">🔥</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-1">Current Streak</h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display text-2xl lg:text-3xl font-bold text-gold">
                {stats.streak}
              </span>
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Keep it going!</span>
              <span>•</span>
              <span className="text-gold">Best: {stats.streak} days</span>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Protein Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
      >
        <Card className="p-4 lg:p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="icon-container bg-success/10">
                <span className="text-lg">🥩</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Protein Goal</h3>
                <p className="text-sm text-muted-foreground">{stats.todayProtein}g of {stats.proteinGoal}g today</p>
              </div>
            </div>
            <span className={`text-2xl font-display font-bold ${proteinProgress >= 100 ? "text-success" : "text-foreground"}`}>
              {proteinProgress}%
            </span>
          </div>
          <ProgressBar value={stats.todayProtein} max={stats.proteinGoal} />
        </Card>
      </motion.div>

      {/* Calendar - FitFuel style */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex-1"
      >
        <Card className="p-4 lg:p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 lg:gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
              <div key={i} className="text-center text-xs text-muted-foreground font-medium py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 lg:gap-2">
            {calendar.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day.date && !day.isLocked && !day.isFuture && onDayClick(day)}
                disabled={!day.date || day.isLocked || day.isFuture}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative p-2 ${
                  !day.date
                    ? "invisible"
                    : day.isLocked
                    ? "bg-secondary/30 opacity-40 cursor-not-allowed"
                    : day.isFuture
                    ? "bg-secondary/20 text-muted-foreground cursor-default"
                    : day.hasData && day.isSuccess
                    ? "bg-success/10 hover:bg-success/20 border border-success/30"
                    : day.hasData && !day.isSuccess
                    ? "bg-danger/10 hover:bg-danger/20 border border-danger/30"
                    : "bg-secondary/30 hover:bg-secondary/50"
                } ${day.isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
              >
                <span className="font-bold text-base text-foreground">{day.date && day.dayOfMonth}</span>
                {/* Show weight if logged with change from yesterday */}
                {day.weight && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-blue-400 font-medium">{day.weight}kg</span>
                    {day.weightChange !== null && day.weightChange !== 0 && (
                      <span className={`text-[9px] font-semibold ${day.weightChange < 0 ? "text-success" : "text-danger"}`}>
                        {day.weightChange > 0 ? "+" : ""}{day.weightChange}
                      </span>
                    )}
                  </div>
                )}
                {day.hasData && (
                  <div className="flex flex-col items-center mt-0.5 gap-0.5">
                    <span className={`text-[11px] font-semibold ${day.isSuccess ? "text-success" : "text-danger"}`}>
                      {day.balance >= 0 ? "+" : ""}{day.balance} cal
                    </span>
                    {day.protein > 0 && (
                      <span className="text-[10px] text-muted-foreground">{day.protein}g pro</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-success/10 border border-success/20"></div>
              <span>Goal met</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-danger/10 border border-danger/20"></div>
              <span>Missed goal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded ring-2 ring-primary"></div>
              <span>Today</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-muted-foreground/70">Shows: balance • protein(g)</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// ============================================================================
// AI DIARY COMPONENT
// ============================================================================

function AIDiary({ onEntryConfirmed, todayHasWeight }: { onEntryConfirmed: () => void; todayHasWeight: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [weightReminderShown, setWeightReminderShown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  
  // Use LOCAL date, not UTC!
  const today = getLocalDateString();

  useEffect(() => {
    loadChatHistory();
  }, []);
  
  // Check weight reminder when todayHasWeight prop changes
  useEffect(() => {
    checkWeightReminder();
  }, [todayHasWeight]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if we should remind user to log their weight
  const checkWeightReminder = () => {
    // Only check if it's past 9am local time
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 9) return;

    // If weight is already logged today, don't show reminder
    if (todayHasWeight) {
      return;
    }

    // If no weight logged today and we haven't shown the reminder yet
    if (!weightReminderShown) {
      setWeightReminderShown(true);
      
      // Get appropriate greeting based on time of day
      let greeting = "Good morning";
      if (currentHour >= 12 && currentHour < 17) {
        greeting = "Good afternoon";
      } else if (currentHour >= 17) {
        greeting = "Good evening";
      }
      
      // Add reminder message after a short delay so it appears after welcome
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: "weight-reminder-" + Date.now(),
            role: "assistant",
            content: `⚖️ ${greeting}! Have you weighed yourself today? Just tell me your weight (e.g., "I weigh 82kg" or "weight 80.5") and I'll log it for you!`,
            timestamp: new Date().toISOString(),
          }
        ]);
      }, 1500);
    }
  };

  const loadChatHistory = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: chatMessages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .order("created_at", { ascending: true });

    if (chatMessages && chatMessages.length > 0) {
      setMessages(
        chatMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          confirmed: true,
          timestamp: m.created_at,
        }))
      );
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hey! 👋 Tell me what you ate or did today.\n\nExamples:\n• \"2 eggs and toast for breakfast\"\n• \"30 minute run\"\n• \"Coffee with oat milk\"",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: now,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data: AIParseResponse = await response.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        parsedData: data,
        confirmed: false,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save to database
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("chat_messages").insert([
          { user_id: user.id, role: "user", content: input, log_date: today },
          { user_id: user.id, role: "assistant", content: data.message, log_date: today },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I had trouble understanding that. Try again?",
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    setLoading(false);
  };

  // Helper to recalculate and update daily log totals
  const recalculateDailyTotals = async (supabase: ReturnType<typeof createClient>, logId: string) => {
    const { data: allEntries } = await supabase
      .from("log_entries")
      .select("*")
      .eq("daily_log_id", logId);

    if (allEntries) {
      const foodEntries = allEntries.filter((e) => e.entry_type === "food");
      const exerciseEntries = allEntries.filter((e) => e.entry_type === "exercise");

      const totalIntake = foodEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
      const totalOuttake = exerciseEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
      const totalProtein = foodEntries.reduce((sum, e) => sum + (e.protein_grams || 0), 0);

      await supabase
        .from("daily_logs")
        .update({
          caloric_intake: totalIntake,
          caloric_outtake: totalOuttake,
          protein_grams: totalProtein,
        })
        .eq("id", logId);
    }
  };

  const handleConfirm = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.parsedData || confirmingId) return;

    setConfirmingId(messageId);
    const parsedData = message.parsedData;

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConfirmingId(null);
        return;
      }

      // Use LOCAL date for the log
      const localToday = getLocalDateString();
      let confirmationContent = "";

      // Get or create today's log
      let { data: log } = await supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("log_date", localToday)
        .single();

      if (!log) {
        const { data: newLog, error } = await supabase
          .from("daily_logs")
          .insert({ user_id: user.id, log_date: localToday })
          .select()
          .single();
        
        if (error) {
          console.error("Error creating log:", error);
          setConfirmingId(null);
          return;
        }
        log = newLog;
      }

      if (!log) {
        setConfirmingId(null);
        return;
      }

      // Handle different operation types
      if (parsedData.type === "edit" && parsedData.search_term) {
        // EDIT OPERATION: Find and update matching entries
        const searchTerm = parsedData.search_term.toLowerCase();
        
        // Find entries matching the search term
        const { data: matchingEntries, error: searchError } = await supabase
          .from("log_entries")
          .select("*")
          .eq("daily_log_id", log.id)
          .ilike("description", `%${searchTerm}%`);

        if (searchError || !matchingEntries || matchingEntries.length === 0) {
          confirmationContent = `❌ Couldn't find any entries matching "${parsedData.search_term}" in today's log.`;
        } else {
          // Update all matching entries
          const updates: Record<string, number> = {};
          if (parsedData.updates?.calories !== undefined) {
            updates.calories = parsedData.updates.calories;
          }
          if (parsedData.updates?.protein !== undefined) {
            updates.protein_grams = parsedData.updates.protein;
          }

          const entryIds = matchingEntries.map(e => e.id);
          const { error: updateError } = await supabase
            .from("log_entries")
            .update(updates)
            .in("id", entryIds);

          if (updateError) {
            console.error("Error updating entries:", updateError);
            confirmationContent = "❌ Error updating entries. Please try again.";
            showToast("Error updating entries", "error");
          } else {
            // Recalculate totals
            await recalculateDailyTotals(supabase, log.id);
            
            const updatedCount = matchingEntries.length;
            const updateParts = [];
            if (parsedData.updates?.calories !== undefined) {
              updateParts.push(`${parsedData.updates.calories} cal`);
            }
            if (parsedData.updates?.protein !== undefined) {
              updateParts.push(`${parsedData.updates.protein}g protein`);
            }
            confirmationContent = `✅ Updated ${updatedCount} "${parsedData.search_term}" ${updatedCount === 1 ? "entry" : "entries"} to ${updateParts.join(" and ")}!`;
            
            // Show toast and log notification
            showToast(`Updated ${updatedCount} ${parsedData.search_term} entries`, "edit");
            logNotification(createEditNotification(
              parsedData.search_term,
              { calories: parsedData.updates?.calories, protein: parsedData.updates?.protein },
              updatedCount
            ));
          }
        }

      } else if (parsedData.type === "delete" && parsedData.search_term) {
        // DELETE OPERATION: Find and delete matching entries
        const searchTerm = parsedData.search_term.toLowerCase();
        
        const { data: matchingEntries, error: searchError } = await supabase
          .from("log_entries")
          .select("*")
          .eq("daily_log_id", log.id)
          .ilike("description", `%${searchTerm}%`);

        if (searchError || !matchingEntries || matchingEntries.length === 0) {
          confirmationContent = `❌ Couldn't find any entries matching "${parsedData.search_term}" in today's log.`;
        } else {
          const entryIds = matchingEntries.map(e => e.id);
          const { error: deleteError } = await supabase
            .from("log_entries")
            .delete()
            .in("id", entryIds);

          if (deleteError) {
            console.error("Error deleting entries:", deleteError);
            confirmationContent = "❌ Error deleting entries. Please try again.";
            showToast("Error deleting entries", "error");
          } else {
            // Recalculate totals
            await recalculateDailyTotals(supabase, log.id);
            
            const deletedCount = matchingEntries.length;
            confirmationContent = `🗑️ Deleted ${deletedCount} "${parsedData.search_term}" ${deletedCount === 1 ? "entry" : "entries"}!`;
            
            // Show toast and log notification
            showToast(`Deleted ${deletedCount} ${parsedData.search_term} entries`, "delete");
            logNotification(createDeleteNotification(parsedData.search_term, deletedCount));
          }
        }

      } else if (parsedData.type === "weight" && parsedData.weight_kg) {
        // WEIGHT LOGGING OPERATION
        const weight = parsedData.weight_kg;
        
        // Update today's log with the weight
        const { error: weightError } = await supabase
          .from("daily_logs")
          .update({ weight_kg: weight })
          .eq("id", log.id);

        if (weightError) {
          console.error("Error saving weight:", weightError);
          confirmationContent = "❌ Error saving weight. Please try again.";
          showToast("Error saving weight", "error");
        } else {
          confirmationContent = `⚖️ Weight logged: ${weight} kg!`;
          showToast(`Weight logged: ${weight} kg`, "weight");
          logNotification(createWeightNotification(weight, localToday));
        }

      } else {
        // NEW ENTRY OPERATION (food or exercise)
        const entries = parsedData.items.map((item) => ({
          daily_log_id: log.id,
          entry_type: parsedData.type as "food" | "exercise",
          description: item.description,
          calories: item.calories,
          protein_grams: "protein" in item ? item.protein : 0,
          ai_parsed: true,
        }));

        const { error: insertError } = await supabase.from("log_entries").insert(entries);
        if (insertError) {
          console.error("Error inserting entries:", insertError);
          showToast("Error logging entry", "error");
          setConfirmingId(null);
          return;
        }

        // Recalculate totals
        await recalculateDailyTotals(supabase, log.id);
        confirmationContent = "✅ Logged! What else did you have?";
        
        // Show toast and log notification
        const itemsForNotification = parsedData.items.map(item => ({
          description: item.description,
          calories: item.calories,
          protein: "protein" in item ? item.protein : 0,
        }));
        
        if (parsedData.type === "food") {
          const itemNames = parsedData.items.map(i => i.description).join(", ");
          showToast(`Logged: ${itemNames}`, "food");
          logNotification(createFoodNotification(itemsForNotification));
        } else {
          const itemNames = parsedData.items.map(i => i.description).join(", ");
          showToast(`Logged: ${itemNames}`, "exercise");
          logNotification(createExerciseNotification(itemsForNotification));
        }
      }

      // Mark message as confirmed in local state
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, confirmed: true } : m))
      );

      // Save confirmation message to database
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: confirmationContent,
        log_date: localToday,
      });

      // Add confirmation message to local state
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: confirmationContent,
          confirmed: true,
          timestamp: new Date().toISOString(),
        },
      ]);

      // Trigger dashboard refresh WITHOUT page reload
      onEntryConfirmed();

    } catch (error) {
      console.error("Error confirming:", error);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleReject = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, confirmed: true, parsedData: undefined } : m))
    );
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "No problem! Try describing it differently.",
        confirmed: true,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="icon-container bg-primary/10">
            <span className="text-lg">💬</span>
          </div>
          <div>
            <h2 className="font-display font-semibold text-foreground">AI Diary</h2>
            <p className="text-xs text-muted-foreground">Log food & exercise naturally</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="flex flex-col gap-0.5 max-w-[85%]">
                {/* Timestamp */}
                {message.timestamp && (
                  <span className={`text-[10px] text-muted-foreground ${message.role === "user" ? "text-right" : "text-left"}`}>
                    {formatTime(message.timestamp)}
                  </span>
                )}
                <div
                  className={`rounded-xl px-4 py-2.5 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-white rounded-br-none"
                      : "bg-secondary text-foreground rounded-bl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                  {/* Only show parsed data UI if it's NOT an error */}
                  {message.parsedData && !message.confirmed && !message.parsedData.is_error && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      {/* For EDIT operations */}
                      {message.parsedData.type === "edit" && message.parsedData.search_term && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-lg">📝</span>
                            <span>Update entries matching <strong>"{message.parsedData.search_term}"</strong></span>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 space-y-1 text-xs">
                            {message.parsedData.updates?.calories !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">New calories:</span>
                                <span className="font-medium">{message.parsedData.updates.calories} cal</span>
                              </div>
                            )}
                            {message.parsedData.updates?.protein !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">New protein:</span>
                                <span className="font-medium">{message.parsedData.updates.protein}g</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* For DELETE operations */}
                      {message.parsedData.type === "delete" && message.parsedData.search_term && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-danger">
                            <span className="text-lg">🗑️</span>
                            <span>Delete entries matching <strong>"{message.parsedData.search_term}"</strong></span>
                          </div>
                        </div>
                      )}

                      {/* For WEIGHT entries */}
                      {message.parsedData.type === "weight" && message.parsedData.weight_kg && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-lg">⚖️</span>
                            <span className="font-display text-xl font-bold">{message.parsedData.weight_kg} kg</span>
                          </div>
                        </div>
                      )}

                      {/* For NEW ENTRIES (food/exercise) */}
                      {(message.parsedData.type === "food" || message.parsedData.type === "exercise") && message.parsedData.items.length > 0 && (
                        <div className="space-y-1.5">
                          {message.parsedData.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between gap-3 text-xs">
                              <span className="truncate opacity-90">{item.description}</span>
                              <div className="flex gap-2 shrink-0">
                                <span className="font-medium">{item.calories} cal</span>
                                {"protein" in item && item.protein > 0 && (
                                  <span className="text-muted-foreground">{item.protein}g</span>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="pt-1 mt-1 border-t border-white/5 flex justify-between text-xs font-semibold">
                            <span>Total</span>
                            <span>{message.parsedData.total_calories} cal / {message.parsedData.total_protein}g protein</span>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleConfirm(message.id)}
                          disabled={confirmingId === message.id}
                          className={`h-8 text-xs flex-1 ${
                            message.parsedData.type === "delete" 
                              ? "bg-danger hover:bg-danger/90 text-white" 
                              : message.parsedData.type === "edit"
                              ? "bg-gold hover:bg-gold/90 text-black"
                              : message.parsedData.type === "weight"
                              ? "bg-blue-500 hover:bg-blue-500/90 text-white"
                              : "bg-success hover:bg-success/90 text-white"
                          }`}
                        >
                          {confirmingId === message.id 
                            ? (message.parsedData.type === "edit" ? "Updating..." : message.parsedData.type === "delete" ? "Deleting..." : message.parsedData.type === "weight" ? "Saving..." : "Logging...")
                            : message.parsedData.type === "edit" 
                            ? "✓ Update" 
                            : message.parsedData.type === "delete" 
                            ? "✓ Delete" 
                            : message.parsedData.type === "weight"
                            ? "✓ Log Weight"
                            : "✓ Log this"}
                        </Button>
                        <Button 
                          type="button"
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleReject(message.id)}
                          className="h-8 text-xs border-white/20 hover:bg-white/10"
                        >
                          ✗ Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-secondary rounded-xl rounded-bl-none px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !loading) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="What did you eat or do?"
            rows={1}
            className="flex-1 min-h-10 max-h-32 px-4 py-2.5 text-sm bg-secondary border-0 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            disabled={loading}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          <Button 
            type="submit" 
            disabled={loading || !input.trim()} 
            className="h-10 w-10 bg-primary hover:bg-primary/90 rounded-lg p-0 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// RESIZABLE SPLIT VIEW
// ============================================================================

function ResizableSplitView({
  stats,
  calendar,
  profile,
  logs,
  onDayClick,
  onTodayCardClick,
  onRealWeightCardClick,
  onEntryConfirmed,
  todayHasWeight,
}: {
  stats: {
    todayBalance: number;
    todayIntake: number;
    todayOuttake: number;
    todayProtein: number;
    proteinGoal: number;
    maintenanceCalories: number;
    goalDeficit: number;
    sevenDayBalance: number;
    sevenDayAverage: number;
    realWeight: number | null;
    realWeightChange: number | null;
    predictedWeight: number | null;
    predictedChange: number | null;
    streak: number;
  };
  calendar: CalendarDay[];
  profile: Profile | null;
  logs: DailyLog[];
  onDayClick: (day: CalendarDay) => void;
  onTodayCardClick: () => void;
  onRealWeightCardClick: () => void;
  onEntryConfirmed: () => void;
  todayHasWeight: boolean;
}) {
  const { width: diaryWidth, isResizing, startResizing } = useResizable(380, 280, 600);

  return (
    <div className="hidden lg:flex h-[calc(100vh-4rem)]">
      {/* Left: Dashboard (main content) */}
      <div 
        className="flex-1 overflow-y-auto p-6"
        style={{ userSelect: isResizing ? "none" : "auto" }}
      >
        <DashboardStats 
          stats={stats} 
          calendar={calendar} 
          profile={profile} 
          logs={logs}
          onDayClick={onDayClick}
          onTodayCardClick={onTodayCardClick}
          onRealWeightCardClick={onRealWeightCardClick}
        />
      </div>

      {/* Resizable divider */}
      <div
        className={`w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all flex items-center justify-center group ${
          isResizing ? "bg-primary/50 w-1.5" : ""
        }`}
        onMouseDown={startResizing}
      >
        <div className={`w-0.5 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors ${
          isResizing ? "bg-primary" : ""
        }`} />
      </div>

      {/* Right: AI Diary (resizable sidebar) */}
      <div 
        className="border-l border-border flex flex-col bg-card/30"
        style={{ 
          width: diaryWidth,
          userSelect: isResizing ? "none" : "auto"
        }}
      >
        <AIDiary onEntryConfirmed={onEntryConfirmed} todayHasWeight={todayHasWeight} />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD PAGE
// ============================================================================

function DashboardContent() {
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "true";
  const { profile, subscription, refreshData } = useDashboard();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [showWelcome, setShowWelcome] = useState(isWelcome);
  const [editingEntry, setEditingEntry] = useState<DayEntry | null>(null);
  const [editForm, setEditForm] = useState({ description: "", calories: 0, protein: 0 });
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  
  // Check if today has weight logged (derived from logs)
  const todayStr = getLocalDateString();
  const todayLog = logs.find(l => l.log_date === todayStr);
  const todayHasWeight = todayLog?.weight_kg !== null && todayLog?.weight_kg !== undefined;

  const [stats, setStats] = useState({
    todayBalance: 0,
    todayIntake: 0,
    todayOuttake: 0,
    todayProtein: 0,
    proteinGoal: 0,
    maintenanceCalories: 0,
    goalDeficit: -500, // Default goal deficit
    sevenDayBalance: 0,
    sevenDayAverage: 0,
    realWeight: null as number | null,
    realWeightChange: null as number | null,
    predictedWeight: null as number | null,
    predictedChange: null as number | null,
    streak: 0,
  });

  const [calendar, setCalendar] = useState<CalendarDay[]>([]);

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const { data: logsData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("log_date", { ascending: false })
      .limit(60);

    if (logsData) {
      setLogs(logsData);
      calculateStats(profile, logsData, subscription);
    }

    setLoading(false);
  };

  const calculateStats = (profile: Profile, logs: DailyLog[], sub: Subscription | null) => {
    // Use LOCAL date, not UTC!
    const today = getLocalDateString();
    const todayLog = logs.find((l) => l.log_date === today);

    const age = calculateAge(new Date(profile.date_of_birth));
    const currentWeight = profile.current_weight_kg || profile.starting_weight_kg;
    const bmr = calculateBMR(
      currentWeight,
      profile.height_cm,
      age,
      profile.gender
    );
    const tdee = calculateTDEE(bmr, profile.activity_level);

    // Calculate goal deficit from profile's goal weight and date
    const goalAnalysis = calculateRequiredDailyDeficit(
      currentWeight,
      profile.goal_weight_kg,
      new Date(profile.goal_date)
    );
    // Goal deficit is NEGATIVE (e.g., -1000 means you need to be at -1000 or lower)
    const goalDeficit = -goalAnalysis.dailyDeficit;

    // Today's balance: Intake - (TDEE + Exercise)
    // If nothing logged, balance = 0 - TDEE = -TDEE (full deficit potential)
    const todayIntake = todayLog?.caloric_intake || 0;
    const todayOuttake = todayLog?.caloric_outtake || 0;
    const todayBalance = calculateDailyBalance(tdee, todayIntake, todayOuttake);

    const last7Days = logs.slice(0, 7).map((l) => ({
      date: new Date(l.log_date),
      balance: calculateDailyBalance(tdee, l.caloric_intake, l.caloric_outtake),
    }));
    const sevenDay = calculate7DayBalance(last7Days);

    const weights = logs.filter((l) => l.weight_kg).map((l) => ({
      date: new Date(l.log_date),
      weight: l.weight_kg!,
    }));
    const calculatedRealWeight = calculateRealWeight(weights);
    
    // If no weights logged yet, use starting weight from profile
    // Otherwise use the 7-day average
    const realWeight = calculatedRealWeight !== null 
      ? calculatedRealWeight 
      : (profile.current_weight_kg || profile.starting_weight_kg);

    // Calculate weight change from starting weight
    const realWeightChange = realWeight 
      ? Math.round((realWeight - profile.starting_weight_kg) * 10) / 10
      : null;

    const prediction = predictWeight30Days(
      realWeight || profile.starting_weight_kg,
      last7Days.map((d) => d.balance)
    );

    const streak = calculateStreak(last7Days);

    const proteinGoal = calculateProteinGoal(
      currentWeight,
      profile.activity_level !== "sedentary"
    );

    setStats({
      todayBalance,
      todayIntake,
      todayOuttake,
      todayProtein: todayLog?.protein_grams || 0,
      proteinGoal,
      maintenanceCalories: tdee,
      goalDeficit,
      sevenDayBalance: sevenDay.total,
      sevenDayAverage: sevenDay.average,
      realWeight,
      realWeightChange,
      predictedWeight: prediction.predictedWeight,
      predictedChange: prediction.predictedChange,
      streak,
    });

    buildCalendar(logs, sub, tdee, goalDeficit);
  };

  const buildCalendar = (logs: DailyLog[], sub: Subscription | null, tdee: number, goalDeficit: number) => {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const isPaid = sub?.status === "active";
    
    // Get user's signup date to show starting weight
    const signupDate = profile?.created_at ? getLocalDateString(new Date(profile.created_at)) : null;
    const startingWeight = profile?.starting_weight_kg || null;

    const calendarDays: CalendarDay[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      calendarDays.push({ date: "", dayOfMonth: 0, weight: null, weightChange: null, balance: 0, protein: 0, isSuccess: false, isLocked: false, isFuture: true, isToday: false, hasData: false });
    }

    // First pass: collect all weights for the month
    const dayWeights: { [dateStr: string]: number | null } = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = getLocalDateString(date);
      const log = logs.find((l) => l.log_date === dateStr);
      let weight = log?.weight_kg || null;
      // Show starting weight on signup day if no weight logged yet
      if (!weight && dateStr === signupDate && startingWeight) {
        weight = startingWeight;
      }
      dayWeights[dateStr] = weight;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      // Use local date string instead of UTC
      const dateStr = getLocalDateString(date);
      const log = logs.find((l) => l.log_date === dateStr);
      const isToday = dateStr === todayStr;
      const isFuture = date > today && !isToday;
      let isLocked = false;
      if (!isPaid && trialEnd && date > trialEnd && !isFuture) {
        isLocked = true;
      }
      const balance = log ? calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake) : 0;
      const protein = log?.protein_grams || 0;
      // Success = met or exceeded goal deficit (balance <= goalDeficit, since negative = deficit)
      // e.g., -1100 <= -1000 means you exceeded your 1000 cal deficit goal
      const isSuccess = log ? balance <= goalDeficit : false;
      
      const weight = dayWeights[dateStr];
      
      // Calculate weight change from previous day
      let weightChange: number | null = null;
      if (weight !== null && day > 1) {
        // Look for previous day's weight
        const prevDate = new Date(currentYear, currentMonth, day - 1);
        const prevDateStr = getLocalDateString(prevDate);
        const prevWeight = dayWeights[prevDateStr];
        if (prevWeight !== null) {
          weightChange = Math.round((weight - prevWeight) * 10) / 10;
        }
      }

      calendarDays.push({
        date: dateStr,
        dayOfMonth: day,
        weight,
        weightChange,
        balance,
        protein,
        isSuccess,
        isLocked,
        isFuture,
        isToday,
        hasData: !!log,
      });
    }

    setCalendar(calendarDays);
  };

  const fetchDayEntries = async (date: string) => {
    setLoadingEntries(true);
    setDayEntries([]);
    
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // First get the daily log for this date
      const { data: log } = await supabase
        .from("daily_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", date)
        .single();

      if (log) {
        // Then get all entries for this log
        const { data: entries } = await supabase
          .from("log_entries")
          .select("*")
          .eq("daily_log_id", log.id)
          .order("created_at", { ascending: true });

        if (entries) {
          setDayEntries(entries as DayEntry[]);
        }
      }
    } catch (error) {
      console.error("Error fetching entries:", error);
    } finally {
      setLoadingEntries(false);
    }
  };

  const handleDayClick = (day: CalendarDay) => {
    setSelectedDay(day);
    if (day.date) {
      fetchDayEntries(day.date);
    }
  };

  // Handle clicking the Real Weight card to log weight
  const handleRealWeightCardClick = () => {
    setWeightInput(stats.realWeight?.toString() || "");
    setShowWeightModal(true);
  };

  const saveWeightFromModal = async () => {
    const weight = parseFloat(weightInput);
    if (!weight || isNaN(weight)) return;
    
    const todayStr = getLocalDateString();
    await saveWeight(todayStr, weight);
    setShowWeightModal(false);
    setWeightInput("");
  };

  // Also allow clicking Today's Balance card to open today
  const handleTodayCardClick = () => {
    const todayStr = getLocalDateString();
    const todayDay = calendar.find(d => d.date === todayStr);
    if (todayDay) {
      handleDayClick(todayDay);
    } else {
      // Create a temporary day object for today
      handleDayClick({
        date: todayStr,
        dayOfMonth: new Date().getDate(),
        weight: null,
        weightChange: null,
        balance: stats.todayBalance,
        protein: stats.todayProtein,
        isSuccess: stats.todayBalance <= stats.goalDeficit,
        isLocked: false,
        isFuture: false,
        isToday: true,
        hasData: stats.todayIntake > 0 || stats.todayOuttake > 0,
      });
    }
  };

  // Manual entry editing
  const startEditEntry = (entry: DayEntry) => {
    setEditingEntry(entry);
    setEditForm({
      description: entry.description,
      calories: entry.calories,
      protein: entry.protein_grams,
    });
  };

  const cancelEditEntry = () => {
    setEditingEntry(null);
    setEditForm({ description: "", calories: 0, protein: 0 });
  };

  const saveEditEntry = async () => {
    if (!editingEntry || !selectedDay) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Update the entry
    const { error } = await supabase
      .from("log_entries")
      .update({
        description: editForm.description,
        calories: editForm.calories,
        protein_grams: editForm.protein,
      })
      .eq("id", editingEntry.id);

    if (error) {
      console.error("Error updating entry:", error);
      return;
    }

    // Get the daily log for this entry to recalculate totals
    const { data: log } = await supabase
      .from("daily_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("log_date", selectedDay.date)
      .single();

    if (log) {
      // Recalculate totals
      const { data: allEntries } = await supabase
        .from("log_entries")
        .select("*")
        .eq("daily_log_id", log.id);

      if (allEntries) {
        const foodEntries = allEntries.filter((e) => e.entry_type === "food");
        const exerciseEntries = allEntries.filter((e) => e.entry_type === "exercise");

        await supabase
          .from("daily_logs")
          .update({
            caloric_intake: foodEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
            caloric_outtake: exerciseEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
            protein_grams: foodEntries.reduce((sum, e) => sum + (e.protein_grams || 0), 0),
          })
          .eq("id", log.id);
      }
    }

    // Update local state
    setDayEntries(prev => prev.map(e => 
      e.id === editingEntry.id 
        ? { ...e, description: editForm.description, calories: editForm.calories, protein_grams: editForm.protein }
        : e
    ));
    
    // Show toast and log notification
    showToast(`Updated ${editForm.description}`, "edit");
    logNotification(createEditNotification(
      editingEntry.description,
      { calories: editForm.calories, protein: editForm.protein },
      1
    ));
    
    cancelEditEntry();
    fetchData(); // Refresh dashboard
  };

  const deleteEntry = async (entryId: string) => {
    if (!selectedDay) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Delete the entry
    const { error } = await supabase
      .from("log_entries")
      .delete()
      .eq("id", entryId);

    if (error) {
      console.error("Error deleting entry:", error);
      return;
    }

    // Get the daily log to recalculate totals
    const { data: log } = await supabase
      .from("daily_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("log_date", selectedDay.date)
      .single();

    if (log) {
      const { data: allEntries } = await supabase
        .from("log_entries")
        .select("*")
        .eq("daily_log_id", log.id);

      const foodEntries = (allEntries || []).filter((e) => e.entry_type === "food");
      const exerciseEntries = (allEntries || []).filter((e) => e.entry_type === "exercise");

      await supabase
        .from("daily_logs")
        .update({
          caloric_intake: foodEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
          caloric_outtake: exerciseEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
          protein_grams: foodEntries.reduce((sum, e) => sum + (e.protein_grams || 0), 0),
        })
        .eq("id", log.id);
    }

    // Update local state
    const deletedEntry = dayEntries.find(e => e.id === entryId);
    setDayEntries(prev => prev.filter(e => e.id !== entryId));
    
    // Show toast and log notification
    if (deletedEntry) {
      showToast(`Deleted ${deletedEntry.description}`, "delete");
      logNotification(createDeleteNotification(deletedEntry.description, 1));
    }
    
    fetchData(); // Refresh dashboard
  };

  const saveWeight = async (date: string, weight: number) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("daily_logs").upsert(
      { user_id: user.id, log_date: date, weight_kg: weight },
      { onConflict: "user_id,log_date" }
    );

    // Show toast and log notification
    showToast(`Weight logged: ${weight} kg`, "weight");
    logNotification(createWeightNotification(weight, date));

    fetchData();
    setSelectedDay(null);
  };

  const handleEntryConfirmed = () => {
    fetchData();
    refreshData();
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {/* Welcome modal */}
      <AnimatePresence>
        {showWelcome && (
          <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl text-center">
                  🎉 Welcome to your journey!
                </DialogTitle>
              </DialogHeader>
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  Hi {profile?.first_name}! Your 7-day free trial has started.
                </p>
                <p className="text-muted-foreground mb-6">
                  Start by logging your first meal in the AI Diary.
                </p>
                <Button onClick={() => setShowWelcome(false)} className="bg-primary hover:bg-primary/90">
                  Let's go!
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Desktop: Resizable split view */}
      <ResizableSplitView
        stats={stats}
        calendar={calendar}
        profile={profile}
        logs={logs}
        onDayClick={handleDayClick}
        onTodayCardClick={handleTodayCardClick}
        onRealWeightCardClick={handleRealWeightCardClick}
        onEntryConfirmed={handleEntryConfirmed}
        todayHasWeight={todayHasWeight}
      />

      {/* Mobile: Just dashboard (diary is separate tab) */}
      <div className="lg:hidden p-4">
        <DashboardStats 
          stats={stats} 
          calendar={calendar} 
          profile={profile} 
          logs={logs}
          onDayClick={handleDayClick}
          onTodayCardClick={handleTodayCardClick}
          onRealWeightCardClick={handleRealWeightCardClick}
        />
      </div>

      {/* Day Detail Modal */}
      <Dialog open={!!selectedDay} onOpenChange={() => { setSelectedDay(null); setDayEntries([]); setEditingEntry(null); }}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display flex items-center gap-2">
              {selectedDay?.isToday && <span className="pill pill-primary text-[10px]">Today</span>}
              {selectedDay?.date && new Date(selectedDay.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Summary Stats */}
            {selectedDay?.hasData && (
              <div className="grid grid-cols-3 gap-3">
                <div className={`p-3 rounded-lg ${selectedDay.isSuccess ? "bg-success/10 border border-success/20" : "bg-danger/10 border border-danger/20"}`}>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Balance</p>
                  <p className={`font-display font-bold text-lg ${selectedDay.isSuccess ? "text-success" : "text-danger"}`}>
                    {selectedDay.balance >= 0 ? "+" : ""}{selectedDay.balance}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Protein</p>
                  <p className="font-display font-bold text-lg text-foreground">{selectedDay.protein}g</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Weight</p>
                  <p className="font-display font-bold text-lg text-foreground">{selectedDay.weight || "—"}</p>
                </div>
              </div>
            )}

            {/* Edit Entry Form */}
            {editingEntry && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-semibold text-foreground">✏️ Edit Entry</h4>
                  <Button size="sm" variant="ghost" onClick={cancelEditEntry} className="h-6 w-6 p-0">
                    ✕
                  </Button>
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Input
                      value={editForm.description}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="bg-background h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Calories</Label>
                      <Input
                        type="number"
                        value={editForm.calories}
                        onChange={(e) => setEditForm(prev => ({ ...prev, calories: parseInt(e.target.value) || 0 }))}
                        className="bg-background h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Protein (g)</Label>
                      <Input
                        type="number"
                        value={editForm.protein}
                        onChange={(e) => setEditForm(prev => ({ ...prev, protein: parseInt(e.target.value) || 0 }))}
                        className="bg-background h-9"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveEditEntry} size="sm" className="flex-1 bg-primary hover:bg-primary/90">
                    Save Changes
                  </Button>
                  <Button onClick={cancelEditEntry} size="sm" variant="outline" className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Food Entries */}
            <div className="space-y-2">
              <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
                <span className="text-lg">🍽️</span> Food
                <span className="text-xs text-muted-foreground font-normal">(tap to edit)</span>
              </h4>
              {loadingEntries ? (
                <div className="text-sm text-muted-foreground animate-pulse">Loading entries...</div>
              ) : dayEntries.filter(e => e.entry_type === "food").length > 0 ? (
                <div className="space-y-2">
                  {dayEntries.filter(e => e.entry_type === "food").map((entry) => (
                    <div 
                      key={entry.id} 
                      className={`p-3 bg-secondary/50 rounded-lg transition-all ${
                        editingEntry?.id === entry.id ? "ring-2 ring-primary" : "hover:bg-secondary/70 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0" onClick={() => startEditEntry(entry)}>
                          <p className="text-sm text-foreground truncate">{entry.description}</p>
                          <p className="text-[10px] text-muted-foreground">{formatTime(entry.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <div className="text-right" onClick={() => startEditEntry(entry)}>
                            <p className="text-sm font-medium text-foreground">{entry.calories} cal</p>
                            {entry.protein_grams > 0 && (
                              <p className="text-[10px] text-muted-foreground">{entry.protein_grams}g protein</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditEntry(entry)}
                              className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-1.5 rounded hover:bg-danger/20 text-muted-foreground hover:text-danger transition-colors"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-medium border-t border-border">
                    <span>Total Food</span>
                    <span>{dayEntries.filter(e => e.entry_type === "food").reduce((sum, e) => sum + e.calories, 0)} cal</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No food logged</p>
              )}
            </div>

            {/* Exercise Entries */}
            <div className="space-y-2">
              <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
                <span className="text-lg">🏃</span> Exercise
                <span className="text-xs text-muted-foreground font-normal">(tap to edit)</span>
              </h4>
              {loadingEntries ? (
                <div className="text-sm text-muted-foreground animate-pulse">Loading entries...</div>
              ) : dayEntries.filter(e => e.entry_type === "exercise").length > 0 ? (
                <div className="space-y-2">
                  {dayEntries.filter(e => e.entry_type === "exercise").map((entry) => (
                    <div 
                      key={entry.id} 
                      className={`p-3 bg-success/5 rounded-lg border border-success/10 transition-all ${
                        editingEntry?.id === entry.id ? "ring-2 ring-primary" : "hover:bg-success/10 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0" onClick={() => startEditEntry(entry)}>
                          <p className="text-sm text-foreground truncate">{entry.description}</p>
                          <p className="text-[10px] text-muted-foreground">{formatTime(entry.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <div className="text-right" onClick={() => startEditEntry(entry)}>
                            <p className="text-sm font-medium text-success">-{entry.calories} cal</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditEntry(entry)}
                              className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-1.5 rounded hover:bg-danger/20 text-muted-foreground hover:text-danger transition-colors"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-medium border-t border-border">
                    <span>Total Burned</span>
                    <span className="text-success">-{dayEntries.filter(e => e.entry_type === "exercise").reduce((sum, e) => sum + e.calories, 0)} cal</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No exercise logged</p>
              )}
            </div>

            {/* Weight Input */}
            <div className="space-y-2 pt-4 border-t border-border">
              <Label className="text-muted-foreground">Log Weight (kg)</Label>
              <div className="flex gap-2">
                <Input
                  id="weight-input"
                  type="number"
                  step="0.1"
                  placeholder="75.0"
                  defaultValue={selectedDay?.weight || ""}
                  className="bg-background text-lg font-display"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && selectedDay) {
                      saveWeight(selectedDay.date, parseFloat((e.target as HTMLInputElement).value));
                    }
                  }}
                />
                <Button
                  className="bg-primary hover:bg-primary/90 shrink-0"
                  onClick={() => {
                    const input = document.getElementById('weight-input') as HTMLInputElement;
                    if (input?.value && selectedDay) {
                      saveWeight(selectedDay.date, parseFloat(input.value));
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weight Input Modal (from Real Weight Card) */}
      <Dialog open={showWeightModal} onOpenChange={setShowWeightModal}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-center">
              ⚖️ Log Today's Weight
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your weight for {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.1"
                placeholder="75.0"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="bg-background text-2xl font-display text-center h-14"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveWeightFromModal();
                  }
                }}
                autoFocus
              />
              <span className="text-xl text-muted-foreground">kg</span>
            </div>
            {stats.realWeight && (
              <p className="text-xs text-center text-muted-foreground">
                Current 7-day average: <span className="font-semibold text-foreground">{stats.realWeight.toFixed(1)} kg</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button 
                onClick={saveWeightFromModal}
                disabled={!weightInput || isNaN(parseFloat(weightInput))}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                Save Weight
              </Button>
              <Button 
                onClick={() => setShowWeightModal(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
      <DashboardContent />
    </Suspense>
  );
}
