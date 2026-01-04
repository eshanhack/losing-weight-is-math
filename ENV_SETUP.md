# Environment Variables Setup

Create a `.env.local` file in the root directory with these variables:

```env
# ============================================
# LOSING WEIGHT IS MATH - Environment Variables
# ============================================

# Supabase
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
# Get this from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-key

# Stripe
# Get these from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_your-stripe-secret
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-publishable-key

# Stripe Price IDs (create products in Stripe Dashboard)
STRIPE_MONTHLY_PRICE_ID=price_monthly_id
STRIPE_ANNUAL_PRICE_ID=price_annual_id

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Admin (email for admin access to /stats)
ADMIN_EMAIL=your-email@example.com
```

## Setup Instructions

### 1. Supabase Setup
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy the project URL and anon key from Settings → API
3. Go to SQL Editor and run the schema from `CURSOR_PROMPT.md`
4. Enable Email auth in Authentication → Providers

### 2. OpenAI Setup
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key with GPT-4o access

### 3. Stripe Setup
1. Create account at [stripe.com](https://stripe.com)
2. Get API keys from Developers → API Keys
3. Create two Products:
   - "Monthly Plan" — $24.95/month recurring
   - "Annual Plan" — $179/year recurring
4. Note the Price IDs for each product

