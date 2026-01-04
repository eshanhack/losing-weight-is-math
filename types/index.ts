/**
 * TypeScript types matching the database schema
 */

import { ActivityLevel } from "@/lib/math";

// ============================================================================
// USER & PROFILE
// ============================================================================

export type Gender = 'male' | 'female' | 'other';

export interface Profile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO date string
  country: string;
  height_cm: number;
  starting_weight_kg: number;
  current_weight_kg: number | null;
  goal_weight_kg: number;
  goal_date: string; // ISO date string
  gender: Gender;
  activity_level: ActivityLevel;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  email: string;
  phone?: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  country: string;
  height_cm: number;
  starting_weight_kg: number;
  goal_weight_kg: number;
  goal_date: string;
  gender: Gender;
  activity_level?: ActivityLevel;
}

// ============================================================================
// DAILY LOGS
// ============================================================================

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string; // ISO date string (YYYY-MM-DD)
  weight_kg: number | null;
  caloric_intake: number;
  caloric_outtake: number;
  protein_grams: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyLogInsert {
  user_id: string;
  log_date: string;
  weight_kg?: number | null;
  caloric_intake?: number;
  caloric_outtake?: number;
  protein_grams?: number;
  notes?: string | null;
}

export interface DailyLogUpdate {
  weight_kg?: number | null;
  caloric_intake?: number;
  caloric_outtake?: number;
  protein_grams?: number;
  notes?: string | null;
}

// ============================================================================
// LOG ENTRIES (Individual food/exercise items)
// ============================================================================

export type EntryType = 'food' | 'exercise';

export interface LogEntry {
  id: string;
  daily_log_id: string;
  entry_type: EntryType;
  description: string;
  calories: number;
  protein_grams: number;
  ai_parsed: boolean;
  raw_input: string | null;
  created_at: string;
}

export interface LogEntryInsert {
  daily_log_id: string;
  entry_type: EntryType;
  description: string;
  calories: number;
  protein_grams?: number;
  ai_parsed?: boolean;
  raw_input?: string | null;
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'past_due' | 'expired';
export type PlanType = 'monthly' | 'annual';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_type: PlanType | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  referral_code_used: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// REFERRAL CODES
// ============================================================================

export interface ReferralCode {
  id: string;
  code: string;
  owner_name: string | null;
  discount_percent: number;
  uses_count: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
}

// ============================================================================
// CHAT MESSAGES
// ============================================================================

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  log_date: string | null;
  created_at: string;
}

export interface ChatMessageInsert {
  user_id: string;
  role: ChatRole;
  content: string;
  log_date?: string | null;
}

// ============================================================================
// AI PARSING TYPES
// ============================================================================

export interface ParsedFoodItem {
  description: string;
  calories: number;
  protein: number;
  emoji?: string;
}

export interface ParsedExercise {
  description: string;
  calories: number;
  duration?: string;
  emoji?: string;
}

export interface AIParseResponse {
  type: 'food' | 'exercise' | 'edit' | 'delete';
  items: ParsedFoodItem[] | ParsedExercise[];
  total_calories: number;
  total_protein: number;
  message: string;
  // For edit/delete operations
  search_term?: string;
  updates?: {
    calories?: number;
    protein?: number;
    description?: string;
  };
  // Error flag - when true, don't show log/cancel buttons
  is_error?: boolean;
}

// ============================================================================
// DASHBOARD COMPUTED TYPES
// ============================================================================

export interface DashboardStats {
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
}

export interface CalendarDay {
  date: string;
  weight: number | null;
  balance: number;
  isSuccess: boolean;
  isLocked: boolean;
  isFuture: boolean;
  isToday: boolean;
  hasData: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface OnboardingData {
  // Step 1: Account
  email: string;
  password: string;
  
  // Step 2: Phone (optional)
  phone?: string;
  
  // Step 3: Personal
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  country: string;
  gender: Gender;
  
  // Step 4: Body stats
  weight: number;
  height: number;
  weightUnit: 'kg' | 'lbs';
  heightUnit: 'cm' | 'ft';
  activityLevel: ActivityLevel;
  
  // Step 5: Goals
  goalWeight: number;
  goalDate: Date;
}

