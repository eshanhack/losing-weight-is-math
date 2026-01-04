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
  balance: number;
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

// Segmented progress bar (like FitFuel)
function SegmentedProgress({ segments = 20, filledSegments = 0, color = "primary" }: { segments?: number; filledSegments?: number; color?: string }) {
  const colorClass = color === "success" ? "bg-success" : color === "danger" ? "bg-danger" : color === "gold" ? "bg-gold" : "bg-primary";
  
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-sm transition-colors ${
            i < filledSegments ? colorClass : "bg-secondary"
          }`}
        />
      ))}
    </div>
  );
}

function DashboardStats({ 
  stats, 
  calendar, 
  profile, 
  logs,
  onDayClick 
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
        {/* Card 1: Today's Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className={`p-4 lg:p-5 bg-card border-border h-full card-hover ${
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
            <SegmentedProgress 
              segments={20} 
              filledSegments={Math.min(20, Math.max(0, Math.round(budgetProgress / 5)))} 
              color={formattedBalance.color === "success" ? "success" : formattedBalance.color === "warning" ? "gold" : formattedBalance.color === "danger" ? "danger" : "primary"}
            />
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
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
            <SegmentedProgress 
              segments={20} 
              filledSegments={14} 
              color={formattedSevenDay.isDeficit ? "success" : "danger"}
            />
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Daily avg:</span>
              <span className={formattedSevenDay.isDeficit ? "text-success" : "text-danger"}>
                {stats.sevenDayAverage < 0 ? "" : "+"}{stats.sevenDayAverage}/day
              </span>
            </div>
          </Card>
        </motion.div>

        {/* Card 3: Real Weight */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-4 lg:p-5 bg-card border-border h-full card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="icon-container bg-primary/10">
                <span className="text-lg">⚖️</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <h3 className="font-display font-semibold text-foreground mb-1">Real Weight</h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display text-2xl lg:text-3xl font-bold text-foreground">
                {stats.realWeight?.toFixed(1) || "—"}
              </span>
              <span className="text-sm text-muted-foreground">kg</span>
            </div>
            <SegmentedProgress segments={20} filledSegments={16} color="primary" />
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>7-day average</span>
              {profile?.goal_weight_kg && (
                <>
                  <span>•</span>
                  <span>Goal: {profile.goal_weight_kg}kg</span>
                </>
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
            <SegmentedProgress segments={20} filledSegments={Math.min(20, stats.streak * 2)} color="gold" />
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
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
                className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center transition-all relative ${
                  !day.date
                    ? "invisible"
                    : day.isLocked
                    ? "bg-secondary/30 opacity-40 cursor-not-allowed"
                    : day.isFuture
                    ? "bg-secondary/20 text-muted-foreground cursor-default"
                    : day.hasData && day.isSuccess
                    ? "bg-success/10 text-success hover:bg-success/20 border border-success/20"
                    : day.hasData && !day.isSuccess
                    ? "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20"
                    : "bg-secondary/30 hover:bg-secondary/50 text-muted-foreground"
                } ${day.isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
              >
                <span className="font-medium">{day.date && day.dayOfMonth}</span>
                {day.weight && (
                  <span className="text-[9px] opacity-70 mt-0.5">{day.weight}</span>
                )}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-success/10 border border-success/20"></div>
              <span>Deficit (good)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-danger/10 border border-danger/20"></div>
              <span>Surplus</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded ring-2 ring-primary"></div>
              <span>Today</span>
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

function AIDiary({ onEntryConfirmed }: { onEntryConfirmed: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadChatHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        }))
      );
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hey! 👋 Tell me what you ate or did today.\n\nExamples:\n• \"2 eggs and toast for breakfast\"\n• \"30 minute run\"\n• \"Coffee with oat milk\"",
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
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
      };

      setMessages((prev) => [...prev, assistantMessage]);

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
        },
      ]);
    }

    setLoading(false);
  };

  const handleConfirm = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.parsedData) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let { data: log } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .single();

    if (!log) {
      const { data: newLog } = await supabase
        .from("daily_logs")
        .insert({ user_id: user.id, log_date: today })
        .select()
        .single();
      log = newLog;
    }

    if (!log) return;

    const entries = message.parsedData.items.map((item) => ({
      daily_log_id: log.id,
      entry_type: message.parsedData!.type,
      description: item.description,
      calories: item.calories,
      protein_grams: "protein" in item ? item.protein : 0,
      ai_parsed: true,
    }));

    await supabase.from("log_entries").insert(entries);

    const { data: allEntries } = await supabase
      .from("log_entries")
      .select("*")
      .eq("daily_log_id", log.id);

    if (allEntries) {
      const foodEntries = allEntries.filter((e) => e.entry_type === "food");
      const exerciseEntries = allEntries.filter((e) => e.entry_type === "exercise");

      const totalIntake = foodEntries.reduce((sum, e) => sum + e.calories, 0);
      const totalOuttake = exerciseEntries.reduce((sum, e) => sum + e.calories, 0);
      const totalProtein = foodEntries.reduce((sum, e) => sum + (e.protein_grams || 0), 0);

      await supabase
        .from("daily_logs")
        .update({
          caloric_intake: totalIntake,
          caloric_outtake: totalOuttake,
          protein_grams: totalProtein,
        })
        .eq("id", log.id);
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, confirmed: true } : m))
    );

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "✅ Logged! What else did you have?",
        confirmed: true,
      },
    ]);

    // Trigger dashboard refresh
    onEntryConfirmed();
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
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  message.role === "user"
                    ? "bg-primary text-white rounded-br-none"
                    : "bg-secondary text-foreground rounded-bl-none"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                {message.parsedData && !message.confirmed && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="space-y-1.5">
                      {message.parsedData.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between gap-3 text-xs">
                          <span className="truncate opacity-90">{item.description}</span>
                          <span className="font-medium shrink-0">{item.calories} cal</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(message.id)}
                        className="h-8 text-xs bg-success hover:bg-success/90 text-white flex-1"
                      >
                        ✓ Log this
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-white/20 hover:bg-white/10">
                        ✗ Edit
                      </Button>
                    </div>
                  </div>
                )}
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
  onEntryConfirmed,
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
  onEntryConfirmed: () => void;
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
        <AIDiary onEntryConfirmed={onEntryConfirmed} />
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

  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showWelcome, setShowWelcome] = useState(isWelcome);

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
    const today = new Date().toISOString().split("T")[0];
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
    // Goal deficit is negative (e.g., -1000 means 1000 calorie deficit goal)
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
    const realWeight = calculateRealWeight(weights);

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
      realWeightChange: null,
      predictedWeight: prediction.predictedWeight,
      predictedChange: prediction.predictedChange,
      streak,
    });

    buildCalendar(logs, sub, tdee, goalDeficit);
  };

  const buildCalendar = (logs: DailyLog[], sub: Subscription | null, tdee: number, goalDeficit: number) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const isPaid = sub?.status === "active";

    const calendarDays: CalendarDay[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      calendarDays.push({ date: "", dayOfMonth: 0, weight: null, balance: 0, isSuccess: false, isLocked: false, isFuture: true, isToday: false, hasData: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = date.toISOString().split("T")[0];
      const log = logs.find((l) => l.log_date === dateStr);
      const isToday = date.toDateString() === today.toDateString();
      const isFuture = date > today;
      let isLocked = false;
      if (!isPaid && trialEnd && date > trialEnd && !isFuture) {
        isLocked = true;
      }
      const balance = log ? calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake) : 0;
      // Success = met or exceeded goal deficit (balance <= goalDeficit)
      const isSuccess = log ? balance <= goalDeficit : false;

      calendarDays.push({
        date: dateStr,
        dayOfMonth: day,
        weight: log?.weight_kg || null,
        balance,
        isSuccess,
        isLocked,
        isFuture,
        isToday,
        hasData: !!log,
      });
    }

    setCalendar(calendarDays);
  };

  const saveWeight = async (date: string, weight: number) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("daily_logs").upsert(
      { user_id: user.id, log_date: date, weight_kg: weight },
      { onConflict: "user_id,log_date" }
    );

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
        onDayClick={setSelectedDay}
        onEntryConfirmed={handleEntryConfirmed}
      />

      {/* Mobile: Just dashboard (diary is separate tab) */}
      <div className="lg:hidden p-4">
        <DashboardStats 
          stats={stats} 
          calendar={calendar} 
          profile={profile} 
          logs={logs}
          onDayClick={setSelectedDay} 
        />
      </div>

      {/* Day Modal */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display">
              {selectedDay?.date && new Date(selectedDay.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input
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
            </div>

            {selectedDay?.hasData && (
              <div className="space-y-2 pt-4 border-t border-border text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={selectedDay.isSuccess ? "text-success" : "text-danger"}>
                    {selectedDay.balance < 0 ? "" : "+"}{selectedDay.balance} kcal
                  </span>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                if (input?.value && selectedDay) {
                  saveWeight(selectedDay.date, parseFloat(input.value));
                }
              }}
            >
              Save
            </Button>
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
