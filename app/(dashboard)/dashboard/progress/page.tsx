"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface WeightDataPoint {
  date: string;
  displayDate: string;
  actualWeight: number | null;
  predictedWeight: number;
  goalWeight: number;
}

interface DailyLog {
  log_date: string;
  weight_kg: number | null;
}

export default function ProgressPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [chartData, setChartData] = useState<WeightDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLost: 0,
    avgDeficit: 0,
    daysTracked: 0,
    projectedGoalDate: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profileData) return;
    setProfile(profileData);

    // Fetch all daily logs with weight
    const { data: logs } = await supabase
      .from("daily_logs")
      .select("log_date, weight_kg, caloric_intake, caloric_outtake")
      .eq("user_id", user.id)
      .order("log_date", { ascending: true });

    // Build chart data
    const startWeight = profileData.starting_weight_kg || 80;
    const goalWeight = profileData.goal_weight_kg || startWeight - 10;
    const dailyDeficitGoal = profileData.daily_calorie_goal || 500; // Default 500 cal deficit
    const tdee = profileData.tdee || 2000;

    // Calculate kg lost per day based on deficit (7700 kcal = 1 kg)
    const kgPerDay = dailyDeficitGoal / 7700;

    // Get the date range (from signup to goal date or 90 days)
    const startDate = new Date(profileData.created_at || new Date());
    const goalDate = profileData.goal_date ? new Date(profileData.goal_date) : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    // Create a map of actual weights by date
    const weightMap = new Map<string, number>();
    let lastKnownWeight = startWeight;
    
    if (logs) {
      // First pass: record all actual weights
      logs.forEach((log: DailyLog) => {
        if (log.weight_kg) {
          weightMap.set(log.log_date, log.weight_kg);
        }
      });
    }

    // Generate data points from start to today (or goal date if passed)
    const today = new Date();
    const endDate = today < goalDate ? today : goalDate;
    const dataPoints: WeightDataPoint[] = [];
    
    let currentDate = new Date(startDate);
    let dayIndex = 0;

    // Add starting point
    dataPoints.push({
      date: startDate.toISOString().split("T")[0],
      displayDate: formatDate(startDate),
      actualWeight: startWeight,
      predictedWeight: startWeight,
      goalWeight: goalWeight,
    });

    currentDate.setDate(currentDate.getDate() + 1);
    dayIndex++;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const predictedWeight = Math.max(goalWeight, startWeight - (kgPerDay * dayIndex));
      
      // Get actual weight if available
      const actualWeight = weightMap.get(dateStr) || null;
      if (actualWeight) {
        lastKnownWeight = actualWeight;
      }

      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(currentDate),
        actualWeight: actualWeight,
        predictedWeight: Math.round(predictedWeight * 10) / 10,
        goalWeight: goalWeight,
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayIndex++;
    }

    // Add future predictions (next 30 days or until goal)
    const futureEndDate = new Date(Math.min(
      today.getTime() + 30 * 24 * 60 * 60 * 1000,
      goalDate.getTime()
    ));

    while (currentDate <= futureEndDate) {
      const predictedWeight = Math.max(goalWeight, startWeight - (kgPerDay * dayIndex));
      
      dataPoints.push({
        date: currentDate.toISOString().split("T")[0],
        displayDate: formatDate(currentDate),
        actualWeight: null,
        predictedWeight: Math.round(predictedWeight * 10) / 10,
        goalWeight: goalWeight,
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayIndex++;
    }

    setChartData(dataPoints);

    // Calculate stats
    const actualWeights = dataPoints.filter(d => d.actualWeight !== null);
    const totalLost = actualWeights.length >= 2 
      ? (actualWeights[0].actualWeight! - actualWeights[actualWeights.length - 1].actualWeight!)
      : 0;

    // Calculate average deficit from logs
    let totalDeficit = 0;
    let deficitDays = 0;
    if (logs) {
      logs.forEach((log: { caloric_intake?: number; caloric_outtake?: number }) => {
        if (log.caloric_intake !== undefined) {
          const dailyBalance = (log.caloric_intake || 0) - (tdee + (log.caloric_outtake || 0));
          if (dailyBalance < 0) {
            totalDeficit += Math.abs(dailyBalance);
            deficitDays++;
          }
        }
      });
    }

    // Project goal date based on current progress
    const remainingWeight = lastKnownWeight - goalWeight;
    const avgKgPerDay = totalLost > 0 && actualWeights.length > 1 
      ? totalLost / (actualWeights.length - 1)
      : kgPerDay;
    const daysToGoal = remainingWeight > 0 ? Math.ceil(remainingWeight / avgKgPerDay) : 0;
    const projectedDate = new Date(today.getTime() + daysToGoal * 24 * 60 * 60 * 1000);

    setStats({
      totalLost: Math.round(totalLost * 10) / 10,
      avgDeficit: deficitDays > 0 ? Math.round(totalDeficit / deficitDays) : 0,
      daysTracked: actualWeights.length,
      projectedGoalDate: projectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });

    setLoading(false);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading progress...</div>
      </div>
    );
  }

  const startWeight = profile?.starting_weight_kg || 80;
  const goalWeight = profile?.goal_weight_kg || startWeight - 10;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
          Weight Progress
        </h1>
        <p className="text-muted-foreground text-sm">
          Track your actual weight vs predicted weight based on your deficit goal
        </p>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-1">Total Lost</div>
          <div className={`text-2xl font-display font-bold ${stats.totalLost > 0 ? "text-success" : "text-foreground"}`}>
            {stats.totalLost > 0 ? "-" : ""}{stats.totalLost} kg
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-1">Avg Daily Deficit</div>
          <div className="text-2xl font-display font-bold text-primary">
            {stats.avgDeficit} cal
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-1">Days Tracked</div>
          <div className="text-2xl font-display font-bold text-foreground">
            {stats.daysTracked}
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-1">Projected Goal Date</div>
          <div className="text-lg font-display font-bold text-gold">
            {stats.projectedGoalDate}
          </div>
        </div>
      </motion.div>

      {/* Weight Milestones */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card rounded-xl p-4 border border-border"
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium">Weight Journey</span>
          <span className="text-xs text-muted-foreground">
            {startWeight} kg → {goalWeight} kg
          </span>
        </div>
        <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-500"
            style={{ 
              width: `${Math.min(100, Math.max(0, ((startWeight - (chartData.filter(d => d.actualWeight).pop()?.actualWeight || startWeight)) / (startWeight - goalWeight)) * 100))}%` 
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>Start: {startWeight} kg</span>
          <span>Goal: {goalWeight} kg</span>
        </div>
      </motion.div>

      {/* Main Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-xl p-4 lg:p-6 border border-border"
      >
        <h2 className="text-lg font-display font-semibold mb-4">
          Actual vs Predicted Weight
        </h2>
        <div className="h-[300px] lg:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="displayDate" 
                tick={{ fill: "#888", fontSize: 11 }}
                tickLine={{ stroke: "#888" }}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[
                  Math.floor(goalWeight - 2),
                  Math.ceil(startWeight + 2)
                ]}
                tick={{ fill: "#888", fontSize: 11 }}
                tickLine={{ stroke: "#888" }}
                tickFormatter={(value) => `${value}kg`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "#1a1a1a", 
                  border: "1px solid #333",
                  borderRadius: "8px",
                  fontSize: "12px"
                }}
                labelStyle={{ color: "#fff" }}
              />
              <Legend 
                verticalAlign="top" 
                height={36}
                wrapperStyle={{ fontSize: "12px" }}
              />
              <ReferenceLine 
                y={goalWeight} 
                stroke="#22c55e" 
                strokeDasharray="5 5" 
                label={{ value: "Goal", fill: "#22c55e", fontSize: 11 }}
              />
              
              {/* Predicted Weight Line */}
              <Line
                type="monotone"
                dataKey="predictedWeight"
                name="Predicted Weight"
                stroke="#F97316"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 4 }}
              />
              
              {/* Actual Weight Line */}
              <Line
                type="monotone"
                dataKey="actualWeight"
                name="Actual Weight"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: "#3b82f6" }}
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend Explanation */}
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500 rounded"></div>
            <span>Your actual recorded weight</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-primary rounded" style={{ borderStyle: "dashed" }}></div>
            <span>Predicted weight based on your deficit goal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-success rounded" style={{ borderStyle: "dashed" }}></div>
            <span>Your goal weight ({goalWeight} kg)</span>
          </div>
        </div>
      </motion.div>

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card/50 rounded-xl p-4 border border-border"
      >
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          💡 Understanding Your Progress
        </h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• <strong>Blue line</strong> shows your actual weighed progress</li>
          <li>• <strong>Orange dashed line</strong> shows where you should be based on your daily deficit goal</li>
          <li>• If blue is below orange, you're ahead of schedule! 🎉</li>
          <li>• Weight fluctuates daily - focus on the weekly trend, not daily numbers</li>
          <li>• Weigh yourself at the same time each day for consistency (morning recommended)</li>
        </ul>
      </motion.div>
    </div>
  );
}

