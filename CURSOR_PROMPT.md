# 🧮 LOSING WEIGHT IS MATH — Master Build Prompt

## Project Identity
- **Name:** Losing Weight is Math
- **Domain:** losingweightismath.com
- **Tagline:** "Weight loss isn't magic. It's math."
- **Philosophy:** Strip away the fitness industry noise. Weight loss is calories in vs calories out. This app makes that brutally simple and visually undeniable.

---

## Tech Stack (Non-Negotiable)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | **Next.js 14+ (App Router)** | SSR, API routes, optimal for SEO |
| Styling | **Tailwind CSS + CSS Variables** | Utility-first, themeable |
| Components | **Shadcn/UI** | Accessible, customizable primitives |
| Animation | **Framer Motion** | Micro-interactions, page transitions |
| Database | **Supabase (PostgreSQL + Auth + Edge Functions)** | Real-time, row-level security, built-in auth |
| AI | **OpenAI GPT-4o API** | Natural language food/exercise parsing |
| Payments | **Stripe** | Subscriptions, trials, webhooks |
| Charts | **Recharts** | Composable, responsive graphs |
| Hosting | **Vercel** | Edge functions, automatic CI/CD |
| Analytics | **PostHog or Plausible** | Privacy-friendly, funnel tracking |

---

## Design System — "Clinical Confidence"

### Philosophy
Not another pastel fitness app. This is **data-forward, confidence-inspiring, slightly clinical but warm**. Think: a smart doctor's dashboard meets a trading terminal. Users should feel like scientists tracking an experiment on themselves.

### Color Palette
```css
:root {
  /* Core */
  --background: #0A0A0B;        /* Near-black, easy on eyes */
  --surface: #141416;           /* Card backgrounds */
  --surface-elevated: #1C1C1F;  /* Modals, hover states */
  --border: #2A2A2E;            /* Subtle dividers */
  
  /* Text */
  --text-primary: #F4F4F5;      /* High contrast */
  --text-secondary: #A1A1AA;    /* Muted labels */
  --text-tertiary: #52525B;     /* Disabled, hints */
  
  /* Semantic */
  --success: #22C55E;           /* Deficit achieved */
  --success-muted: #166534;     /* Background tint */
  --danger: #EF4444;            /* Surplus warning */
  --danger-muted: #7F1D1D;      /* Background tint */
  --accent: #3B82F6;            /* Primary actions, links */
  --accent-glow: rgba(59, 130, 246, 0.15); /* Glow effects */
  
  /* Gamification */
  --gold: #F59E0B;              /* Streaks, achievements */
  --gold-glow: rgba(245, 158, 11, 0.2);
}
```

### Typography
```css
--font-display: 'Space Grotesk', sans-serif;  /* Headlines, numbers */
--font-body: 'Inter', sans-serif;              /* Body text */
--font-mono: 'JetBrains Mono', monospace;      /* Data, calculations */
```

### Key Design Rules
1. **Numbers are heroes** — Weight, calories, deficits displayed in large, bold `font-display`
2. **Color = meaning** — Green ONLY for success (deficit), Red ONLY for failure (surplus)
3. **Subtle glow effects** — Cards with deficits get a faint green glow, surplus gets red
4. **Micro-animations everywhere** — Numbers count up/down, progress bars animate, cards have hover lift
5. **Data density** — Maximize information per screen without clutter
6. **Dark mode only** (for now) — Easier on eyes for daily use, more dramatic data visualization

---

## Database Schema (Supabase PostgreSQL)

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES TABLE
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  phone_verified BOOLEAN DEFAULT FALSE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  country TEXT NOT NULL,
  height_cm NUMERIC(5,2) NOT NULL,
  starting_weight_kg NUMERIC(5,2) NOT NULL,
  current_weight_kg NUMERIC(5,2),
  goal_weight_kg NUMERIC(5,2) NOT NULL,
  goal_date DATE NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  activity_level TEXT DEFAULT 'sedentary' CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY LOGS TABLE
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  caloric_intake INTEGER DEFAULT 0,
  caloric_outtake INTEGER DEFAULT 0,
  protein_grams INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

