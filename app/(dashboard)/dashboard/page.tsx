"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
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
import type { Profile, DailyLog, Subscription } from "@/types";

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

function DashboardContent() {
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "true";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showWelcome, setShowWelcome] = useState(isWelcome);

  // Calculated stats
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
  }, []);

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const [profileRes, logsRes, subRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(60),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    if (subRes.data) setSubscription(subRes.data);

    // Calculate everything
    if (profileRes.data) {
      calculateStats(profileRes.data, logsRes.data || [], subRes.data);
    }

    setLoading(false);
  };

  const calculateStats = (
    profile: Profile,
    logs: DailyLog[],
    sub: Subscription | null
  ) => {
    const today = new Date().toISOString().split("T")[0];
    const todayLog = logs.find((l) => l.log_date === today);

    // Calculate maintenance calories
    const age = calculateAge(new Date(profile.date_of_birth));
    const bmr = calculateBMR(
      profile.current_weight_kg || profile.starting_weight_kg,
      profile.height_cm,
      age,
      profile.gender
    );
    const tdee = calculateTDEE(bmr, profile.activity_level);

    // Today's balance
    const todayBalance = todayLog
      ? calculateDailyBalance(
          tdee,
          todayLog.caloric_intake,
          todayLog.caloric_outtake
        )
      : 0;

    // 7-day data
    const last7Days = logs.slice(0, 7).map((l) => ({
      date: new Date(l.log_date),
      balance: calculateDailyBalance(tdee, l.caloric_intake, l.caloric_outtake),
    }));
    const sevenDay = calculate7DayBalance(last7Days);

    // Real weight
    const weights = logs
      .filter((l) => l.weight_kg)
      .map((l) => ({
        date: new Date(l.log_date),
        weight: l.weight_kg!,
      }));
    const realWeight = calculateRealWeight(weights);

    // Prediction
    const prediction = predictWeight30Days(
      realWeight || profile.starting_weight_kg,
      last7Days.map((d) => d.balance)
    );

    // Streak
    const streak = calculateStreak(last7Days);

    // Protein goal
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
      realWeightChange: null, // TODO: Compare with previous week
      predictedWeight: prediction.predictedWeight,
      predictedChange: prediction.predictedChange,
      streak,
    });

    // Build calendar
    buildCalendar(logs, sub, tdee);
  };

  const buildCalendar = (
    logs: DailyLog[],
    sub: Subscription | null,
    tdee: number
  ) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Get first day of month and total days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // Trial end date
    const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const isPaid = sub?.status === "active";

    const calendarDays: CalendarDay[] = [];

    // Add empty days for padding
    for (let i = 0; i < startDayOfWeek; i++) {
      calendarDays.push({
        date: "",
        dayOfMonth: 0,
        weight: null,
        balance: 0,
        isSuccess: false,
        isLocked: false,
        isFuture: true,
        isToday: false,
        hasData: false,
      });
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = date.toISOString().split("T")[0];
      const log = logs.find((l) => l.log_date === dateStr);

      const isToday =
        date.toDateString() === today.toDateString();
      const isFuture = date > today;

      // Check if locked (past trial and not paid)
      let isLocked = false;
      if (!isPaid && trialEnd && date > trialEnd && !isFuture) {
        isLocked = true;
      }

      const balance = log
        ? calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake)
        : 0;

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

    const { error } = await supabase.from("daily_logs").upsert(
      {
        user_id: user.id,
        log_date: date,
        weight_kg: weight,
      },
      { onConflict: "user_id,log_date" }
    );

    if (!error) {
      fetchData();
      setSelectedDay(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const formattedBalance = formatBalance(stats.todayBalance);
  const formattedSevenDay = formatBalance(stats.sevenDayBalance);

  return (
    <div className="max-w-6xl mx-auto">
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
                  Start by logging your first meal in the{" "}
                  <span className="text-primary font-medium">AI Diary</span>.
                </p>
                <Button
                  onClick={() => setShowWelcome(false)}
                  className="bg-primary hover:bg-primary/90"
                >
                  Let's go!
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          Hey {profile?.first_name} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your progress at a glance
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Today's Balance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card
            className={`p-6 bg-card border-border hover:border-opacity-50 transition-all ${
              formattedBalance.isDeficit
                ? "hover:border-success glow-success"
                : stats.todayBalance > 0
                ? "hover:border-danger"
                : ""
            }`}
          >
            <p className="text-sm text-muted-foreground mb-2">Today's Balance</p>
            <p
              className={`font-display text-4xl font-bold ${
                formattedBalance.color === "success"
                  ? "text-success"
                  : formattedBalance.color === "danger"
                  ? "text-danger"
                  : ""
              }`}
            >
              {formattedBalance.text}
            </p>
            <p className="text-xs text-muted-foreground mt-2">kcal</p>
            <div className="mt-4 pt-4 border-t border-border space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Maintenance</span>
                <span>{stats.maintenanceCalories.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Intake</span>
                <span>{stats.todayIntake.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Exercise</span>
                <span>+{stats.todayOuttake.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-muted-foreground">Protein</span>
                <span>
                  {stats.todayProtein}/{stats.proteinGoal}g
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Card 2: 7-Day Balance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card
            className={`p-6 bg-card border-border hover:border-opacity-50 transition-all ${
              formattedSevenDay.isDeficit ? "hover:border-success" : ""
            }`}
          >
            <p className="text-sm text-muted-foreground mb-2">7-Day Balance</p>
            <p
              className={`font-display text-4xl font-bold ${
                formattedSevenDay.color === "success"
                  ? "text-success"
                  : formattedSevenDay.color === "danger"
                  ? "text-danger"
                  : ""
              }`}
            >
              {formattedSevenDay.text}
            </p>
            <p className="text-xs text-muted-foreground mt-2">kcal total</p>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Averaging{" "}
                <span
                  className={
                    stats.sevenDayAverage < 0 ? "text-success" : "text-danger"
                  }
                >
                  {stats.sevenDayAverage < 0 ? "" : "+"}
                  {stats.sevenDayAverage.toLocaleString()}
                </span>
                /day
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Card 3: Real Weight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all">
            <p className="text-sm text-muted-foreground mb-2">Real Weight</p>
            <p className="font-display text-4xl font-bold">
              {stats.realWeight?.toFixed(1) || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">kg (7-day avg)</p>
            {stats.realWeightChange !== null && (
              <div className="mt-4 pt-4 border-t border-border">
                <p
                  className={`text-xs ${
                    stats.realWeightChange < 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {stats.realWeightChange < 0 ? "↓" : "↑"}{" "}
                  {Math.abs(stats.realWeightChange).toFixed(1)} kg from last week
                </p>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Card 4: 30-Day Prediction */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-6 bg-card border-border hover:border-gold/50 transition-all">
            <p className="text-sm text-muted-foreground mb-2">30-Day Prediction</p>
            <p className="font-display text-4xl font-bold">
              {stats.predictedChange
                ? `${stats.predictedWeight! < (stats.realWeight || 0) ? "-" : "+"}${stats.predictedChange.toFixed(1)}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">kg projected</p>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs">
                <span className="text-gold">🔥 {stats.streak}</span> day streak
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="p-6 bg-card border-border">
          <h2 className="font-display text-xl font-bold mb-4">
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="text-center text-xs text-muted-foreground font-medium py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendar.map((day, idx) => (
              <motion.button
                key={idx}
                whileHover={day.date && !day.isLocked ? { scale: 1.05 } : {}}
                whileTap={day.date && !day.isLocked ? { scale: 0.95 } : {}}
                onClick={() =>
                  day.date && !day.isLocked && !day.isFuture && setSelectedDay(day)
                }
                disabled={!day.date || day.isLocked || day.isFuture}
                className={`aspect-square rounded-lg p-2 text-left transition-all relative ${
                  !day.date
                    ? "invisible"
                    : day.isLocked
                    ? "bg-secondary/50 opacity-50 cursor-not-allowed"
                    : day.isFuture
                    ? "bg-secondary/30 cursor-default"
                    : day.hasData && day.isSuccess
                    ? "bg-success-muted/30 hover:bg-success-muted/50 border border-success/20"
                    : day.hasData && !day.isSuccess
                    ? "bg-danger-muted/30 hover:bg-danger-muted/50 border border-danger/20"
                    : "bg-secondary hover:bg-secondary/80"
                } ${day.isToday ? "ring-2 ring-primary" : ""}`}
              >
                {day.date && (
                  <>
                    <span
                      className={`text-xs ${
                        day.isToday
                          ? "text-primary font-bold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {day.dayOfMonth}
                    </span>
                    {day.weight && (
                      <p className="font-display text-lg font-bold mt-1">
                        {day.weight.toFixed(1)}
                      </p>
                    )}
                    {day.hasData && (
                      <p
                        className={`text-xs ${
                          day.isSuccess ? "text-success" : "text-danger"
                        }`}
                      >
                        {day.balance < 0 ? "" : "+"}
                        {day.balance}
                      </p>
                    )}
                    {day.isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
                        <span className="text-xl">🔒</span>
                      </div>
                    )}
                  </>
                )}
              </motion.button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Day Modal */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display">
              {selectedDay?.date &&
                new Date(selectedDay.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
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
                    saveWeight(
                      selectedDay.date,
                      parseFloat((e.target as HTMLInputElement).value)
                    );
                  }
                }}
              />
            </div>

            {selectedDay?.hasData && (
              <div className="space-y-2 pt-4 border-t border-border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Intake</span>
                  <span>
                    {logs
                      .find((l) => l.log_date === selectedDay.date)
                      ?.caloric_intake.toLocaleString() || 0}{" "}
                    kcal
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exercise</span>
                  <span>
                    {logs
                      .find((l) => l.log_date === selectedDay.date)
                      ?.caloric_outtake.toLocaleString() || 0}{" "}
                    kcal
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Balance</span>
                  <span
                    className={
                      selectedDay.isSuccess ? "text-success" : "text-danger"
                    }
                  >
                    {selectedDay.balance < 0 ? "" : "+"}
                    {selectedDay.balance} kcal
                  </span>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary/90 mt-4"
              onClick={() => {
                const input = document.querySelector(
                  'input[type="number"]'
                ) as HTMLInputElement;
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
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
