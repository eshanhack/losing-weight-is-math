"use client";

import { useState, useEffect, Suspense, useRef } from "react";
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
} from "@/lib/math";
import type { Profile, DailyLog, Subscription, AIParseResponse, LogEntry } from "@/types";

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
  const formattedBalance = formatBalance(stats.todayBalance);
  const formattedSevenDay = formatBalance(stats.sevenDayBalance);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl lg:text-4xl font-bold">
          Hey {profile?.first_name} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your progress at a glance
        </p>
      </div>

      {/* Stat Cards - 4 columns on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card
            className={`p-5 bg-card border-border transition-all h-full ${
              formattedBalance.isDeficit ? "border-success/30" : stats.todayBalance > 0 ? "border-danger/30" : ""
            }`}
          >
            <p className="text-xs text-muted-foreground mb-2">Today</p>
            <p className={`font-display text-3xl font-bold ${
              formattedBalance.color === "success" ? "text-success" : formattedBalance.color === "danger" ? "text-danger" : ""
            }`}>
              {formattedBalance.text}
            </p>
            <p className="text-sm text-muted-foreground">kcal</p>
            <div className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>In</span>
                <span>{stats.todayIntake}</span>
              </div>
              <div className="flex justify-between">
                <span>Out</span>
                <span className="text-success">+{stats.todayOuttake}</span>
              </div>
              <div className="flex justify-between">
                <span>Protein</span>
                <span>{stats.todayProtein}/{stats.proteinGoal}g</span>
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
          <Card className={`p-5 bg-card border-border h-full ${formattedSevenDay.isDeficit ? "border-success/30" : ""}`}>
            <p className="text-xs text-muted-foreground mb-2">7-Day Total</p>
            <p className={`font-display text-3xl font-bold ${
              formattedSevenDay.color === "success" ? "text-success" : formattedSevenDay.color === "danger" ? "text-danger" : ""
            }`}>
              {formattedSevenDay.text}
            </p>
            <p className="text-sm text-muted-foreground">kcal</p>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Daily avg: <span className={`font-medium ${stats.sevenDayAverage < 0 ? "text-success" : "text-danger"}`}>
                  {stats.sevenDayAverage < 0 ? "" : "+"}{stats.sevenDayAverage}
                </span>
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Card 3: Real Weight */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-5 bg-card border-border h-full">
            <p className="text-xs text-muted-foreground mb-2">Real Weight</p>
            <p className="font-display text-3xl font-bold">
              {stats.realWeight?.toFixed(1) || "—"}
            </p>
            <p className="text-sm text-muted-foreground">kg</p>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">7-day average</p>
            </div>
          </Card>
        </motion.div>

        {/* Card 4: Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="p-5 bg-card border-border border-gold/20 h-full">
            <p className="text-xs text-muted-foreground mb-2">Streak</p>
            <p className="font-display text-3xl font-bold text-gold">
              🔥 {stats.streak}
            </p>
            <p className="text-sm text-muted-foreground">days</p>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">Keep it going!</p>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Calendar - Full size */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="p-6 bg-card border-border">
          <h2 className="font-display text-lg font-semibold mb-4">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
              <div key={i} className="text-center text-sm text-muted-foreground font-medium py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendar.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day.date && !day.isLocked && !day.isFuture && onDayClick(day)}
                disabled={!day.date || day.isLocked || day.isFuture}
                className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center transition-all relative p-2 ${
                  !day.date
                    ? "invisible"
                    : day.isLocked
                    ? "bg-secondary/50 opacity-40"
                    : day.isFuture
                    ? "bg-secondary/20 text-muted-foreground"
                    : day.hasData && day.isSuccess
                    ? "bg-success/20 text-success hover:bg-success/30"
                    : day.hasData && !day.isSuccess
                    ? "bg-danger/20 text-danger hover:bg-danger/30"
                    : "bg-secondary/50 hover:bg-secondary"
                } ${day.isToday ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-medium">{day.date && day.dayOfMonth}</span>
                {day.weight && (
                  <span className="text-[10px] text-muted-foreground mt-0.5">{day.weight}kg</span>
                )}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-success/20 border border-success/30"></div>
              <span>Deficit (good)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-danger/20 border border-danger/30"></div>
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
          content: "Hey! 👋 What have you eaten or done today?\n\nTry: \"2 eggs and toast\" or \"30 min run\"",
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
        content: "✅ Logged! What else?",
        confirmed: true,
      },
    ]);

    // Trigger dashboard refresh
    onEntryConfirmed();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <span>💬</span> AI Diary
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Log food & exercise naturally</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>

                {message.parsedData && !message.confirmed && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <div className="space-y-1 text-xs">
                      {message.parsedData.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between gap-2">
                          <span className="truncate">{item.description}</span>
                          <span className="opacity-70 shrink-0">{item.calories}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(message.id)}
                        className="h-6 text-xs bg-success hover:bg-success/90 px-2"
                      >
                        ✓ Log
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2">
                        ✗
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
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What did you eat?"
            className="flex-1 bg-secondary/50 border-0 text-sm h-9"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} size="sm" className="bg-primary h-9 px-3">
            →
          </Button>
        </form>
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
    const bmr = calculateBMR(
      profile.current_weight_kg || profile.starting_weight_kg,
      profile.height_cm,
      age,
      profile.gender
    );
    const tdee = calculateTDEE(bmr, profile.activity_level);

    const todayBalance = todayLog
      ? calculateDailyBalance(tdee, todayLog.caloric_intake, todayLog.caloric_outtake)
      : 0;

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
      profile.current_weight_kg || profile.starting_weight_kg,
      profile.activity_level !== "sedentary"
    );

    setStats({
      todayBalance,
      todayIntake: todayLog?.caloric_intake || 0,
      todayOuttake: todayLog?.caloric_outtake || 0,
      todayProtein: todayLog?.protein_grams || 0,
      proteinGoal,
      maintenanceCalories: tdee,
      sevenDayBalance: sevenDay.total,
      sevenDayAverage: sevenDay.average,
      realWeight,
      realWeightChange: null,
      predictedWeight: prediction.predictedWeight,
      predictedChange: prediction.predictedChange,
      streak,
    });

    buildCalendar(logs, sub, tdee);
  };

  const buildCalendar = (logs: DailyLog[], sub: Subscription | null, tdee: number) => {
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

      calendarDays.push({
        date: dateStr,
        dayOfMonth: day,
        weight: log?.weight_kg || null,
        balance,
        isSuccess: balance < 0,
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

      {/* Desktop: Split view */}
      <div className="hidden lg:flex h-[calc(100vh-4rem)]">
        {/* Left: Dashboard (main content) */}
        <div className="flex-1 overflow-y-auto p-6">
          <DashboardStats 
            stats={stats} 
            calendar={calendar} 
            profile={profile} 
            logs={logs}
            onDayClick={setSelectedDay} 
          />
        </div>

        {/* Right: AI Diary (sidebar) */}
        <div className="w-[380px] xl:w-[420px] border-l border-border flex flex-col bg-card/30">
          <AIDiary onEntryConfirmed={handleEntryConfirmed} />
        </div>
      </div>

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
