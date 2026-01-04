/**
 * THE MATH ENGINE
 * All weight loss calculations. This is the brain of the app.
 * 
 * Core principle: 7,700 kcal deficit = 1 kg of body fat lost
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const KCAL_PER_KG = 7700; // 7,700 kcal = 1 kg of body fat
export const KCAL_PER_LB = 3500; // For US users if needed

// Activity level multipliers for TDEE (Total Daily Energy Expenditure)
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,      // Little/no exercise, desk job
  light: 1.375,        // Light exercise 1-3 days/week
  moderate: 1.55,      // Moderate exercise 3-5 days/week
  active: 1.725,       // Hard exercise 6-7 days/week
  very_active: 1.9,    // Very hard exercise, physical job
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_MULTIPLIERS;

export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Little or no exercise, desk job",
  light: "Light exercise 1-3 days/week",
  moderate: "Moderate exercise 3-5 days/week",
  active: "Hard exercise 6-7 days/week",
  very_active: "Very hard exercise or physical job",
};

// ============================================================================
// BMR & TDEE CALCULATIONS
// ============================================================================

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 * Most accurate formula for most people
 * 
 * Men: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) + 5
 * Women: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) - 161
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: 'male' | 'female' | 'other'
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  
  if (gender === 'male') return Math.round(base + 5);
  if (gender === 'female') return Math.round(base - 161);
  return Math.round(base - 78); // Average for 'other'
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * This is your maintenance calories - what you burn in a day including activity
 */
export function calculateTDEE(
  bmr: number,
  activityLevel: ActivityLevel
): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/**
 * Helper: Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  
  return age;
}

// ============================================================================
// GOAL & DEFICIT CALCULATIONS
// ============================================================================

export interface DeficitAnalysis {
  dailyDeficit: number;
  weeklyLoss: number;      // kg per week
  isAchievable: boolean;
  isSafe: boolean;
  daysRemaining: number;
  weeksRemaining: number;
  riskLevel: 'safe' | 'aggressive' | 'dangerous';
  message: string;
}

/**
 * Calculate required daily deficit to hit goal weight by target date
 */
