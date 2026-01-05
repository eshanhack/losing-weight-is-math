"use client";

import { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
// GAMIFICATION SYSTEM
// ============================================================================

interface Level {
  level: number;
  name: string;
  icon: string;
  xpRequired: number;
  color: string;
}

interface PrestigeBadge {
  id: number;
  name: string;
  icon: string;
  streakRequired: number;
  color: string;
}

const LEVELS: Level[] = [
  { level: 1, name: "Rookie", icon: "🌱", xpRequired: 0, color: "text-gray-400" },
  { level: 2, name: "Starter", icon: "🔥", xpRequired: 300, color: "text-orange-400" },
  { level: 3, name: "Apprentice", icon: "⚡", xpRequired: 800, color: "text-yellow-400" },
  { level: 4, name: "Fighter", icon: "💪", xpRequired: 1800, color: "text-amber-500" },
  { level: 5, name: "Warrior", icon: "⚔️", xpRequired: 3500, color: "text-orange-500" },
  { level: 6, name: "Champion", icon: "🏆", xpRequired: 6000, color: "text-yellow-500" },
  { level: 7, name: "Legend", icon: "👑", xpRequired: 10000, color: "text-amber-400" },
  { level: 8, name: "Titan", icon: "🌟", xpRequired: 16000, color: "text-purple-400" },
  { level: 9, name: "Mythic", icon: "💎", xpRequired: 25000, color: "text-cyan-400" },
  { level: 10, name: "Immortal", icon: "🔮", xpRequired: 40000, color: "text-fuchsia-400" },
];

const PRESTIGE_BADGES: PrestigeBadge[] = [
  { id: 1, name: "Bronze", icon: "🥉", streakRequired: 7, color: "text-amber-600" },
  { id: 2, name: "Silver", icon: "🥈", streakRequired: 14, color: "text-gray-300" },
  { id: 3, name: "Gold", icon: "🥇", streakRequired: 21, color: "text-yellow-400" },
  { id: 4, name: "Platinum", icon: "💫", streakRequired: 28, color: "text-cyan-300" },
  { id: 5, name: "Diamond", icon: "💎", streakRequired: 35, color: "text-blue-400" },
  { id: 6, name: "Ruby", icon: "❤️‍🔥", streakRequired: 42, color: "text-red-500" },
  { id: 7, name: "Sapphire", icon: "💙", streakRequired: 49, color: "text-blue-500" },
  { id: 8, name: "Emerald", icon: "💚", streakRequired: 56, color: "text-emerald-500" },
  { id: 9, name: "Obsidian", icon: "🖤", streakRequired: 63, color: "text-slate-800" },
  { id: 10, name: "Legendary", icon: "👑", streakRequired: 70, color: "text-amber-400" },
];

// Calculate XP from a deficit day with streak multiplier
function calculateDayXP(deficit: number, streakDay: number): number {
  if (deficit >= 0) return 0; // No XP for surplus days
  // Base XP = deficit / 10 (so -800 cal deficit = 80 base XP)
  const baseXP = Math.abs(deficit) / 10;
  // Streak multiplier: compounds as streak grows
  const multiplier = 1 + (streakDay - 1) * 0.1; // Day 1: 1x, Day 7: 1.6x, Day 14: 2.3x
  return Math.round(baseXP * multiplier);
}

// Calculate total XP from daily logs
function calculateTotalXP(logs: DailyLog[], tdee: number, goalDeficit: number): number {
  let totalXP = 0;
  let currentStreak = 0;
  
  // Sort logs by date ascending (oldest first)
  const sortedLogs = [...logs].sort((a, b) => 
    new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
  );
  
  for (const log of sortedLogs) {
    const balance = calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake);
    // XP awarded for meeting goal (balance <= goalDeficit) or being in deficit
    if (balance <= goalDeficit) {
      currentStreak++;
      totalXP += calculateDayXP(balance, currentStreak);
    } else if (balance < 0) {
      // Still in deficit but didn't meet goal - smaller XP, streak continues
      currentStreak++;
      totalXP += Math.round(calculateDayXP(balance, currentStreak) * 0.5);
    } else {
      // Surplus day - streak breaks
      currentStreak = 0;
    }
  }
  
  return totalXP;
}