-- FOOD/EXERCISE ENTRIES (individual items from AI diary)
CREATE TABLE log_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id UUID REFERENCES daily_logs(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('food', 'exercise')),
  description TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein_grams INTEGER DEFAULT 0,
  ai_parsed BOOLEAN DEFAULT FALSE,
  raw_input TEXT, -- Original user message
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUBSCRIPTIONS TABLE
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_type TEXT CHECK (plan_type IN ('monthly', 'annual')),
  status TEXT DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'canceled', 'past_due', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  referral_code_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- REFERRAL CODES (for future influencer system)
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  owner_name TEXT,
  discount_percent INTEGER DEFAULT 10,
  uses_count INTEGER DEFAULT 0,
  max_uses INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI CHAT HISTORY
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  log_date DATE, -- Which day this message relates to
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies (users can only access their own data)
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view own logs" ON daily_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own entries" ON log_entries FOR ALL USING (
  daily_log_id IN (SELECT id FROM daily_logs WHERE user_id = auth.uid())
);
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own chat" ON chat_messages FOR ALL USING (auth.uid() = user_id);

-- INDEXES for performance
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
CREATE INDEX idx_log_entries_daily_log ON log_entries(daily_log_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, created_at);
```

---

## Core Math Engine (`lib/math.ts`)

```typescript
/**
 * THE MATH ENGINE
 * All weight loss calculations. This is the brain of the app.
 */

// Constants
export const KCAL_PER_KG = 7700; // 7,700 kcal = 1 kg of body fat
export const KCAL_PER_LB = 3500; // For US users if needed

// Activity level multipliers for TDEE
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,      // Little/no exercise
  light: 1.375,        // Light exercise 1-3 days/week
  moderate: 1.55,      // Moderate exercise 3-5 days/week
  active: 1.725,       // Hard exercise 6-7 days/week
  very_active: 1.9,    // Very hard exercise, physical job
} as const;

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 * Most accurate for most people
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
 * This is maintenance calories
 */
export function calculateTDEE(
  bmr: number,
  activityLevel: keyof typeof ACTIVITY_MULTIPLIERS
): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/**
 * Calculate required daily deficit to hit goal
 */
export function calculateRequiredDailyDeficit(
  currentWeightKg: number,
  goalWeightKg: number,
  goalDate: Date
): { dailyDeficit: number; isAchievable: boolean; weeksToGoal: number } {
  const today = new Date();
  const daysRemaining = Math.ceil((goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysRemaining <= 0) {
    return { dailyDeficit: 0, isAchievable: false, weeksToGoal: 0 };
  }
  
  const weightToLose = currentWeightKg - goalWeightKg;
  const totalKcalDeficit = weightToLose * KCAL_PER_KG;
  const dailyDeficit = Math.round(totalKcalDeficit / daysRemaining);
  
  // Generally, 500-1000 kcal/day deficit is sustainable
  // More than 1500 is dangerous
  const isAchievable = dailyDeficit <= 1500 && dailyDeficit >= 0;
  
  return {
    dailyDeficit,
    isAchievable,
    weeksToGoal: Math.round(daysRemaining / 7 * 10) / 10,
  };
}

/**
 * Calculate "Real Weight" - 7-day rolling average
 * Smooths out water weight fluctuations
 */
export function calculateRealWeight(weights: { date: Date; weight: number }[]): number | null {
  const last7Days = weights
    .filter(w => w.weight)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 7);
  
  if (last7Days.length === 0) return null;
  
  const sum = last7Days.reduce((acc, w) => acc + w.weight, 0);
  return Math.round((sum / last7Days.length) * 10) / 10;
}

/**
 * Calculate daily surplus/deficit
 * Negative = deficit (good), Positive = surplus (bad)
 */
export function calculateDailyBalance(
  tdee: number,
  caloricIntake: number,
  caloricOuttake: number
): number {
  // TDEE is what you burn at rest
  // Outtake is additional exercise
  // Intake is what you ate
  const totalBurned = tdee + caloricOuttake;
  return caloricIntake - totalBurned; // Negative = deficit
}

/**
 * Predict weight in 30 days based on last 7 days data
 */