export function calculateRequiredDailyDeficit(
  currentWeightKg: number,
  goalWeightKg: number,
  goalDate: Date
): DeficitAnalysis {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const goalDateTime = new Date(goalDate);
  goalDateTime.setHours(0, 0, 0, 0);
  
  const daysRemaining = Math.ceil(
    (goalDateTime.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // Handle edge cases
  if (daysRemaining <= 0) {
    return {
      dailyDeficit: 0,
      weeklyLoss: 0,
      isAchievable: false,
      isSafe: false,
      daysRemaining: 0,
      weeksRemaining: 0,
      riskLevel: 'dangerous',
      message: "Goal date has passed. Please set a future date.",
    };
  }
  
  const weightToLose = currentWeightKg - goalWeightKg;
  
  // If trying to gain weight or already at goal
  if (weightToLose <= 0) {
    return {
      dailyDeficit: 0,
      weeklyLoss: 0,
      isAchievable: true,
      isSafe: true,
      daysRemaining,
      weeksRemaining: Math.round(daysRemaining / 7 * 10) / 10,
      riskLevel: 'safe',
      message: "You're already at or below your goal weight!",
    };
  }
  
  const totalKcalDeficit = weightToLose * KCAL_PER_KG;
  const dailyDeficit = Math.round(totalKcalDeficit / daysRemaining);
  const weeklyLoss = Math.round((dailyDeficit * 7 / KCAL_PER_KG) * 100) / 100;
  const weeksRemaining = Math.round(daysRemaining / 7 * 10) / 10;
  
  // Determine risk level
  let riskLevel: 'safe' | 'aggressive' | 'dangerous';
  let message: string;
  let isSafe: boolean;
  
  if (dailyDeficit <= 750) {
    riskLevel = 'safe';
    isSafe = true;
    message = `Healthy pace! You'll lose about ${weeklyLoss}kg per week.`;
  } else if (dailyDeficit <= 1000) {
    riskLevel = 'aggressive';
    isSafe = true;
    message = `Aggressive but achievable. You'll lose about ${weeklyLoss}kg per week.`;
  } else if (dailyDeficit <= 1500) {
    riskLevel = 'aggressive';
    isSafe = false;
    message = `This is very aggressive (${weeklyLoss}kg/week). Consider extending your goal date.`;
  } else {
    riskLevel = 'dangerous';
    isSafe = false;
    message = `This deficit is too extreme and unhealthy. Please extend your goal date.`;
  }
  
  return {
    dailyDeficit,
    weeklyLoss,
    isAchievable: dailyDeficit <= 1500,
    isSafe,
    daysRemaining,
    weeksRemaining,
    riskLevel,
    message,
  };
}

// ============================================================================
// WEIGHT TRACKING
// ============================================================================

export interface WeightEntry {
  date: Date;
  weight: number;
}

/**
 * Calculate "Real Weight" - 7-day rolling average
 * Smooths out water weight fluctuations for a more accurate picture
 */
export function calculateRealWeight(weights: WeightEntry[]): number | null {
  const validWeights = weights.filter(w => w.weight && w.weight > 0);
  
  if (validWeights.length === 0) return null;
  
  // Sort by date descending and take last 7
  const last7Days = validWeights
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);
  
  const sum = last7Days.reduce((acc, w) => acc + w.weight, 0);
  return Math.round((sum / last7Days.length) * 10) / 10;
}

/**
 * Calculate weight change between two periods
 */
export function calculateWeightChange(
  currentRealWeight: number,
  previousRealWeight: number
): { change: number; isLoss: boolean; percentage: number } {
  const change = Math.round((currentRealWeight - previousRealWeight) * 10) / 10;
  return {
    change: Math.abs(change),
    isLoss: change < 0,
    percentage: Math.round((Math.abs(change) / previousRealWeight) * 1000) / 10,
  };
}

// ============================================================================
// DAILY BALANCE CALCULATIONS
// ============================================================================

/**
 * Calculate daily caloric balance (deficit/surplus)
 * 
 * NEGATIVE = deficit = GOOD for weight loss (you ate less than you burned)
 * POSITIVE = surplus = BAD for weight loss (you ate more than you burned)
 * 
 * Formula: Balance = Intake - (TDEE + Exercise)
 * 
 * Examples (TDEE = 1964):
 * - No food eaten: 0 - 1964 = -1964 (massive deficit - haven't eaten yet)
 * - Ate 964: 964 - 1964 = -1000 (1000 cal deficit - on target!)
 * - Ate 1500, burned 536: 1500 - (1964 + 536) = -1000 (same deficit with exercise)
 * - Ate 2500: 2500 - 1964 = +536 (surplus - overate!)
 */
export function calculateDailyBalance(
  tdee: number,
  caloricIntake: number,
  caloricOuttake: number = 0
): number {
  const totalBurned = tdee + caloricOuttake;
  return caloricIntake - totalBurned;
}

/**
 * Calculate 7-day rolling balance
 */
export function calculate7DayBalance(
  dailyBalances: { date: Date; balance: number }[]
): { total: number; average: number; daysWithData: number } {
  const last7 = dailyBalances
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);
  
  if (last7.length === 0) {
    return { total: 0, average: 0, daysWithData: 0 };
  }
  
  const total = last7.reduce((acc, d) => acc + d.balance, 0);
  return {
    total: Math.round(total),
    average: Math.round(total / last7.length),
    daysWithData: last7.length,
  };
}

// ============================================================================
// PREDICTIONS
// ============================================================================