// Get current level from XP
function getCurrentLevel(xp: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

// Get next level (or null if max)
function getNextLevel(xp: number): Level | null {
  const currentLevel = getCurrentLevel(xp);
  const nextLevelIndex = LEVELS.findIndex(l => l.level === currentLevel.level + 1);
  return nextLevelIndex !== -1 ? LEVELS[nextLevelIndex] : null;
}

// Get XP progress to next level (0-100)
function getLevelProgress(xp: number): number {
  const current = getCurrentLevel(xp);
  const next = getNextLevel(xp);
  if (!next) return 100; // Max level
  const xpInLevel = xp - current.xpRequired;
  const xpNeeded = next.xpRequired - current.xpRequired;
  return Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
}

// Get earned prestige badges from max streak achieved
function getEarnedPrestiges(maxStreak: number): PrestigeBadge[] {
  return PRESTIGE_BADGES.filter(badge => maxStreak >= badge.streakRequired);
}

// Calculate max streak ever achieved from logs
function calculateMaxStreak(logs: DailyLog[], tdee: number, goalDeficit: number): number {
  let maxStreak = 0;
  let currentStreak = 0;
  
  const sortedLogs = [...logs].sort((a, b) => 
    new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
  );
  
  for (const log of sortedLogs) {
    const balance = calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake);
    if (balance < 0) { // In deficit
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  return maxStreak;
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
  intake: number;
  outtake: number;
  isSuccess: boolean;
  balanceStatus: "success" | "warning" | "danger"; // success=met goal, warning=deficit but missed goal, danger=surplus
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
    totalXP: number;
    maxStreak: number;
  };
  calendar: CalendarDay[];
  profile: Profile | null;
  logs: DailyLog[];
  onDayClick: (day: CalendarDay) => void;
  onTodayCardClick: () => void;
  onRealWeightCardClick: () => void;
}) {
  const [showAchievements, setShowAchievements] = useState(false);
  
  // Gamification calculations
  const currentLevel = getCurrentLevel(stats.totalXP);
  const nextLevel = getNextLevel(stats.totalXP);
  const levelProgress = getLevelProgress(stats.totalXP);
  const earnedPrestiges = getEarnedPrestiges(stats.maxStreak);
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
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Daily logging + Deficit consistency = Results
          </p>
        </div>
        {/* Protein Progress Bar */}
        <div className="flex-1 max-w-md hidden sm:block">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              🥩 Today's Protein Goal
            </span>
            <span className="text-xs font-medium">
              <span className={proteinProgress >= 100 ? "text-success" : "text-foreground"}>{stats.todayProtein}g</span>
              <span className="text-muted-foreground"> / {stats.proteinGoal}g</span>
            </span>
          </div>
          <ProgressBar value={stats.todayProtein} max={stats.proteinGoal} />
        </div>
      </div>

      {/* Stat Cards - Compact style */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 lg:gap-3">
        {/* Card 1: Today's Balance - Clickable to see breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card 
            onClick={onTodayCardClick}
            className={`p-3 lg:p-4 bg-card border-border h-full card-hover cursor-pointer ${
              formattedBalance.color === "success" ? "border-success/30" : 
              formattedBalance.color === "warning" ? "border-gold/30" : 
              formattedBalance.color === "danger" ? "border-danger/30" : ""
            }`}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground">Today's Balance</h3>
              {/* Info icon with tooltip */}
              <div className="relative group">
                <span className="text-muted-foreground hover:text-foreground cursor-help text-sm">ℹ️</span>
                {/* Tooltip */}
                <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-44 p-2 bg-popover border border-border rounded-lg shadow-lg text-[10px]">
                  <div className="space-y-1.5">
                    {formattedBalance.toGoal > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span>🔥</span>
                        <span>Burn <span className="text-success font-semibold">{formattedBalance.toGoal.toLocaleString()}</span> to reach goal</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span>🍽️</span>
                        <span>Can eat <span className="text-success font-semibold">{Math.abs(formattedBalance.toGoal).toLocaleString()}</span> more (at goal!)</span>
                      </div>
                    )}
                    {stats.todayBalance >= 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span>🏃</span>
                        <span>Burn <span className="text-success font-semibold">{stats.todayBalance.toLocaleString()}</span> for maintenance</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span>🍴</span>
                        <span>Can eat <span className="text-danger font-semibold">{Math.abs(stats.todayBalance).toLocaleString()}</span> before maintenance</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Main value with goal */}
            <div className="flex items-end gap-2 mb-2">
              <span className={`font-display text-2xl font-bold leading-none ${
                formattedBalance.color === "success" ? "text-success" : 
                formattedBalance.color === "warning" ? "text-gold" : 
                formattedBalance.color === "danger" ? "text-danger" : "text-foreground"
              }`}>
                {formattedBalance.text}
              </span>
              <span className="text-xs text-muted-foreground pb-0.5">/ {stats.goalDeficit.toLocaleString()}</span>
            </div>
            {/* Eaten & Burned */}
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>🍽️ {stats.todayIntake.toLocaleString()}</span>
              <span className="text-success">🔥 +{stats.todayOuttake.toLocaleString()}</span>
            </div>
          </Card>
        </motion.div>

        {/* Card 2: 7-Day Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className={`p-3 lg:p-4 bg-card border-border h-full card-hover ${
            stats.sevenDayBalance <= stats.goalDeficit * 7 ? "border-success/30" :
            stats.sevenDayBalance < 0 ? "border-gold/30" : "border-danger/30"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground">Weekly Balance</h3>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className={`font-display text-2xl font-bold leading-none ${
                stats.sevenDayBalance <= stats.goalDeficit * 7 ? "text-success" :
                stats.sevenDayBalance < 0 ? "text-gold" : "text-danger"
              }`}>
                {formattedSevenDay.text}
              </span>
              <span className="text-xs text-muted-foreground pb-0.5">/ {(stats.goalDeficit * 7).toLocaleString()}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              <span>Avg: </span>
              <span className={
                stats.sevenDayAverage <= stats.goalDeficit ? "text-success" :
                stats.sevenDayAverage < 0 ? "text-gold" : "text-danger"
              }>
                {stats.sevenDayAverage < 0 ? "" : "+"}{stats.sevenDayAverage}
              </span>
              <span className="text-muted-foreground"> / {stats.goalDeficit}/day</span>
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
            className="p-3 lg:p-4 bg-card border-border h-full card-hover cursor-pointer hover:border-primary/50 transition-colors"
            onClick={onRealWeightCardClick}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground">Real Weight</h3>
              <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">
                Tap to log
              </span>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="font-display text-2xl font-bold leading-none text-foreground">
                {stats.realWeight?.toFixed(1) || "—"}
              </span>
              <span className="text-xs text-muted-foreground pb-0.5">kg</span>
              {stats.realWeightChange !== null && stats.realWeightChange !== 0 && (
                <span className={`text-xs font-medium pb-0.5 ${stats.realWeightChange < 0 ? "text-success" : "text-danger"}`}>
                  {stats.realWeightChange > 0 ? "+" : ""}{stats.realWeightChange}
                </span>
              )}
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>🎯 {profile?.goal_weight_kg || "—"}kg</span>
              <span>📍 {profile?.starting_weight_kg || "—"}kg</span>
            </div>
          </Card>
        </motion.div>

        {/* Card 4: Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card 
            className="p-3 lg:p-4 bg-card border-border border-gold/20 h-full card-hover cursor-pointer"
            onClick={() => setShowAchievements(true)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm ${currentLevel.color}`}>{currentLevel.icon}</span>
                <span className="text-[10px] font-medium text-muted-foreground">{currentLevel.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {earnedPrestiges.slice(-3).map((badge) => (
                  <span key={badge.id} className="text-[10px]" title={`${badge.name} (${badge.streakRequired}d)`}>
                    {badge.icon}
                  </span>
                ))}
                {earnedPrestiges.length > 3 && (
                  <span className="text-[8px] text-muted-foreground">+{earnedPrestiges.length - 3}</span>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2 mb-1">
              <span className="font-display text-2xl font-bold leading-none text-gold">
                {stats.streak}
              </span>
              <span className="text-xs text-muted-foreground pb-0.5">day streak 🔥</span>
            </div>
            {/* XP Progress Bar */}
            <div className="mb-1">
              <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                <span>{stats.totalXP.toLocaleString()} XP</span>
                <span>{nextLevel ? `${nextLevel.xpRequired.toLocaleString()} XP` : "MAX"}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-gold to-amber-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${levelProgress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground/70">
              Tap to view achievements
            </div>
          </Card>
        </motion.div>

        {/* Achievements Modal */}
        <Dialog open={showAchievements} onOpenChange={setShowAchievements}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-display flex items-center gap-2">
                🏅 Achievements
              </DialogTitle>
            </DialogHeader>
            
            {/* Current Stats */}
            <div className="bg-secondary/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl ${currentLevel.color}`}>{currentLevel.icon}</span>
                  <div>
                    <p className={`font-bold ${currentLevel.color}`}>Level {currentLevel.level}: {currentLevel.name}</p>
                    <p className="text-xs text-muted-foreground">{stats.totalXP.toLocaleString()} Total XP</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-bold text-gold">{stats.streak}</p>
                  <p className="text-xs text-muted-foreground">Day Streak</p>
                </div>
              </div>
              {nextLevel && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Progress to {nextLevel.name}</span>
                    <span>{(nextLevel.xpRequired - stats.totalXP).toLocaleString()} XP to go</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-gold to-amber-400 rounded-full transition-all"
                      style={{ width: `${levelProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Levels Section */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                ⭐ Levels
                <span className="text-xs font-normal text-muted-foreground">
                  ({currentLevel.level}/{LEVELS.length})
                </span>
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.map((level) => {
                  const isEarned = stats.totalXP >= level.xpRequired;
                  return (
                    <div
                      key={level.level}
                      className={`relative group flex flex-col items-center p-2 rounded-lg border transition-all ${
                        isEarned 
                          ? "bg-secondary/50 border-border" 
                          : "bg-secondary/20 border-border/30 opacity-50"
                      }`}
                      title={`Level ${level.level}: ${level.name} - ${level.xpRequired.toLocaleString()} XP`}
                    >
                      <span className={`text-xl ${isEarned ? "" : "grayscale opacity-30"}`}>
                        {level.icon}
                      </span>
                      <span className={`text-[9px] mt-0.5 ${isEarned ? level.color : "text-muted-foreground/50"}`}>
                        Lv.{level.level}
                      </span>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <p className="font-medium">{level.name}</p>
                        <p className="text-muted-foreground">{level.xpRequired.toLocaleString()} XP</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Prestige Badges Section */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                🎖️ Prestige Badges
                <span className="text-xs font-normal text-muted-foreground">
                  ({earnedPrestiges.length}/{PRESTIGE_BADGES.length})
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Earn badges every 7 days of deficit streak!
              </p>
              <div className="grid grid-cols-5 gap-2">
                {PRESTIGE_BADGES.map((badge) => {
                  const isEarned = stats.maxStreak >= badge.streakRequired;
                  return (
                    <div
                      key={badge.id}
                      className={`relative group flex flex-col items-center p-2 rounded-lg border transition-all ${
                        isEarned 
                          ? "bg-secondary/50 border-border" 
                          : "bg-secondary/20 border-border/30 opacity-50"
                      }`}
                    >
                      <span className={`text-xl ${isEarned ? "" : "grayscale opacity-30"}`}>
                        {badge.icon}
                      </span>
                      <span className={`text-[9px] mt-0.5 ${isEarned ? badge.color : "text-muted-foreground/50"}`}>
                        {badge.streakRequired}d
                      </span>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <p className="font-medium">{badge.name}</p>
                        <p className="text-muted-foreground">{badge.streakRequired}-day streak</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* XP Explanation */}
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-xs font-semibold mb-1">How XP Works</h4>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                <li>• Base XP = deficit ÷ 10 (e.g., -800 cal = 80 XP)</li>
                <li>• Streak multiplier: +10% per day (Day 7 = 1.6x!)</li>
                <li>• Miss goal but stay in deficit = 50% XP</li>
                <li>• Surplus day = streak resets, no XP</li>
              </ul>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
          <div className="grid grid-cols-7 gap-1 lg:gap-2 relative">
            {calendar.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day.date && !day.isLocked && !day.isFuture && onDayClick(day)}
                disabled={!day.date || day.isLocked || day.isFuture}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative p-2 ${
                  !day.date
                    ? "invisible"
                    : day.isLocked
                    ? "bg-secondary/50 cursor-not-allowed border border-border/50"
                    : day.isFuture
                    ? "bg-secondary/20 text-muted-foreground cursor-default"
                    : day.hasData && day.balanceStatus === "success"
                    ? "bg-success/10 hover:bg-success/20 border border-success/30"
                    : day.hasData && day.balanceStatus === "warning"
                    ? "bg-gold/10 hover:bg-gold/20 border border-gold/30"
                    : day.hasData && day.balanceStatus === "danger"
                    ? "bg-danger/10 hover:bg-danger/20 border border-danger/30"
                    : "bg-secondary/30 hover:bg-secondary/50"
                } ${day.isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
              >
                {/* Lock icon for locked days */}
                {day.isLocked && day.date && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg backdrop-blur-[1px]">
                    <span className="text-lg opacity-60">🔒</span>
                  </div>
                )}
                <span className={`font-bold text-base ${day.isLocked ? "text-muted-foreground/50" : "text-foreground"}`}>
                  {day.date && day.dayOfMonth}
                </span>
                {/* Show weight if logged with change from yesterday */}
                {day.weight && !day.isLocked && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-blue-400 font-medium">{day.weight}kg</span>
                    {day.weightChange !== null && day.weightChange !== 0 && (
                      <span className={`text-[9px] font-semibold ${day.weightChange < 0 ? "text-success" : "text-danger"}`}>
                        {day.weightChange > 0 ? "+" : ""}{day.weightChange}
                      </span>
                    )}
                  </div>
                )}
                {day.hasData && !day.isLocked && (
                  <div className="flex flex-col items-center mt-0.5 gap-0.5">
                    <span className={`text-[11px] font-semibold ${
                      day.balanceStatus === "success" ? "text-success" : 
                      day.balanceStatus === "warning" ? "text-gold" : "text-danger"
                    }`}>
                      {day.balance >= 0 ? "+" : ""}{day.balance} cal
                    </span>
                    <div className="flex gap-1.5 text-[9px] text-muted-foreground">
                      <span>🍽️{day.intake}</span>
                      <span>🔥{day.outtake}</span>
                    </div>
                    {day.protein > 0 && (
                      <span className="text-[10px] text-muted-foreground">{day.protein}g pro</span>
                    )}
                  </div>
                )}
              </button>
            ))}
            
            {/* Upgrade banner overlay if any days are locked */}
            {calendar.some(d => d.isLocked) && (
              <div className="col-span-7 mt-2">
                <Link href="/dashboard/subscribe">
                  <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border border-primary/30 rounded-lg p-3 flex items-center justify-between hover:bg-primary/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🔓</span>
                      <div>
                        <p className="font-semibold text-sm text-foreground">Upgrade to unlock full calendar</p>
                        <p className="text-xs text-muted-foreground">Continue tracking your progress beyond the trial</p>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 bg-primary text-white text-sm font-semibold rounded-lg">
                      Upgrade →
                    </span>
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-success/10 border border-success/20"></div>
              <span>Goal met</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gold/10 border border-gold/20"></div>
              <span>Deficit (missed goal)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-danger/10 border border-danger/20"></div>
              <span>Surplus</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded ring-2 ring-primary"></div>
              <span>Today</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-muted-foreground/70">🍽️ eaten • 🔥 burned</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// ============================================================================
// COACHING MESSAGE GENERATOR
// ============================================================================

interface CoachingContext {
  currentBalance: number; // Current day's caloric balance (negative = deficit, positive = surplus)
  goalDeficit: number; // User's target daily deficit (e.g., -500, -1000)
  tdee: number; // User's TDEE
  currentHour: number; // Current hour (0-23) for time-aware suggestions
}

function generateCoachingMessage(ctx: CoachingContext): string | null {
  const { currentBalance, goalDeficit, tdee, currentHour } = ctx;
  
  // Activity calories burned estimates (per minute, average adult)
  const activities = {
    walk: { name: "walking", emoji: "🚶", calPerMin: 4, intensity: "light" },
    briskWalk: { name: "brisk walking", emoji: "🚶‍♂️", calPerMin: 5.5, intensity: "moderate" },
    jog: { name: "jogging", emoji: "🏃", calPerMin: 9, intensity: "moderate" },
    run: { name: "running", emoji: "🏃‍♂️", calPerMin: 12, intensity: "high" },
    cycle: { name: "cycling", emoji: "🚴", calPerMin: 8, intensity: "moderate" },
    hiit: { name: "HIIT workout", emoji: "💪", calPerMin: 14, intensity: "high" },
  };

  // Calculate how far from goal they are
  const overGoalBy = currentBalance - goalDeficit; // Positive means over goal
  const isInSurplus = currentBalance > 0;
  const isAtMaintenance = currentBalance >= -100 && currentBalance <= 100;
  const hitGoal = currentBalance <= goalDeficit;

  // If they hit their goal, no coaching needed
  if (hitGoal) {
    return null;
  }

  // Helper to format activity suggestion
  const suggestActivity = (caloriesToBurn: number): string => {
    const suggestions: string[] = [];
    
    // Walking (always suggest, it's accessible)
    const walkMins = Math.ceil(caloriesToBurn / activities.walk.calPerMin);
    if (walkMins <= 60) {
      suggestions.push(`${activities.walk.emoji} ${walkMins} min walk`);
    } else if (walkMins <= 90) {
      suggestions.push(`${activities.walk.emoji} ${walkMins} min walk (or split into two)`);
    }
    
    // Brisk walk
    const briskMins = Math.ceil(caloriesToBurn / activities.briskWalk.calPerMin);
    if (briskMins <= 45) {
      suggestions.push(`${activities.briskWalk.emoji} ${briskMins} min brisk walk`);
    }
    
    // Jogging (if reasonable time)
    const jogMins = Math.ceil(caloriesToBurn / activities.jog.calPerMin);
    if (jogMins <= 30 && jogMins >= 10) {
      suggestions.push(`${activities.jog.emoji} ${jogMins} min jog`);
    }
    
    // Running (if short time needed)
    const runMins = Math.ceil(caloriesToBurn / activities.run.calPerMin);
    if (runMins <= 25 && runMins >= 10) {
      suggestions.push(`${activities.run.emoji} ${runMins} min run`);
    }
    
    // HIIT (if short time needed)
    const hiitMins = Math.ceil(caloriesToBurn / activities.hiit.calPerMin);
    if (hiitMins <= 20 && hiitMins >= 10) {
      suggestions.push(`${activities.hiit.emoji} ${hiitMins} min HIIT`);
    }

    return suggestions.slice(0, 3).join(" • ");
  };

  // Time-aware greeting
  const timeGreeting = currentHour < 12 ? "this morning" : currentHour < 17 ? "this afternoon" : "this evening";

  // SCENARIO 1: Large surplus (600+ calories over TDEE)
  if (isInSurplus && currentBalance >= 600) {
    const toMaintenance = currentBalance;
    const suggestions = suggestActivity(Math.min(toMaintenance, 400)); // Cap at realistic amount
    return `⚠️ You're ${currentBalance} cal over maintenance ${timeGreeting}. It's hard to burn it all, but some activity will help minimize the damage!\n\nTry: ${suggestions}\n\nEven a short walk is better than nothing! Don't let one day derail your progress 💪`;
  }

  // SCENARIO 2: Moderate surplus (300-600 calories over TDEE)
  if (isInSurplus && currentBalance >= 300) {
    const toMaintenance = currentBalance;
    const suggestions = suggestActivity(toMaintenance);
    return `📊 You're ${currentBalance} cal over maintenance. Let's get back to break-even!\n\nSuggested activities to burn ${toMaintenance} cal:\n${suggestions}\n\nYou've got this! 🔥`;
  }

  // SCENARIO 3: Small surplus (1-300 calories over TDEE)
  if (isInSurplus) {
    const toMaintenance = currentBalance;
    const toGoal = overGoalBy;
    const suggestions = suggestActivity(toGoal);
    return `💡 You're slightly over maintenance (+${currentBalance} cal). A quick activity can get you back on track!\n\nTo hit your goal deficit (${Math.abs(goalDeficit)} cal):\n${suggestions}\n\nOr even a short ${Math.ceil(toMaintenance / activities.walk.calPerMin)} min walk gets you to break-even!`;
  }

  // SCENARIO 4: At maintenance (around 0 balance)
  if (isAtMaintenance) {
    const toGoal = Math.abs(goalDeficit);
    const suggestions = suggestActivity(toGoal);
    return `⚖️ You're at maintenance ${timeGreeting}. Not bad, but let's hit that deficit goal!\n\nTo reach your ${Math.abs(goalDeficit)} cal deficit:\n${suggestions}\n\nKeep going! 💪`;
  }

  // SCENARIO 5: In deficit but not meeting goal
  if (currentBalance < 0 && overGoalBy > 0) {
    // They're in deficit but not enough to hit goal
    const calToGo = overGoalBy;
    
    // Only coach if they're more than 200 cal away from goal
    if (calToGo < 200) {
      return `👍 Almost there! Just ${calToGo} more cal to hit your goal. A ${Math.ceil(calToGo / activities.walk.calPerMin)} min walk would do it!`;
    }
    
    const suggestions = suggestActivity(calToGo);
    return `📈 Good job staying in deficit! You're ${Math.abs(currentBalance)} cal under maintenance.\n\nTo hit your ${Math.abs(goalDeficit)} cal goal, burn ${calToGo} more:\n${suggestions}`;
  }

  return null;
}

// ============================================================================
// MEAL RECOMMENDATION GENERATOR
// ============================================================================

interface MealRecommendationContext {
  caloriesLeft: number;
  proteinGoal: number;
  proteinConsumed: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

function generateMealRecommendation(ctx: MealRecommendationContext): string {
  const { caloriesLeft, proteinGoal, proteinConsumed, mealType } = ctx;
  const proteinLeft = Math.max(0, proteinGoal - proteinConsumed);
  
  // Comprehensive meal database with protein density info
  const allMeals = [
    // High protein, low calorie (protein-dense)
    { name: "Protein shake (whey)", cal: 120, protein: 25, emoji: "🥤", tags: ["quick", "high-protein"] },
    { name: "Greek yogurt (200g)", cal: 120, protein: 20, emoji: "🥛", tags: ["quick", "high-protein"] },
    { name: "Cottage cheese (200g)", cal: 160, protein: 22, emoji: "🧀", tags: ["quick", "high-protein"] },
    { name: "2 cans of tuna", cal: 200, protein: 50, emoji: "🐟", tags: ["high-protein", "meal"] },
    { name: "Grilled chicken breast (200g)", cal: 310, protein: 58, emoji: "🍗", tags: ["high-protein", "meal"] },
    { name: "Egg whites (6) scrambled", cal: 100, protein: 22, emoji: "🥚", tags: ["high-protein", "quick"] },
    { name: "Shrimp (200g)", cal: 200, protein: 40, emoji: "🍤", tags: ["high-protein", "meal"] },
    { name: "Turkey breast (150g)", cal: 165, protein: 35, emoji: "🦃", tags: ["high-protein", "meal"] },
    
    // Moderate protein meals
    { name: "3 whole eggs scrambled", cal: 210, protein: 18, emoji: "🍳", tags: ["quick", "breakfast"] },
    { name: "Salmon fillet (150g)", cal: 280, protein: 34, emoji: "🐟", tags: ["high-protein", "meal"] },
    { name: "Lean beef steak (150g)", cal: 270, protein: 38, emoji: "🥩", tags: ["high-protein", "meal"] },
    { name: "Chicken thigh (skinless, 150g)", cal: 230, protein: 30, emoji: "🍗", tags: ["meal"] },
    { name: "Tofu stir-fry (200g tofu)", cal: 250, protein: 20, emoji: "🥡", tags: ["vegetarian", "meal"] },
    
    // Complete meals
    { name: "Chicken breast with rice & veggies", cal: 500, protein: 45, emoji: "🍚", tags: ["meal", "complete"] },
    { name: "Salmon with quinoa & greens", cal: 520, protein: 40, emoji: "🐟", tags: ["meal", "complete"] },
    { name: "Turkey meatballs with zucchini noodles", cal: 380, protein: 35, emoji: "🍝", tags: ["meal", "complete"] },
    { name: "Chicken stir-fry with veggies", cal: 400, protein: 38, emoji: "🍲", tags: ["meal", "complete"] },
    { name: "Grilled fish tacos (2)", cal: 450, protein: 30, emoji: "🌮", tags: ["meal", "complete"] },
    { name: "Chicken Caesar salad (no croutons)", cal: 400, protein: 35, emoji: "🥗", tags: ["meal", "complete"] },
    { name: "Poke bowl", cal: 550, protein: 35, emoji: "🍣", tags: ["meal", "complete"] },
    { name: "Burrito bowl (chicken, no rice)", cal: 480, protein: 42, emoji: "🥙", tags: ["meal", "complete"] },
    { name: "Steak with sweet potato & salad", cal: 650, protein: 45, emoji: "🥩", tags: ["meal", "complete"] },
    
    // Lower protein options (for when protein goal is met)
    { name: "Mixed green salad with olive oil", cal: 150, protein: 3, emoji: "🥗", tags: ["light", "vegetarian"] },
    { name: "Fruit bowl", cal: 180, protein: 2, emoji: "🍇", tags: ["light", "snack"] },
    { name: "Roasted vegetables", cal: 120, protein: 4, emoji: "🥦", tags: ["light", "vegetarian"] },
    { name: "Rice bowl with veggies", cal: 350, protein: 8, emoji: "🍚", tags: ["vegetarian", "meal"] },
  ];

  // Filter meals that fit the calorie budget
  const fittingMeals = allMeals.filter(meal => meal.cal <= caloriesLeft);
  
  if (fittingMeals.length === 0) {
    return `⚠️ You only have **${caloriesLeft} cal** left - that's quite tight!\n\nLow-cal options:\n• ${allMeals[5].emoji} ${allMeals[5].name} (${allMeals[5].cal} cal, ${allMeals[5].protein}g protein)\n• 🥗 Plain salad with lemon (50 cal)\n• 🥒 Raw veggies (30 cal)\n\n💡 Consider if you've logged everything accurately today!`;
  }

  // Calculate protein density (protein per calorie)
  const mealsWithDensity = fittingMeals.map(meal => ({
    ...meal,
    proteinDensity: meal.protein / meal.cal,
    hitsProteinGoal: meal.protein >= proteinLeft,
    proteinGap: proteinLeft - meal.protein,
  }));

  // Different sorting strategies based on needs
  let sortedMeals;
  let headerMessage = "";
  let strategy = "";

  if (proteinLeft >= 30 && caloriesLeft <= 400) {
    // TIGHT SITUATION: Need lots of protein in few calories
    strategy = "tight";
    sortedMeals = mealsWithDensity.sort((a, b) => b.proteinDensity - a.proteinDensity);
    headerMessage = `💪 **Challenge:** Hit **${proteinLeft}g protein** with only **${caloriesLeft} cal**\n\nYou need protein-dense foods! Here are your best options:\n`;
  } else if (proteinLeft > 0) {
    // BALANCED: Need protein, have reasonable calories
    strategy = "balanced";
    // Prioritize meals that hit the protein goal while fitting calories
    sortedMeals = mealsWithDensity.sort((a, b) => {
      // First priority: meals that hit the protein goal
      if (a.hitsProteinGoal && !b.hitsProteinGoal) return -1;
      if (!a.hitsProteinGoal && b.hitsProteinGoal) return 1;
      // Second priority: highest protein
      return b.protein - a.protein;
    });
    
    const canHitGoal = sortedMeals.some(m => m.hitsProteinGoal);
    if (canHitGoal) {
      headerMessage = `🎯 You have **${caloriesLeft} cal** and **${proteinLeft}g protein** to go for ${mealType}.\n\n✅ These meals will hit your protein goal:\n`;
    } else {
      headerMessage = `🍽️ You have **${caloriesLeft} cal** and **${proteinLeft}g protein** left for ${mealType}.\n\n⚠️ Hard to hit protein in one meal - here are the highest protein options:\n`;
    }
  } else {
    // PROTEIN MET: Just need to fill calories
    strategy = "calories-only";
    sortedMeals = mealsWithDensity.sort((a, b) => {
      // Prefer meals that use most of the calorie budget efficiently
      return Math.abs(b.cal - caloriesLeft * 0.75) - Math.abs(a.cal - caloriesLeft * 0.75);
    });
    headerMessage = `🎉 **Protein goal hit!** You have **${caloriesLeft} cal** left for ${mealType}.\n\nEnjoy any of these:\n`;
  }

  // Get top recommendations
  const top4 = sortedMeals.slice(0, 4);
  
  let message = headerMessage;
  
  top4.forEach((meal, idx) => {
    const proteinStatus = meal.hitsProteinGoal 
      ? "✅" 
      : proteinLeft > 0 
        ? `(${meal.proteinGap}g short)` 
        : "";
    
    message += `\n${idx + 1}. ${meal.emoji} **${meal.name}**\n   ${meal.cal} cal • ${meal.protein}g protein ${proteinStatus}`;
  });

  // Add tips based on situation
  if (strategy === "tight") {
    message += `\n\n💡 **Pro tips for high protein, low cal:**\n• Add a protein shake (+25g for 120 cal)\n• Egg whites are 17 cal per egg, 4g protein\n• Tuna is the most protein-dense food!`;
  } else if (strategy === "balanced" && proteinLeft > 30) {
    message += `\n\n💡 **To maximize protein:** Consider adding a protein shake or Greek yogurt on the side!`;
  } else if (strategy === "calories-only") {
    message += `\n\n💡 You've earned some flexibility! Choose what sounds good.`;
  }

  // Combo suggestion if they need lots of protein
  if (proteinLeft > 40 && caloriesLeft > 300) {
    const shake = allMeals.find(m => m.name.includes("Protein shake"));
    const chicken = allMeals.find(m => m.name.includes("Grilled chicken breast"));
    if (shake && chicken && (shake.cal + chicken.cal) <= caloriesLeft) {
      message += `\n\n🔥 **Power combo:** ${chicken.emoji} Chicken breast + ${shake.emoji} Protein shake = **${chicken.cal + shake.cal} cal**, **${chicken.protein + shake.protein}g protein**`;
    }
  }

  return message;
}

// ============================================================================
// CHEAT MEAL IMPACT CALCULATOR
// ============================================================================

interface CheatMealContext {
  cheatCalories: number;
  cheatProtein: number;
  cheatDescription: string;
  currentBalance: number;
  goalDeficit: number;
  tdee: number;
}

function generateCheatMealImpact(ctx: CheatMealContext): string {
  const { cheatCalories, cheatProtein, cheatDescription, currentBalance, goalDeficit, tdee } = ctx;
  
  // Calculate impact
  const newBalance = currentBalance + cheatCalories;
  const overMaintenance = newBalance > 0 ? newBalance : 0;
  const overGoal = newBalance - goalDeficit; // How far from goal deficit
  
  // Activity estimates
  const activities = {
    walk: { emoji: "🚶", calPerMin: 4 },
    briskWalk: { emoji: "🚶‍♂️", calPerMin: 5.5 },
    jog: { emoji: "🏃", calPerMin: 9 },
    run: { emoji: "🏃‍♂️", calPerMin: 12 },
    hiit: { emoji: "💪", calPerMin: 14 },
  };

  const suggestActivity = (cals: number): string => {
    const suggestions: string[] = [];
    const walkMins = Math.ceil(cals / activities.walk.calPerMin);
    const jogMins = Math.ceil(cals / activities.jog.calPerMin);
    const runMins = Math.ceil(cals / activities.run.calPerMin);
    const hiitMins = Math.ceil(cals / activities.hiit.calPerMin);
    
    if (walkMins <= 90) suggestions.push(`${activities.walk.emoji} ${walkMins} min walk`);
    if (jogMins <= 45 && jogMins >= 15) suggestions.push(`${activities.jog.emoji} ${jogMins} min jog`);
    if (runMins <= 35 && runMins >= 15) suggestions.push(`${activities.run.emoji} ${runMins} min run`);
    if (hiitMins <= 30 && hiitMins >= 10) suggestions.push(`${activities.hiit.emoji} ${hiitMins} min HIIT`);
    
    return suggestions.slice(0, 3).join(" • ");
  };

  let message = `🍔 **Cheat Meal Calculator: ${cheatDescription}**\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 This meal: **${cheatCalories} cal**`;
  if (cheatProtein > 0) message += ` • ${cheatProtein}g protein`;
  message += `\n\n`;

  // Current status
  message += `📍 **Your current balance:** ${currentBalance >= 0 ? '+' : ''}${currentBalance} cal\n`;
  message += `📍 **After this meal:** ${newBalance >= 0 ? '+' : ''}${newBalance} cal\n\n`;

  if (newBalance > 0) {
    // They'll be in surplus
    message += `⚠️ **Result:** You'll be **${newBalance} cal over maintenance**\n\n`;
    message += `**To get back to maintenance (break-even):**\n${suggestActivity(newBalance)}\n\n`;
    
    if (overGoal > 0) {
      message += `**To still hit your ${Math.abs(goalDeficit)} cal deficit goal:**\n${suggestActivity(overGoal)}\n\n`;
    }
  } else if (newBalance > goalDeficit) {
    // They'll still be in deficit but miss their goal
    message += `✅ **Result:** Still in deficit (${Math.abs(newBalance)} cal)\n`;
    message += `⚠️ But you'll miss your ${Math.abs(goalDeficit)} goal by ${overGoal} cal\n\n`;
    message += `**To still hit your goal:**\n${suggestActivity(overGoal)}\n\n`;
  } else {
    // They can have it and still hit goal!
    message += `✅ **Great news!** You can have this and still hit your ${Math.abs(goalDeficit)} cal deficit goal! 🎉\n\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Want to log it? Just say "yes" or "log it"!`;

  return message;
}

// ============================================================================
// ACTIVITY SUGGESTION GENERATOR
// ============================================================================

function generateActivitySuggestions(caloriesToBurn: number): string {
  // Activity calories burned estimates (per minute, average adult)
  const activities = [
    { name: "Walking", emoji: "🚶", calPerMin: 4 },
    { name: "Brisk walk", emoji: "🚶‍♂️", calPerMin: 5.5 },
    { name: "Jogging", emoji: "🏃", calPerMin: 9 },
    { name: "Running", emoji: "🏃‍♂️", calPerMin: 12 },
    { name: "Cycling", emoji: "🚴", calPerMin: 8 },
    { name: "Swimming", emoji: "🏊", calPerMin: 10 },
    { name: "HIIT", emoji: "💪", calPerMin: 14 },
  ];

  let message = `🔥 **Burn ${caloriesToBurn} cal:**\n\n`;

  // Generate suggestions for each activity
  const suggestions: string[] = [];
  
  for (const activity of activities) {
    const minutes = Math.ceil(caloriesToBurn / activity.calPerMin);
    
    // Only show reasonable durations (up to 2 hours)
    if (minutes <= 120) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const timeStr = hours > 0 
        ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
        : `${minutes}m`;
      
      suggestions.push(`${activity.emoji} ${activity.name}: **${timeStr}**`);
    }
  }

  message += suggestions.slice(0, 6).join("\n");

  // Add helpful tip based on calorie amount
  message += "\n\n";
  
  if (caloriesToBurn <= 150) {
    message += "💡 A short walk would do it!";
  } else if (caloriesToBurn <= 300) {
    message += "💡 A 30-45 min walk works. Split it up if needed!";
  } else if (caloriesToBurn <= 500) {
    message += "💡 Mix activities to keep it fun!";
  } else {
    message += "💡 Spread it out or combine with eating less.";
  }

  return message;
}

// ============================================================================
// AI DIARY COMPONENT
// ============================================================================

// Saved Meal type for @ mentions
interface SavedMealLocal {
  id: string;
  name: string;
  display_name: string;
  description: string;
  summary: string;
  total_calories: number;
  total_protein: number;
}

// Helper to render markdown-style text (**bold** and _italic_)
function renderMarkdown(text: string): React.ReactNode {
  // Split by bold (**text**) and italic (_text_) patterns
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <span key={index} className="text-muted-foreground text-[11px]">{part.slice(1, -1)}</span>;
    }
    return part;
  });
}

function AIDiary({ onEntryConfirmed, todayHasWeight, dataLoaded }: { onEntryConfirmed: () => void; todayHasWeight: boolean; dataLoaded: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [upgradeReminderShown, setUpgradeReminderShown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();
  const { trialInfo } = useDashboard();
  
  // Saved meals state
  const [savedMeals, setSavedMeals] = useState<SavedMealLocal[]>([]);
  const [showMealDropdown, setShowMealDropdown] = useState(false);
  const [mealFilter, setMealFilter] = useState("");
  const [selectedMealIndex, setSelectedMealIndex] = useState(0);
  const [pendingSaveMeal, setPendingSaveMeal] = useState<{ items: Array<{ description: string; calories: number; protein: number; emoji: string }>; totalCal: number; totalProtein: number } | null>(null);
  const usedSavedMealRef = useRef(false); // Track if current input came from @ mention
  
  // Use a REF to track if weight reminder has been checked - refs persist and don't cause re-renders
  const weightReminderCheckedRef = useRef(false);
  
  // Use LOCAL date, not UTC!
  const today = getLocalDateString();

  useEffect(() => {
    loadChatHistoryAndCheckWeight();
    loadSavedMeals();
  }, []);

  // Load saved meals for @ mentions
  const loadSavedMeals = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("saved_meals")
      .select("id, name, display_name, description, summary, total_calories, total_protein")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setSavedMeals(data);
    }
  };

  // Filter meals based on current input after @
  const filteredMeals = savedMeals.filter(meal => 
    meal.name.toLowerCase().includes(mealFilter.toLowerCase()) ||
    meal.display_name.toLowerCase().includes(mealFilter.toLowerCase())
  );

  // Handle input change for @ detection
  const handleInputChange = (value: string) => {
    setInput(value);
    
    // Check for @ mention
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1) {
      const afterAt = value.slice(atIndex + 1);
      // Only show dropdown if @ is at start of word or string
      const beforeAt = value.slice(0, atIndex);
      const isValidTrigger = beforeAt === "" || beforeAt.endsWith(" ") || beforeAt.endsWith("\n");
      
      if (isValidTrigger && !afterAt.includes(" ")) {
        setShowMealDropdown(true);
        setMealFilter(afterAt);
        setSelectedMealIndex(0);
      } else {
        setShowMealDropdown(false);
      }
    } else {
      setShowMealDropdown(false);
    }
  };

  // Insert selected meal into input
  const insertMeal = (meal: SavedMealLocal) => {
    const atIndex = input.lastIndexOf("@");
    const beforeAt = input.slice(0, atIndex);
    setInput(beforeAt + meal.description);
    setShowMealDropdown(false);
    setMealFilter("");
    usedSavedMealRef.current = true; // Mark that this came from a saved meal
    inputRef.current?.focus();
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMealDropdown && filteredMeals.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMealIndex(prev => Math.min(prev + 1, filteredMeals.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMealIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertMeal(filteredMeals[selectedMealIndex]);
      } else if (e.key === "Escape") {
        setShowMealDropdown(false);
      }
    }
  };

  // Create a saved meal OR exercise from /create command
  const handleCreateCommand = async (input: string) => {
    const match = input.match(/^\/create\s+([a-z0-9_-]+)\s+(.+)$/i);
    if (!match) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "❌ Invalid format.\n\n**For meals:**\n`/create meal-name ingredients`\n\n**For exercises:**\n`/create exercise_name 30 min running burned 300 cal`",
        timestamp: new Date().toISOString(),
      }]);
      return true;
    }

    const [, presetName, description] = match;
    const normalizedName = presetName.toLowerCase();
    const lowerDesc = description.toLowerCase();

    // Detect if this is an exercise (contains burn/burned/calories burned/workout/exercise keywords)
    const isExercise = /\b(burn|burned|burning|workout|exercise|run|walk|jog|swim|cycle|hiit|cardio|treadmill|incline)\b/i.test(lowerDesc) &&
                       /\b(\d+)\s*(cal|kcal|calories)\b/i.test(lowerDesc);

    setLoading(true);
    
    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: description }),
      });
      const data = await response.json();

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return true;
      }

      if (isExercise || data.type === "exercise") {
        // Handle as exercise
        if (!data.items || data.items.length === 0) {
          // Try to extract calories manually from description
          const calMatch = description.match(/(\d+)\s*(cal|kcal|calories)/i);
          const calories = calMatch ? parseInt(calMatch[1]) : 0;
          
          if (calories === 0) {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: "assistant",
              content: "❌ Couldn't detect calories burned. Include like: `burned 300 cal`",
              timestamp: new Date().toISOString(),
            }]);
            setLoading(false);
            return true;
          }

          // Create exercise item manually
          data.items = [{ description: description, calories: calories, emoji: "🏃" }];
          data.total_calories = calories;
        }

        const summary = data.items[0]?.description || description;
        
        const { error } = await supabase.from("saved_meals").upsert({
          user_id: user.id,
          name: normalizedName,
          display_name: presetName.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          description: description,
          summary: summary.length > 50 ? summary.substring(0, 47) + "..." : summary,
          total_calories: -(data.total_calories), // Negative = exercise (burns calories)
          total_protein: 0,
          items: data.items,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,name",
        });

        if (error) {
          console.error("Error saving exercise:", error);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: "❌ Error saving exercise. Please try again.",
            timestamp: new Date().toISOString(),
          }]);
        } else {
          loadSavedMeals();
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `✅ Saved exercise **"${presetName}"**!\n\n🏃 Burns ${data.total_calories} cal\n\nType **@${normalizedName}** anytime to log this workout!`,
            timestamp: new Date().toISOString(),
          }]);
          showToast(`Saved exercise: ${presetName}`, "exercise");
        }
      } else {
        // Handle as food/meal
        if (data.type !== "food" || !data.items || data.items.length === 0) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: "❌ Couldn't parse that. For meals, describe ingredients. For exercises, include `burned X cal`.",
            timestamp: new Date().toISOString(),
          }]);
          setLoading(false);
          return true;
        }

        // Generate a short summary (first 3 items + "...")
        const itemNames = data.items.slice(0, 3).map((i: { description: string }) => i.description);
        const summary = itemNames.join(", ") + (data.items.length > 3 ? "..." : "");

        const { error } = await supabase.from("saved_meals").upsert({
          user_id: user.id,
          name: normalizedName,
          display_name: presetName.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          description: description,
          summary: summary,
          total_calories: data.total_calories,
          total_protein: data.total_protein,
          items: data.items,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,name",
        });

        if (error) {
          console.error("Error saving meal:", error);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: "❌ Error saving meal. Please try again.",
            timestamp: new Date().toISOString(),
          }]);
        } else {
          // Refresh saved meals list
          loadSavedMeals();
          
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `✅ Saved **"${presetName}"**!\n\n📊 ${data.total_calories} cal • ${data.total_protein}g protein\n📝 ${summary}\n\nType **@${normalizedName}** anytime to log this meal!`,
            timestamp: new Date().toISOString(),
          }]);
          showToast(`Saved meal: ${presetName}`, "food");
        }
      }
    } catch (error) {
      console.error("Error creating preset:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "❌ Error saving. Please try again.",
        timestamp: new Date().toISOString(),
      }]);
    }

    setLoading(false);
    return true;
  };

  // Save logged items as a meal (called after user provides name)
  const savePendingMeal = async (mealName: string) => {
    if (!pendingSaveMeal) return;

    const normalizedName = mealName.toLowerCase().replace(/\s+/g, "-");
    const itemNames = pendingSaveMeal.items.slice(0, 3).map(i => i.description);
    const summary = itemNames.join(", ") + (pendingSaveMeal.items.length > 3 ? "..." : "");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("saved_meals").upsert({
      user_id: user.id,
      name: normalizedName,
      display_name: mealName.replace(/\b\w/g, c => c.toUpperCase()),
      description: pendingSaveMeal.items.map(i => i.description).join(", "),
      summary: summary,
      total_calories: pendingSaveMeal.totalCal,
      total_protein: pendingSaveMeal.totalProtein,
      items: pendingSaveMeal.items,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,name",
    });

    if (!error) {
      loadSavedMeals();
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `✅ Saved as **"${mealName}"**! Type **@${normalizedName}** to use it.`,
        timestamp: new Date().toISOString(),
      }]);
      showToast(`Saved: ${mealName}`, "food");
    }
    setPendingSaveMeal(null);
  };
  
  // Check for trial upgrade reminder (2 days or less before expiry)
  useEffect(() => {
    if (!upgradeReminderShown && trialInfo.isTrialing && !trialInfo.isPaid && trialInfo.daysLeft <= 2) {
      setUpgradeReminderShown(true);
      
      const urgency = trialInfo.daysLeft === 0 
        ? "⚠️ Your free trial ends TODAY!" 
        : trialInfo.daysLeft === 1 
          ? "⏰ Only 1 day left in your trial!" 
          : `📅 ${trialInfo.daysLeft} days left in your trial!`;
      
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: "upgrade-reminder-" + Date.now(),
            role: "assistant",
            content: `${urgency}\n\nUpgrade now to:\n• 🔓 Unlock the full calendar\n• 📊 Keep all your tracking data\n• 🎯 Continue your weight loss journey\n\nTap the Upgrade button in the header to subscribe!`,
            timestamp: new Date().toISOString(),
          }
        ]);
      }, 2500);
    }
    
    // Show expired message if trial has ended
    if (!upgradeReminderShown && trialInfo.isExpired && !trialInfo.isPaid) {
      setUpgradeReminderShown(true);
      
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            id: "trial-expired-" + Date.now(),
            role: "assistant",
            content: `🔒 Your free trial has ended.\n\nTo continue tracking your calories and weight loss progress, please upgrade to a paid subscription.\n\nYour data is safe - upgrade now to pick up where you left off!`,
            timestamp: new Date().toISOString(),
          }
        ]);
      }, 1000);
    }
  }, [trialInfo.isTrialing, trialInfo.isExpired, trialInfo.isPaid, trialInfo.daysLeft, upgradeReminderShown]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Combined function: Load chat history, THEN check if weight reminder is needed
  // This ensures no race conditions - everything happens in sequence
  const loadChatHistoryAndCheckWeight = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // STEP 1: Get today's date string (for queries)
    const todayDateStr = getLocalDateString();
    
    // STEP 2: Load chat messages
    const { data: chatMessages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", todayDateStr)
      .order("created_at", { ascending: true });

    // STEP 3: Set messages
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

    // STEP 4: Check weight reminder (only once, using ref)
    if (weightReminderCheckedRef.current) {
      return; // Already checked, don't check again
    }
    weightReminderCheckedRef.current = true;

    // STEP 5: Only check if it's past 9am local time
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 9) {
      return; // Too early, don't show reminder
    }

    // STEP 6: Query database for today's weight
    const { data: todayLog } = await supabase
      .from("daily_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .eq("log_date", todayDateStr)
      .maybeSingle();

    // STEP 7: Also get user's profile to check signup date and starting weight
    const { data: profile } = await supabase
      .from("profiles")
      .select("created_at, starting_weight_kg")
      .eq("id", user.id)
      .single();

    // Check if today is the signup day
    const signupDate = profile?.created_at ? getLocalDateString(new Date(profile.created_at)) : null;
    const isSignupDay = signupDate === todayDateStr;
    const hasStartingWeight = profile?.starting_weight_kg != null;

    // Weight exists if:
    // 1. There's a weight_kg in today's daily_log, OR
    // 2. Today is the signup day AND profile has starting_weight_kg
    const hasWeightInLog = todayLog?.weight_kg != null;
    const hasWeight = hasWeightInLog || (isSignupDay && hasStartingWeight);
    
    // Debug logging
    console.log("[Weight Reminder Check]", {
      todayDateStr,
      signupDate,
      isSignupDay,
      hasWeightInLog,
      hasStartingWeight,
      hasWeight,
    });

    if (hasWeight) {
      const weightSource = hasWeightInLog ? `logged: ${todayLog.weight_kg}kg` : `starting weight: ${profile?.starting_weight_kg}kg`;
      console.log("[Weight Reminder] Weight exists (" + weightSource + ") - NOT showing reminder");
      return; // Weight exists, don't show reminder
    }

    // STEP 8: No weight for today - show reminder after delay
    console.log("[Weight Reminder] No weight for today - showing reminder");
    
    const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
    
    // Small delay so it appears after the welcome message
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    
    // Block logging if trial is expired
    if (trialInfo.isExpired && !trialInfo.isPaid) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "user",
          content: input,
          timestamp: new Date().toISOString(),
        },
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "🔒 Your free trial has ended. Please upgrade to continue logging your food and exercise!",
          timestamp: new Date().toISOString(),
        }
      ]);
      setInput("");
      return;
    }

    const trimmedInput = input.trim();
    
    // Check for /create command
    if (trimmedInput.startsWith("/create ")) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: trimmedInput,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput("");
      await handleCreateCommand(trimmedInput);
      return;
    }

    // Check if user is responding to save meal prompt
    if (pendingSaveMeal && !trimmedInput.includes(" ") && trimmedInput.length > 0) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: trimmedInput,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput("");
      await savePendingMeal(trimmedInput);
      return;
    }

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedInput,
      timestamp: now,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    // Get user ID for personalized food memory
    const supabaseForUser = createClient();
    const { data: { user: currentUser } } = await supabaseForUser.auth.getUser();
    const userId = currentUser?.id;

    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, user_id: userId }),
      });

      const data: AIParseResponse = await response.json();

      // Check if this is an edit request AND there's an unconfirmed food/exercise log
      const pendingLog = messages.find(
        m => m.parsedData && 
        !m.confirmed && 
        (m.parsedData.type === "food" || m.parsedData.type === "exercise" || m.parsedData.type === "activity_suggestion") &&
        m.parsedData.items.length > 0
      );

      if ((data.type === "edit" || data.type === "multi_edit") && pendingLog) {
        // UPDATE THE PENDING LOG IN PLACE instead of creating an edit operation
        const editsToApply = data.type === "multi_edit" && data.edits 
          ? data.edits 
          : [{ search_term: data.search_term!, updates: data.updates! }];
        
        // Helper to extract quantity from description (e.g., "3 rice cakes" → 3)
        const extractQuantity = (description: string): number => {
          const match = description.match(/^(\d+)\s+/);
          return match ? parseInt(match[1], 10) : 1;
        };
        
        // Check if user said "each" - meaning per-unit values
        const isPerUnit = /\beach\b|\bper\b|\bone\b|\bsingle\b/i.test(input);
        
        // Create updated items
        const updatedItems = [...(pendingLog.parsedData!.items as Array<{ description: string; calories: number; protein: number; emoji: string }>)];
        const updatedItemNames: string[] = [];
        
        for (const edit of editsToApply) {
          const searchTerm = edit.search_term?.toLowerCase() || "";
          
          // Find matching items in the pending log
          let foundMatch = false;
          for (let i = 0; i < updatedItems.length; i++) {
            if (searchTerm && updatedItems[i].description.toLowerCase().includes(searchTerm)) {
              const quantity = extractQuantity(updatedItems[i].description);
              const multiplier = isPerUnit ? quantity : 1;
              
              if (edit.updates?.calories !== undefined) {
                updatedItems[i] = { ...updatedItems[i], calories: edit.updates.calories * multiplier };
              }
              if (edit.updates?.protein !== undefined) {
                updatedItems[i] = { ...updatedItems[i], protein: edit.updates.protein * multiplier };
              }
              updatedItemNames.push(updatedItems[i].description);
              foundMatch = true;
            }
          }
          
          // If no match found but there's only 1 item, assume user means that item
          // (e.g., "no it was 650 calories" when there's one exercise pending)
          if (!foundMatch && updatedItems.length === 1 && edit.updates?.calories !== undefined) {
            const quantity = extractQuantity(updatedItems[0].description);
            const multiplier = isPerUnit ? quantity : 1;
            
            if (edit.updates?.calories !== undefined) {
              updatedItems[0] = { ...updatedItems[0], calories: edit.updates.calories * multiplier };
            }
            if (edit.updates?.protein !== undefined) {
              updatedItems[0] = { ...updatedItems[0], protein: edit.updates.protein * multiplier };
            }
            updatedItemNames.push(updatedItems[0].description);
          }
        }
        
        if (updatedItemNames.length > 0) {
          // Recalculate totals
          const newTotalCalories = updatedItems.reduce((sum, item) => sum + item.calories, 0);
          const newTotalProtein = updatedItems.reduce((sum, item) => sum + item.protein, 0);
          
          // Update the pending message with new values
          setMessages(prev => prev.map(m => 
            m.id === pendingLog.id 
              ? {
                  ...m,
                  parsedData: {
                    ...m.parsedData!,
                    items: updatedItems,
                    total_calories: newTotalCalories,
                    total_protein: newTotalProtein,
                  }
                }
              : m
          ));
          
          // Add a confirmation message
          const confirmMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `✅ Updated ${updatedItemNames.join(", ")} in the preview above. Click "Log this" when you're ready!`,
            confirmed: true,
            timestamp: new Date().toISOString(),
          };
          setMessages(prev => [...prev, confirmMessage]);
          
          // Save messages to database
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("chat_messages").insert([
              { user_id: user.id, role: "user", content: input, log_date: today },
              { user_id: user.id, role: "assistant", content: confirmMessage.content, log_date: today },
            ]);
            
            // Save corrections to user's food memory for future reference
            for (const edit of editsToApply) {
              const perUnitCalories = edit.updates?.calories;
              const perUnitProtein = edit.updates?.protein;
              
              if (perUnitCalories !== undefined || perUnitProtein !== undefined) {
                const foodName = edit.search_term.toLowerCase().trim();
                
                // Upsert to user_food_memory (update if exists, insert if new)
                const { error: memoryError } = await supabase
                  .from("user_food_memory")
                  .upsert({
                    user_id: user.id,
                    food_name: foodName,
                    display_name: edit.search_term,
                    calories: perUnitCalories ?? 0,
                    protein_grams: perUnitProtein ?? 0,
                    updated_at: new Date().toISOString(),
                  }, {
                    onConflict: "user_id,food_name",
                  });
                
                if (memoryError) {
                  console.error("[Food Memory] Error saving:", memoryError.message);
                } else {
                  console.log("[Food Memory] ✅ Saved:", foodName, perUnitCalories, "cal,", perUnitProtein, "g protein");
                }
              }
            }
          }
          
          setLoading(false);
          return; // Don't create a new edit operation
        }
      }

      // Handle special types that need context
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      let finalMessage = data.message;
      let finalParsedData = data;

      // MEAL RECOMMENDATION: Fetch user's current state and generate meal ideas
      if (data.type === "meal_recommendation" && user) {
        const { data: todayLog } = await supabase
          .from("daily_logs")
          .select("caloric_intake, protein_grams")
          .eq("user_id", user.id)
          .eq("log_date", today)
          .single();

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("tdee, daily_calorie_goal, protein_goal")
          .eq("id", user.id)
          .single();

        if (userProfile) {
          const tdee = userProfile.tdee || 2000;
          const goalDeficit = userProfile.daily_calorie_goal || 500;
          const targetCalories = tdee - goalDeficit;
          const caloriesConsumed = todayLog?.caloric_intake || 0;
          const caloriesLeft = Math.max(0, targetCalories - caloriesConsumed);
          const proteinGoal = userProfile.protein_goal || 120;
          const proteinConsumed = todayLog?.protein_grams || 0;

          // Determine meal type based on time
          const hour = new Date().getHours();
          const mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 
            hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 18 ? 'snack' : 'dinner';

          finalMessage = generateMealRecommendation({
            caloriesLeft,
            proteinGoal,
            proteinConsumed,
            mealType,
          });
        }
        // Mark as confirmed since it's just information
        finalParsedData = { ...data, type: "chat" as const };
      }

      // CHEAT CALCULATION: Fetch user's current state and calculate impact
      if (data.type === "cheat_calculation" && user && data.items.length > 0) {
        const { data: todayLog } = await supabase
          .from("daily_logs")
          .select("caloric_intake, caloric_outtake")
          .eq("user_id", user.id)
          .eq("log_date", today)
          .single();

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("tdee, daily_calorie_goal")
          .eq("id", user.id)
          .single();

        if (userProfile) {
          const tdee = userProfile.tdee || 2000;
          const goalDeficit = -(userProfile.daily_calorie_goal || 500);
          const intake = todayLog?.caloric_intake || 0;
          const outtake = todayLog?.caloric_outtake || 0;
          const currentBalance = intake - (tdee + outtake);

          const cheatItem = data.items[0];
          finalMessage = generateCheatMealImpact({
            cheatCalories: data.total_calories,
            cheatProtein: data.total_protein,
            cheatDescription: cheatItem.description,
            currentBalance,
            goalDeficit,
            tdee,
          });
        }
        // Keep the parsed data so user can choose to log it
      }

      // ACTIVITY SUGGESTION: Generate exercise recommendations to burn X calories
      if (data.type === "activity_suggestion" && data.total_calories > 0) {
        finalMessage = generateActivitySuggestions(data.total_calories);
        // Mark as chat since it's just information
        finalParsedData = { ...data, type: "chat" as const };
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: finalMessage,
        parsedData: finalParsedData,
        confirmed: data.type === "meal_recommendation", // Auto-confirm info messages
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save to database
      if (user) {
        await supabase.from("chat_messages").insert([
          { user_id: user.id, role: "user", content: input, log_date: today },
          { user_id: user.id, role: "assistant", content: finalMessage, log_date: today },
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
      if ((parsedData.type === "edit" && parsedData.search_term) || 
          (parsedData.type === "multi_edit" && parsedData.edits && parsedData.edits.length > 0)) {
        // EDIT OPERATION: Find and update matching entries
        
        // Handle both single edit and multi_edit
        const editsToProcess = parsedData.type === "multi_edit" && parsedData.edits
          ? parsedData.edits
          : [{ search_term: parsedData.search_term!, updates: parsedData.updates! }];
        
        let totalUpdated = 0;
        const updatedItems: string[] = [];
        
        for (const edit of editsToProcess) {
          const searchTerm = edit.search_term.toLowerCase();
          
          // Find entries matching the search term
          const { data: matchingEntries, error: searchError } = await supabase
            .from("log_entries")
            .select("*")
            .eq("daily_log_id", log.id)
            .ilike("description", `%${searchTerm}%`);

          if (!searchError && matchingEntries && matchingEntries.length > 0) {
            // Update all matching entries
            const updates: Record<string, number> = {};
            if (edit.updates?.calories !== undefined) {
              updates.calories = edit.updates.calories;
            }
            if (edit.updates?.protein !== undefined) {
              updates.protein_grams = edit.updates.protein;
            }

            const entryIds = matchingEntries.map(e => e.id);
            const { error: updateError } = await supabase
              .from("log_entries")
              .update(updates)
              .in("id", entryIds);

            if (!updateError) {
              totalUpdated += matchingEntries.length;
              updatedItems.push(edit.search_term);
              
              // Log notification for each edit
              logNotification(createEditNotification(
                edit.search_term,
                { calories: edit.updates?.calories, protein: edit.updates?.protein },
                matchingEntries.length
              ));
              
              // Save to user's food memory for future use
              if (edit.updates?.calories !== undefined || edit.updates?.protein !== undefined) {
                const foodName = edit.search_term.toLowerCase().trim();
                const { error: memError } = await supabase
                  .from("user_food_memory")
                  .upsert({
                    user_id: user.id,
                    food_name: foodName,
                    display_name: edit.search_term,
                    calories: edit.updates?.calories ?? 0,
                    protein_grams: edit.updates?.protein ?? 0,
                    updated_at: new Date().toISOString(),
                  }, {
                    onConflict: "user_id,food_name",
                  });
                
                if (memError) {
                  console.error("[Food Memory] Error:", memError.message);
                } else {
                  console.log("[Food Memory] ✅ Remembered:", foodName);
                }
              }
            }
          }
        }
        
        // Recalculate totals after all edits
        await recalculateDailyTotals(supabase, log.id);
        
        if (totalUpdated > 0) {
          confirmationContent = `✅ Updated ${updatedItems.join(" and ")}! (Remembered for next time 🧠)`;
          showToast(`Updated ${updatedItems.join(", ")}`, "edit");
        } else {
          confirmationContent = `❌ Couldn't find any matching entries in today's log.`;
        }
        
      } else if (parsedData.type === "edit" && parsedData.search_term) {
        // Legacy single edit handling (fallback)
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
            
            // Save to user's food memory for future use
            if (parsedData.updates?.calories !== undefined || parsedData.updates?.protein !== undefined) {
              const foodName = parsedData.search_term.toLowerCase().trim();
              await supabase
                .from("user_food_memory")
                .upsert({
                  user_id: user.id,
                  food_name: foodName,
                  display_name: parsedData.search_term,
                  calories: parsedData.updates?.calories ?? 0,
                  protein_grams: parsedData.updates?.protein ?? 0,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: "user_id,food_name",
                });
            }
            
            const updatedCount = matchingEntries.length;
            const updateParts = [];
            if (parsedData.updates?.calories !== undefined) {
              updateParts.push(`${parsedData.updates.calories} cal`);
            }
            if (parsedData.updates?.protein !== undefined) {
              updateParts.push(`${parsedData.updates.protein}g protein`);
            }
            confirmationContent = `✅ Updated ${updatedCount} "${parsedData.search_term}" ${updatedCount === 1 ? "entry" : "entries"} to ${updateParts.join(" and ")}! (Remembered for next time 🧠)`;
            
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
        // NEW ENTRY OPERATION (food, exercise, or cheat meal)
        // Cheat calculations are logged as food, activity_suggestion should be logged as exercise
        const entryType = parsedData.type === "cheat_calculation" ? "food" : 
                          parsedData.type === "activity_suggestion" ? "exercise" :
                          parsedData.type as "food" | "exercise";
        const entries = parsedData.items.map((item) => ({
          daily_log_id: log.id,
          entry_type: entryType,
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
        
        // Set confirmation message based on entry type
        if (entryType === "exercise") {
          confirmationContent = "✅ Logged! Let me know when you exercise next to keep track.";
        } else {
          confirmationContent = "✅ Logged! Let me know what you eat next to keep track.";
        }
        
        // Show toast and log notification
        const itemsForNotification = parsedData.items.map(item => ({
          description: item.description,
          calories: item.calories,
          protein: "protein" in item ? item.protein : 0,
        }));
        
        if (parsedData.type === "food" || parsedData.type === "cheat_calculation") {
          const itemNames = parsedData.items.map(i => i.description).join(", ");
          const toastMsg = parsedData.type === "cheat_calculation" ? `Cheat meal logged: ${itemNames}` : `Logged: ${itemNames}`;
          showToast(toastMsg, "food");
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

      // COACHING MESSAGE: After food is logged, check if user needs activity suggestions
      if (parsedData.type === "food") {
        // Fetch updated daily totals and user profile for coaching
        const { data: updatedLog } = await supabase
          .from("daily_logs")
          .select("caloric_intake, caloric_outtake, weight_kg")
          .eq("user_id", user.id)
          .eq("log_date", localToday)
          .single();

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (updatedLog && userProfile) {
          // Calculate TDEE properly from profile
          const currentWeight = updatedLog.weight_kg || userProfile.current_weight_kg || userProfile.starting_weight_kg;
          const age = calculateAge(new Date(userProfile.date_of_birth));
          const bmr = calculateBMR(currentWeight, userProfile.height_cm, age, userProfile.gender);
          const tdee = calculateTDEE(bmr, userProfile.activity_level);
          
          // Calculate goal deficit from user's goal weight and target date
          const goalAnalysis = calculateRequiredDailyDeficit(
            currentWeight,
            userProfile.goal_weight_kg,
            new Date(userProfile.goal_date)
          );
          const goalDeficit = -goalAnalysis.dailyDeficit; // Negative (e.g., -868)
          
          const intake = updatedLog.caloric_intake || 0;
          const outtake = updatedLog.caloric_outtake || 0;
          
          // Balance = Intake - (TDEE + Exercise burned)
          // Negative = deficit (good), Positive = surplus (bad)
          const currentBalance = intake - (tdee + outtake);
          const currentHour = new Date().getHours();

          const coachingMessage = generateCoachingMessage({
            currentBalance,
            goalDeficit,
            tdee,
            currentHour,
          });

          if (coachingMessage) {
            // Add a slight delay for better UX
            setTimeout(async () => {
              // Save coaching message to database
              await supabase.from("chat_messages").insert({
                user_id: user.id,
                role: "assistant",
                content: coachingMessage,
                log_date: localToday,
              });

              // Add coaching message to local state
              setMessages((prev) => [
                ...prev,
                {
                  id: (Date.now() + 100).toString(),
                  role: "assistant",
                  content: coachingMessage,
                  confirmed: true,
                  timestamp: new Date().toISOString(),
                },
              ]);
            }, 1500); // 1.5 second delay
          }
        }

        // SAVE MEAL SUGGESTION: After logging food with 2+ items, offer to save as a quick meal
        // BUT only if this wasn't already from a saved meal (@ mention)
        const foodItems = parsedData.items as Array<{ description: string; calories: number; protein: number; emoji?: string }>;
        if (foodItems.length >= 2 && !usedSavedMealRef.current) {
          const totalCal = foodItems.reduce((sum, i) => sum + i.calories, 0);
          const totalProtein = foodItems.reduce((sum, i) => sum + i.protein, 0);
          
          setTimeout(() => {
            setPendingSaveMeal({
              items: foodItems.map(i => ({
                description: i.description,
                calories: i.calories,
                protein: i.protein,
                emoji: i.emoji || "🍽️",
              })),
              totalCal,
              totalProtein,
            });
            
            setMessages((prev) => [
              ...prev,
              {
                id: "save-meal-prompt-" + Date.now(),
                role: "assistant",
                content: `💾 **Save as a quick meal?**\n\nReply with a name (e.g., "breakfast" or "post-workout") to save this combo.\nThen type **@name** anytime to log it instantly!\n\n*Or just ignore this to continue.*`,
                confirmed: true,
                timestamp: new Date().toISOString(),
              },
            ]);
          }, 2500); // After coaching message
        }
        
        // Reset the saved meal flag after logging
        usedSavedMealRef.current = false;
      }

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

  // Clear chat - clears UI messages AND database chat history for today
  const clearChat = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Delete today's chat messages from database
      await supabase
        .from("chat_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("log_date", today);
    }
    
    setMessages([]);
    setPendingSaveMeal(null);
    showToast("Chat cleared", "food");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-container bg-primary/10">
              <span className="text-lg">💬</span>
            </div>
            <div>
              <h2 className="font-display font-semibold text-foreground">AI Diary</h2>
              <p className="text-xs text-muted-foreground">Log food & exercise naturally</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary"
              title="Clear chat"
            >
              Clear
            </button>
          )}
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
                  <p className="whitespace-pre-wrap leading-relaxed">{renderMarkdown(message.content)}</p>

                  {/* Only show parsed data UI if it's NOT an error and NOT a chat message */}
                  {message.parsedData && !message.confirmed && !message.parsedData.is_error && message.parsedData.type !== "chat" && (
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

                      {/* For MULTI_EDIT operations */}
                      {message.parsedData.type === "multi_edit" && message.parsedData.edits && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-lg">📝</span>
                            <span>Update multiple entries</span>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 space-y-2 text-xs">
                            {message.parsedData.edits.map((edit, idx) => (
                              <div key={idx} className="space-y-1">
                                <div className="font-medium text-primary">"{edit.search_term}":</div>
                                <div className="pl-2 space-y-0.5">
                                  {edit.updates?.calories !== undefined && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Calories:</span>
                                      <span>{edit.updates.calories} cal</span>
                                    </div>
                                  )}
                                  {edit.updates?.protein !== undefined && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Protein:</span>
                                      <span>{edit.updates.protein}g</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
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

                      {/* For NEW ENTRIES (food/exercise/cheat/activity_suggestion) */}
                      {(message.parsedData.type === "food" || message.parsedData.type === "exercise" || message.parsedData.type === "cheat_calculation" || message.parsedData.type === "activity_suggestion") && message.parsedData.items.length > 0 && (
                        <div className="space-y-1.5">
                          {message.parsedData.type === "cheat_calculation" && (
                            <div className="text-xs text-gold mb-2">🍔 Cheat meal - log it if you decide to have it:</div>
                          )}
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
                              : message.parsedData.type === "edit" || message.parsedData.type === "multi_edit"
                              ? "bg-gold hover:bg-gold/90 text-black"
                              : message.parsedData.type === "weight"
                              ? "bg-blue-500 hover:bg-blue-500/90 text-white"
                              : message.parsedData.type === "cheat_calculation"
                              ? "bg-orange-500 hover:bg-orange-500/90 text-white"
                              : "bg-success hover:bg-success/90 text-white"
                          }`}
                        >
                          {confirmingId === message.id 
                            ? (message.parsedData.type === "edit" || message.parsedData.type === "multi_edit" ? "Updating..." : message.parsedData.type === "delete" ? "Deleting..." : message.parsedData.type === "weight" ? "Saving..." : "Logging...")
                            : message.parsedData.type === "edit" || message.parsedData.type === "multi_edit"
                            ? "✓ Update" 
                            : message.parsedData.type === "delete" 
                            ? "✓ Delete" 
                            : message.parsedData.type === "weight"
                            ? "✓ Log Weight"
                            : message.parsedData.type === "cheat_calculation"
                            ? "🍔 Log Cheat Meal"
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
        {/* Trial expired banner */}
        {trialInfo.isExpired && !trialInfo.isPaid && (
          <Link href="/dashboard/subscribe" className="block mb-3">
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-center hover:bg-danger/20 transition-colors">
              <p className="text-sm font-medium text-danger">🔒 Trial expired - Upgrade to continue logging</p>
            </div>
          </Link>
        )}
        
        {/* @ Mention Dropdown */}
        {showMealDropdown && (
          <div className="mb-2 bg-secondary rounded-lg border border-border shadow-lg max-h-48 overflow-y-auto">
            {filteredMeals.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                {savedMeals.length === 0 ? (
                  <span>No saved meals yet. Use <code className="bg-background px-1 rounded">/create name description</code> to save one!</span>
                ) : (
                  <span>No meals match "{mealFilter}"</span>
                )}
              </div>
            ) : (
              filteredMeals.map((meal, index) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => insertMeal(meal)}
                  className={`w-full text-left p-3 hover:bg-background/50 transition-colors border-b border-border last:border-0 ${
                    index === selectedMealIndex ? "bg-background/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-primary">
                        {meal.total_calories < 0 ? "🏃" : "🍽️"} @{meal.name}
                      </span>
                      <span className="text-muted-foreground text-xs ml-2 truncate">{meal.summary}</span>
                    </div>
                    <span className={`text-xs whitespace-nowrap ${meal.total_calories < 0 ? "text-success" : "text-muted-foreground"}`}>
                      {meal.total_calories < 0 ? `burns ${Math.abs(meal.total_calories)}` : meal.total_calories} cal
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
        
        {/* Pending save meal indicator */}
        {pendingSaveMeal && (
          <div className="mb-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-primary">💾 Reply with a name to save this meal</span>
            <button
              type="button"
              onClick={() => setPendingSaveMeal(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              // Handle meal dropdown navigation
              handleKeyDown(e);
              
              // Submit on Enter (if dropdown not showing)
              if (e.key === "Enter" && !e.shiftKey && !showMealDropdown) {
                e.preventDefault();
                if (input.trim() && !loading) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder={
              trialInfo.isExpired && !trialInfo.isPaid 
                ? "Upgrade to continue..." 
                : pendingSaveMeal 
                  ? "Enter a name (e.g., breakfast)..." 
                  : "What did you eat or do today?"
            }
            rows={1}
            className={`flex-1 min-h-10 max-h-32 px-4 py-2.5 text-sm bg-secondary border-0 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none ${
              trialInfo.isExpired && !trialInfo.isPaid ? "opacity-60" : ""
            }`}
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
          Type <span className="text-primary">@</span> for saved presets • <span className="text-primary">/create</span> [name] [meal or exercise]
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
  dataLoaded,
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
    totalXP: number;
    maxStreak: number;
  };
  calendar: CalendarDay[];
  profile: Profile | null;
  logs: DailyLog[];
  onDayClick: (day: CalendarDay) => void;
  onTodayCardClick: () => void;
  onRealWeightCardClick: () => void;
  onEntryConfirmed: () => void;
  todayHasWeight: boolean;
  dataLoaded: boolean;
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
        <AIDiary onEntryConfirmed={onEntryConfirmed} todayHasWeight={todayHasWeight} dataLoaded={dataLoaded} />
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
    totalXP: 0,
    maxStreak: 0,
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

    // Gamification: Calculate XP and max streak
    const totalXP = calculateTotalXP(logs, tdee, goalDeficit);
    const maxStreak = calculateMaxStreak(logs, tdee, goalDeficit);

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
      totalXP,
      maxStreak,
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
    const isPaid = sub?.status === "active";
    
    // Calculate trial end as 7 days from signup date
    const signupDateObj = profile?.created_at ? new Date(profile.created_at) : null;
    let trialEnd: Date | null = null;
    if (signupDateObj) {
      trialEnd = new Date(signupDateObj);
      trialEnd.setDate(trialEnd.getDate() + 7);
    }
    
    // Get user's signup date to show starting weight
    const signupDate = profile?.created_at ? getLocalDateString(new Date(profile.created_at)) : null;
    const startingWeight = profile?.starting_weight_kg || null;

    const calendarDays: CalendarDay[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      calendarDays.push({ date: "", dayOfMonth: 0, weight: null, weightChange: null, balance: 0, protein: 0, intake: 0, outtake: 0, isSuccess: false, balanceStatus: "warning", isLocked: false, isFuture: true, isToday: false, hasData: false });
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
      
      // Lock days after trial end (7 days from signup) if not paid
      let isLocked = false;
      if (!isPaid && trialEnd) {
        // Lock if date is after trial end date
        const dateAtMidnight = new Date(date);
        dateAtMidnight.setHours(0, 0, 0, 0);
        const trialEndAtMidnight = new Date(trialEnd);
        trialEndAtMidnight.setHours(0, 0, 0, 0);
        if (dateAtMidnight > trialEndAtMidnight) {
          isLocked = true;
        }
      }
      const balance = log ? calculateDailyBalance(tdee, log.caloric_intake, log.caloric_outtake) : 0;
      const protein = log?.protein_grams || 0;
      const intake = log?.caloric_intake || 0;
      const outtake = log?.caloric_outtake || 0;
      // Success = met or exceeded goal deficit (balance <= goalDeficit, since negative = deficit)
      // e.g., -1100 <= -1000 means you exceeded your 1000 cal deficit goal
      const isSuccess = log ? balance <= goalDeficit : false;
      
      // Balance status for color coding:
      // success (green) = met/exceeded goal (balance <= goalDeficit)
      // warning (orange) = in deficit but missed goal (balance < 0 && balance > goalDeficit)
      // danger (red) = in surplus (balance >= 0)
      let balanceStatus: "success" | "warning" | "danger" = "warning";
      if (log) {
        if (balance <= goalDeficit) {
          balanceStatus = "success";
        } else if (balance >= 0) {
          balanceStatus = "danger";
        } else {
          balanceStatus = "warning";
        }
      }
      
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
        intake,
        outtake,
        isSuccess,
        balanceStatus,
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
      // Calculate balance status for color coding
      const todayBalanceStatus: "success" | "warning" | "danger" = 
        stats.todayBalance <= stats.goalDeficit ? "success" :
        stats.todayBalance >= 0 ? "danger" : "warning";
      
      handleDayClick({
        date: todayStr,
        dayOfMonth: new Date().getDate(),
        weight: null,
        weightChange: null,
        balance: stats.todayBalance,
        protein: stats.todayProtein,
        intake: stats.todayIntake,
        outtake: stats.todayOuttake,
        isSuccess: stats.todayBalance <= stats.goalDeficit,
        balanceStatus: todayBalanceStatus,
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
        dataLoaded={!loading}
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
                <div className={`p-3 rounded-lg ${
                  selectedDay.balanceStatus === "success" ? "bg-success/10 border border-success/20" : 
                  selectedDay.balanceStatus === "warning" ? "bg-gold/10 border border-gold/20" : 
                  "bg-danger/10 border border-danger/20"
                }`}>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Balance</p>
                  <p className={`font-display font-bold text-lg ${
                    selectedDay.balanceStatus === "success" ? "text-success" : 
                    selectedDay.balanceStatus === "warning" ? "text-gold" : "text-danger"
                  }`}>
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
