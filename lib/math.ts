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
 * Calculate daily surplus/deficit
 * Negative = deficit (GOOD for weight loss)
 * Positive = surplus (bad for weight loss)
 */
export function calculateDailyBalance(
  tdee: number,
  caloricIntake: number,
  caloricOuttake: number = 0
): number {
  // TDEE is what you burn at rest + normal activity
  // Outtake is additional exercise calories burned
  // Intake is what you ate
  const totalBurned = tdee + caloricOuttake;
  return caloricIntake - totalBurned; // Negative = deficit = good
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
 * Calculate streak (consecutive days with caloric deficit)
 */
export function calculateStreak(
  dailyBalances: { date: Date; balance: number }[]
): number {
  if (dailyBalances.length === 0) return 0;
  
  // Sort by date descending (most recent first)
  const sorted = [...dailyBalances].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < sorted.length; i++) {
    const entryDate = new Date(sorted[i].date);
    entryDate.setHours(0, 0, 0, 0);
    
    // Check if this is a consecutive day
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);
    
    // Allow for some flexibility - if there's a gap, break the streak
    const daysDiff = Math.round(
      (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff !== i) {
      // Gap in data - streak broken
      break;
    }
    
    if (sorted[i].balance < 0) {
      // Deficit day - streak continues
      streak++;
    } else {
      // Surplus day - streak broken
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
 * Returns color based on performance vs goal:
 * - Green: Meeting or exceeding deficit goal
 * - Orange: Deficit but not meeting goal  
 * - Red: Surplus (positive balance)
 */
export function formatBalanceWithGoal(
  balance: number, 
  goalDeficit: number
): {
  text: string;
  isDeficit: boolean;
  color: 'success' | 'warning' | 'danger' | 'neutral';
  vsGoal: number; // How far off from goal (negative = better than goal)
  vsGoalText: string;
} {
  const isDeficit = balance < 0;
  const absValue = Math.abs(balance);
  const text = balance === 0 ? "0" : `${isDeficit ? '-' : '+'}${absValue.toLocaleString()}`;
  
  // Goal is expressed as negative (e.g., -1000 for 1000 cal deficit goal)
  // vsGoal: positive = worse than goal, negative = better than goal
  const vsGoal = balance - goalDeficit;
  
  let color: 'success' | 'warning' | 'danger' | 'neutral';
  let vsGoalText: string;
  
  if (balance > 0) {
    // Surplus - bad
    color = 'danger';
    vsGoalText = `${Math.abs(goalDeficit) + balance} over goal`;
  } else if (balance <= goalDeficit) {
    // Meeting or exceeding deficit goal - great!
    color = 'success';
    const extra = Math.abs(balance - goalDeficit);
    vsGoalText = extra === 0 ? 'On target!' : `${extra} ahead of goal`;
  } else {
    // Deficit but not meeting goal - okay but could be better
    color = 'warning';
    vsGoalText = `${Math.abs(vsGoal)} to go`;
  }
  
  return {
    text,
    isDeficit,
    color,
    vsGoal,
    vsGoalText,
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