export interface WeightPrediction {
  predictedWeight: number;
  predictedChange: number;
  isLoss: boolean;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Predict weight in 30 days based on last 7 days data
 */
export function predictWeight30Days(
  currentRealWeight: number,
  last7DaysBalances: number[]
): WeightPrediction {
  if (last7DaysBalances.length === 0 || !currentRealWeight) {
    return {
      predictedWeight: currentRealWeight || 0,
      predictedChange: 0,
      isLoss: false,
      confidence: 'low',
    };
  }
  
  // Average daily deficit/surplus
  const avgDailyBalance = last7DaysBalances.reduce((a, b) => a + b, 0) / last7DaysBalances.length;
  
  // Project over 30 days
  const projectedTotalBalance = avgDailyBalance * 30;
  
  // Convert calories to kg (negative balance = weight loss)
  const projectedWeightChange = projectedTotalBalance / KCAL_PER_KG;
  
  // Determine confidence based on data points
  let confidence: 'low' | 'medium' | 'high';
  if (last7DaysBalances.length >= 6) {
    confidence = 'high';
  } else if (last7DaysBalances.length >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    predictedWeight: Math.round((currentRealWeight + projectedWeightChange) * 10) / 10,
    predictedChange: Math.round(Math.abs(projectedWeightChange) * 10) / 10,
    isLoss: projectedWeightChange < 0,
    confidence,
  };
}

// ============================================================================
// PROTEIN & MACROS
// ============================================================================

/**
 * Calculate daily protein goal
 * Standard: 1.6-2.2g per kg body weight
 * Active people need more protein for muscle preservation during deficit
 */
export function calculateProteinGoal(
  weightKg: number,
  isActive: boolean = false
): number {
  const multiplier = isActive ? 2.0 : 1.6;
  return Math.round(weightKg * multiplier);
}

// ============================================================================
// STREAKS & GAMIFICATION
// ============================================================================

/**
 * Calculate streak (consecutive COMPLETED days with caloric deficit)
 * 
 * Rules:
 * - A day is "completed" at 12am local time (midnight)
 * - Today doesn't count since it's not finished yet
 * - Streak = consecutive days ending with negative balance (deficit)
 * - Streak breaks when a day ends with zero or positive balance (surplus)
 * - Negative balance = deficit = GOOD for weight loss
 */
export function calculateStreak(
  dailyBalances: { date: Date; balance: number }[]
): number {
  if (dailyBalances.length === 0) return 0;
  
  // Get today's date at midnight (local time)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Filter out today (not completed yet) and sort by date descending
  const completedDays = dailyBalances
    .filter(d => {
      const entryDate = new Date(d.date);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate < today; // Only completed days (before today)
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  if (completedDays.length === 0) return 0;
  
  let streak = 0;
  
  // Start from yesterday and count backwards
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  for (let i = 0; i < completedDays.length; i++) {
    const entryDate = new Date(completedDays[i].date);
    entryDate.setHours(0, 0, 0, 0);
    
    // Calculate expected date (yesterday - i days)
    const expectedDate = new Date(yesterday);
    expectedDate.setDate(expectedDate.getDate() - i);
    expectedDate.setHours(0, 0, 0, 0);
    
    // Check if dates match (no gaps allowed)
    const daysDiff = Math.round(
      (expectedDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff !== 0) {
      // Gap in data - streak broken (missing day)
      break;
    }
    
    // Check the balance for this completed day
    if (completedDays[i].balance < 0) {
      // Deficit day (negative balance) - streak continues!
      streak++;
    } else {
      // Surplus day (zero or positive balance) - streak broken
      break;
    }
  }
  
  return streak;
}

/**
 * Get achievement milestones
 */
export function getWeightLossMilestone(totalLost: number): {
  milestone: number;
  name: string;
  reached: boolean;
} | null {
  const milestones = [
    { kg: 1, name: "First Kilo!" },
    { kg: 5, name: "5kg Club" },
    { kg: 10, name: "Double Digits" },
    { kg: 15, name: "Halfway Hero" },
    { kg: 20, name: "20kg Legend" },
    { kg: 25, name: "Quarter Century" },
    { kg: 50, name: "Half Century" },
  ];
  
  // Find the highest milestone reached
  for (let i = milestones.length - 1; i >= 0; i--) {
    if (totalLost >= milestones[i].kg) {
      return {
        milestone: milestones[i].kg,
        name: milestones[i].name,
        reached: true,
      };
    }
  }
  
  // Return next milestone to reach
  if (totalLost < milestones[0].kg) {
    return {
      milestone: milestones[0].kg,
      name: milestones[0].name,
      reached: false,
    };
  }
  
  return null;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format calorie number with sign and color hint
 * NEGATIVE = deficit = GOOD
 * POSITIVE = surplus = BAD
 */
export function formatBalance(balance: number): {
  text: string;
  isDeficit: boolean;
  color: 'success' | 'danger' | 'neutral';
} {
  if (balance === 0) {
    return { text: "0", isDeficit: false, color: 'neutral' };
  }
  
  const isDeficit = balance < 0;
  const absValue = Math.abs(balance);
  
  return {
    text: `${isDeficit ? '-' : '+'}${absValue.toLocaleString()}`,
    isDeficit,
    color: isDeficit ? 'success' : 'danger',
  };
}

/**
 * Format balance with comparison to goal deficit
 * 
 * Balance: NEGATIVE = deficit (good), POSITIVE = surplus (bad)
 * Goal: NEGATIVE number (e.g., -1000 for a 1000 cal deficit goal)
 * 
 * Colors:
 * - Green: balance <= goal (met or exceeded deficit goal, e.g., -1100 <= -1000)
 * - Orange: balance is negative but > goal (deficit but not enough, e.g., -800 > -1000)
 * - Red: balance >= 0 (at maintenance or surplus)
 */
export function formatBalanceWithGoal(
  balance: number, 
  goalDeficit: number // Negative number (e.g., -1000)
): {
  text: string;
  isDeficit: boolean;
  color: 'success' | 'warning' | 'danger' | 'neutral';
  vsGoal: number;
  vsGoalText: string;
  toGoal: number; // Calories needed to reach goal (positive = need to burn more)
  toMaintenance: number; // Calories until maintenance (positive = can eat more, negative = over)
  status: 'exceeded' | 'on-track' | 'behind' | 'surplus';
} {
  const isDeficit = balance < 0;
  const absValue = Math.abs(balance);
  const text = balance === 0 ? "0" : `${isDeficit ? '-' : '+'}${absValue.toLocaleString()}`;
  
  let color: 'success' | 'warning' | 'danger' | 'neutral';
  let vsGoalText: string;
  let status: 'exceeded' | 'on-track' | 'behind' | 'surplus';
  
  // toGoal: positive means need to burn more, negative means exceeded goal
  const toGoal = balance - goalDeficit; // e.g., -556 - (-868) = 312 (need 312 more)
  
  // toMaintenance: positive means can eat more, negative means in surplus
  const toMaintenance = -balance; // e.g., -(-556) = 556 (can eat 556 more before maintenance)
  
  if (balance >= 0) {
    // At maintenance or surplus - bad
    color = 'danger';
    status = 'surplus';
    if (balance === 0) {
      vsGoalText = `${Math.abs(goalDeficit).toLocaleString()} to go`;
    } else {
      vsGoalText = `${balance.toLocaleString()} surplus!`;
    }
  } else if (balance <= goalDeficit) {
    // Met or exceeded deficit goal - great! (e.g., -1100 <= -1000)
    color = 'success';
    status = toGoal === 0 ? 'on-track' : 'exceeded';
    const extra = Math.abs(balance) - Math.abs(goalDeficit);
    vsGoalText = extra === 0 ? 'On target!' : `${extra.toLocaleString()} extra`;
  } else {
    // Deficit but not meeting goal (e.g., -800 when goal is -1000)
    color = 'warning';
    status = 'behind';
    const remaining = Math.abs(goalDeficit) - Math.abs(balance);
    vsGoalText = `${remaining.toLocaleString()} to go`;
  }
  
  // vsGoal: how far from goal (negative = exceeded goal, positive = short of goal)
  const vsGoal = balance - goalDeficit;
  
  return {
    text,
    isDeficit,
    color,
    vsGoal,
    vsGoalText,
    toGoal,
    toMaintenance,
    status,
  };
}

/**
 * Format weight with unit
 */
export function formatWeight(kg: number, unit: 'kg' | 'lbs' = 'kg'): string {
  if (unit === 'lbs') {
    return `${Math.round(kg * 2.20462 * 10) / 10} lbs`;
  }
  return `${Math.round(kg * 10) / 10} kg`;
}

/**
 * Convert between units
 */
export function convertWeight(value: number, from: 'kg' | 'lbs', to: 'kg' | 'lbs'): number {
  if (from === to) return value;
  if (from === 'kg') return Math.round(value * 2.20462 * 10) / 10;
  return Math.round(value / 2.20462 * 10) / 10;
}

export function convertHeight(value: number, from: 'cm' | 'ft', to: 'cm' | 'ft'): number {
  if (from === to) return value;
  if (from === 'cm') return Math.round(value / 30.48 * 10) / 10;
  return Math.round(value * 30.48);
}