export function predictWeight30Days(
  currentRealWeight: number,
  last7DaysDeficits: number[]
): { predictedWeight: number; predictedChange: number } {
  if (last7DaysDeficits.length === 0) {
    return { predictedWeight: currentRealWeight, predictedChange: 0 };
  }
  
  const avgDailyDeficit = last7DaysDeficits.reduce((a, b) => a + b, 0) / last7DaysDeficits.length;
  const projectedTotalDeficit = avgDailyDeficit * 30;
  const projectedWeightChange = projectedTotalDeficit / KCAL_PER_KG;
  
  return {
    predictedWeight: Math.round((currentRealWeight - projectedWeightChange) * 10) / 10,
    predictedChange: Math.round(projectedWeightChange * 10) / 10,
  };
}

/**
 * Calculate protein goal (standard: 1.6-2.2g per kg body weight)
 */
export function calculateProteinGoal(weightKg: number, isActive: boolean = false): number {
  const multiplier = isActive ? 2.0 : 1.6;
  return Math.round(weightKg * multiplier);
}

/**
 * Calculate streak (consecutive days with caloric deficit)
 */
export function calculateStreak(dailyBalances: { date: Date; balance: number }[]): number {
  const sorted = dailyBalances
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  
  let streak = 0;
  for (const day of sorted) {
    if (day.balance < 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
```

---

## Folder Structure

```
losing-weight-is-math/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   └── onboarding/
│   │       └── page.tsx           # Multi-step onboarding flow
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard layout with sidebar
│   │   ├── page.tsx               # Main dashboard (the 4 cards + calendar)
│   │   ├── diary/
│   │   │   └── page.tsx           # AI Diary chatbot
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── subscribe/
│   │       └── page.tsx           # Pricing/subscription page
│   ├── (marketing)/
│   │   ├── layout.tsx
│   │   └── page.tsx               # Landing page
│   ├── stats/
│   │   └── page.tsx               # Admin stats dashboard
│   ├── api/
│   │   ├── ai/
│   │   │   └── parse/route.ts     # OpenAI food/exercise parsing
│   │   ├── stripe/
│   │   │   ├── create-checkout/route.ts
│   │   │   └── webhook/route.ts
│   │   └── stats/
│   │       └── route.ts           # Admin stats API
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                        # Shadcn components
│   ├── dashboard/
│   │   ├── stat-card.tsx
│   │   ├── calendar-grid.tsx
│   │   ├── day-modal.tsx
│   │   ├── weight-chart.tsx
│   │   └── protein-progress.tsx
│   ├── diary/
│   │   ├── chat-interface.tsx
│   │   ├── message-bubble.tsx
│   │   └── food-confirmation.tsx
│   ├── onboarding/
│   │   ├── step-indicator.tsx
│   │   └── goal-calculator.tsx
│   └── shared/
│       ├── navbar.tsx
│       ├── sidebar.tsx
│       └── paywall-overlay.tsx
├── lib/
│   ├── math.ts                    # All calculations
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── stripe.ts
│   ├── openai.ts
│   └── utils.ts
├── hooks/
│   ├── use-user.ts
│   ├── use-daily-log.ts
│   └── use-subscription.ts
├── types/
│   └── index.ts                   # TypeScript types matching DB schema
└── public/
    └── ...
```

---

## Page-by-Page Build Specifications

### 1. Landing Page (`/`)
**Purpose:** Convert visitors to sign-ups

**Hero Section:**
- Headline: "Weight loss isn't magic. It's math."
- Subheadline: "Track calories in, calories out. Watch the numbers do the work."
- CTA: "Start Your Free 7-Day Trial" → `/signup`
- Background: Subtle animated grid pattern, faint glow

**Social Proof Section:**
- "X kg lost by our users" (pull from stats)
- Testimonials (placeholder for now)

**How It Works:**
1. "Log your food and exercise by just talking" (show chat UI mockup)
2. "Watch your real weight trend down" (show chart mockup)
3. "Hit your goal with mathematical certainty"

**Pricing Preview:**
- Show pricing cards (builds anticipation)

---

### 2. Sign Up Flow (`/signup` → `/onboarding`)

**Step 1: Account Creation**
- Email input
- Password input
- "Continue with Google" button (Supabase OAuth)
- Phone number input (optional, for future 2FA)

**Step 2: Phone Verification** (if phone provided)
- OTP input
- "Resend code" link

**Step 3: Personal Info**
- First name
- Last name
- Date of birth (date picker)
- Country (searchable dropdown)
- Gender (Male / Female / Prefer not to say)

**Step 4: Body Stats**
- Current weight (kg or lbs toggle)
- Height (cm or ft/in toggle)
- Activity level (dropdown with descriptions)

**Step 5: Goal Setting** ⚡ THIS IS KEY
- Goal weight input
- Goal date picker
- **REAL-TIME CALCULATOR:**
  - As user adjusts date, show: "You'll need a daily deficit of X calories"
  - Color code: Green if <1000 (healthy), Yellow if 1000-1500 (aggressive), Red if >1500 (unsafe)
  - Show: "That's losing X kg per week"
  - Warning if unsustainable: "This might be too aggressive. Consider extending your goal date."

**Animation:** Smooth step transitions with Framer Motion, progress bar at top

---

### 3. Dashboard (`/dashboard`)

**Layout:**
- Sidebar (collapsible on mobile): Dashboard, AI Diary, Settings, Upgrade
- Main content area

**The 4 Stat Cards (top row):**

| Card | Title | Main Value | Subtext |
|------|-------|------------|---------|
| 1 | Today's Balance | `-420 kcal` | "Maintenance: 2,200 · In: 1,500 · Out: 280 · Protein: 85/120g" |
| 2 | 7-Day Balance | `-2,940 kcal` | "Averaging -420/day" |
| 3 | Real Weight | `78.3 kg` | "↓ 0.4 kg from last week" |
| 4 | 30-Day Prediction | `-1.8 kg` | "🔥 12 day streak" |

**Card Styling:**
- Dark surface background
- Large number in `font-display`
- Subtle glow based on status (green for deficit cards, gold for streak)
- Hover: slight lift + enhanced glow
- Click Card 1: Expand to show protein progress bar

**Calendar Grid:**
- 5-6 rows × 7 columns
- Today highlighted with accent border
- Each cell:
  - Large: weight (`78.5`)
  - Small: balance (`-320`)
  - Background: success-muted or danger-muted based on balance
  - Locked days (past trial): blur effect + lock icon
- Click cell → Day Modal

**Day Modal:**
- Date header
- Weight input (if not logged)
- List of food/exercise entries with calories
- Total summary
- Notes textarea
- "Edit in AI Diary" button

**Weight Progress Chart:**
- Line chart with two lines:
  1. Actual weight (data points connected)
  2. Projected weight (dotted line from start to goal)
- X-axis: dates
- Y-axis: weight
- Tooltip on hover showing exact values
- Goal weight as horizontal dotted line

---

### 4. AI Diary (`/dashboard/diary`)

**THIS IS THE KILLER FEATURE**

**Layout:**
- Chat interface (like iMessage/ChatGPT)
- Date selector at top (defaults to today)

**Chat Behavior:**

*User:* "just had 2 scrambled eggs and a slice of toast with butter"

*AI Response:*
```
Got it! Here's what I logged:

🍳 2 scrambled eggs — 180 kcal, 12g protein
🍞 1 slice toast with butter — 150 kcal, 3g protein

Total: 330 kcal, 15g protein

[✓ Confirm] [✏️ Edit] [✗ Cancel]
```

*User clicks Confirm → Entry saved to daily_logs*

*User:* "went for a 5k run, took about 30 minutes"

*AI Response:*
```
Nice work on the run! 🏃

Based on a 30-minute run at moderate pace:
🔥 ~320 calories burned

Does that sound right?

[✓ Confirm] [✏️ Edit] [✗ Cancel]
```

**AI Prompt Template (for OpenAI):**
```
You are a nutrition and fitness assistant. Parse the user's natural language input about food or exercise.

For FOOD:
- Identify each food item
- Estimate calories and protein (be reasonable, use common serving sizes)
- Format as a list

For EXERCISE:
- Identify the activity and duration
- Estimate calories burned (consider average adult)
- Be conservative in estimates

Always respond in a structured format that can be parsed:
{
  "type": "food" | "exercise",
  "items": [
    { "description": "...", "calories": N, "protein": N }
  ],
  "total_calories": N,
  "total_protein": N
}

Be conversational but concise. Use emojis sparingly.
```

**Chat UI Components:**
- Message bubbles (user right, AI left)
- Typing indicator (animated dots)
- Confirmation buttons styled as pills
- Quick-add buttons at bottom: "Add food", "Log exercise", "Log weight"

---

### 5. Subscription Flow (`/dashboard/subscribe`)

**Trigger:** 
- After 7-day trial, calendar days are locked
- "Upgrade" in sidebar pulses with gold

**Pricing Page:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Keep Your Momentum                        │
│         Your 7-day trial is over. Don't lose progress.      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────┐     ┌─────────────────────┐
│      Monthly        │     │       Annual        │
│                     │     │    ⭐ BEST VALUE    │
│    $24.95/month     │     │      $179/year      │
│                     │     │    ($14.92/month)   │
│                     │     │      Save 40%       │
│   [Select Plan]     │     │   [Select Plan]     │
└─────────────────────┘     └─────────────────────┘

            Have a referral code? [Enter code]
```

**Flow:**
1. User selects plan
2. If referral code entered, apply discount
3. Redirect to Stripe Checkout
4. On success, redirect to `/dashboard?upgraded=true`
5. Show confetti animation + "Welcome back!" toast

**Stripe Webhook Handler:**
- `checkout.session.completed` → Activate subscription
- `customer.subscription.updated` → Update status
- `customer.subscription.deleted` → Mark as canceled

---

### 6. Admin Stats (`/stats` or `stats.losingweightismath.com`)

**Access:** Hardcoded admin email check for now

**Metrics Dashboard:**
- Total Users
- Active Subscribers (monthly/annual breakdown)
- Trial → Paid Conversion Rate
- Daily Sign-ups (line chart)
- Total Weight Lost (sum of all users' weight loss) — **THE VANITY METRIC**
- Revenue (MRR, ARR estimates)

**Funnel Visualization:**
```
Visitors → Sign-ups → Completed Onboarding → Active (7+ days) → Paid
  1000   →    120    →         100         →       60        →  25
                                                           (20.8% conversion)
```

---

## Gamification Elements

1. **Streak Counter** — Fire emoji 🔥 with count, pulses when incremented
2. **Achievement Toasts** — "First deficit day!", "7-day streak!", "5kg lost!"
3. **Progress Rings** — Circular progress for daily protein goal
4. **Weight Milestones** — Confetti when hitting 5kg, 10kg lost markers
5. **Calendar Glow** — Successful days have a subtle green pulse on load
6. **Number Animations** — All stats count up from 0 on page load

---

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=your-email@example.com
```

---

## Manual Setup Steps (What You'll Need To Do)

### 1. Supabase Setup
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy the project URL and anon key to `.env.local`
3. Go to SQL Editor and run the schema SQL above
4. Enable Email auth in Authentication → Providers
5. (Optional) Enable Google OAuth

### 2. OpenAI Setup
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Add to `.env.local`
4. Ensure you have GPT-4o access (or use gpt-4o-mini for testing)

### 3. Stripe Setup
1. Go to [stripe.com](https://stripe.com) and create an account
2. Get API keys from Developers → API Keys
3. Create two Products:
   - "Monthly Plan" — $24.95/month recurring
   - "Annual Plan" — $179/year recurring
4. Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`
5. Select events: `checkout.session.completed`, `customer.subscription.*`
6. Copy webhook secret to `.env.local`

### 4. Vercel Deployment
1. Push to GitHub
2. Import to Vercel
3. Add all environment variables
4. Deploy

---

## Build Order (Suggested)

1. **Project Setup** — Next.js, Tailwind, Shadcn, folder structure
2. **Database** — Supabase connection, run schema
3. **Auth** — Login/signup pages, Supabase auth integration
4. **Math Engine** — `lib/math.ts` with all calculations
5. **Onboarding Flow** — Multi-step form with goal calculator
6. **Dashboard Layout** — Sidebar, basic structure
7. **Stat Cards** — The 4 main cards with real calculations
8. **Calendar Grid** — Day cells, click for modal
9. **Weight Chart** — Recharts implementation
10. **AI Diary** — Chat UI + OpenAI integration
11. **Subscription/Paywall** — Stripe integration, trial logic
12. **Stats Page** — Admin dashboard
13. **Polish** — Animations, edge cases, mobile responsive

---

## Final Notes

- **Mobile-first responsive** — Test at 375px width
- **Error boundaries** — Graceful fallbacks for API failures
- **Loading states** — Skeleton loaders for all async data
- **Accessibility** — Proper ARIA labels, keyboard navigation
- **Performance** — Keep bundle size lean, lazy load charts

Let's build the app that makes weight loss feel like watching a bank account grow. 📈


