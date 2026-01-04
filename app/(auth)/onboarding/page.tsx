"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  calculateRequiredDailyDeficit,
  calculateAge,
  calculateBMR,
  calculateTDEE,
  ACTIVITY_DESCRIPTIONS,
  type ActivityLevel,
} from "@/lib/math";
import type { Gender } from "@/types";

const STEPS = [
  "Personal Info",
  "Body Stats",
  "Set Your Goal",
];

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "New Zealand",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedentary");
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDate, setGoalDate] = useState("");

  // Calculated values
  const [deficitAnalysis, setDeficitAnalysis] = useState<ReturnType<
    typeof calculateRequiredDailyDeficit
  > | null>(null);
  const [maintenanceCalories, setMaintenanceCalories] = useState<number | null>(null);

  // Calculate deficit in real-time when goal changes
  useEffect(() => {
    if (weight && goalWeight && goalDate && dateOfBirth && height) {
      const currentWeight = parseFloat(weight);
      const targetWeight = parseFloat(goalWeight);
      const targetDate = new Date(goalDate);
      const age = calculateAge(new Date(dateOfBirth));
      const heightCm = parseFloat(height);

      if (currentWeight && targetWeight && targetDate && age && heightCm) {
        const analysis = calculateRequiredDailyDeficit(
          currentWeight,
          targetWeight,
          targetDate
        );
        setDeficitAnalysis(analysis);

        // Calculate maintenance calories
        const bmr = calculateBMR(currentWeight, heightCm, age, gender);
        const tdee = calculateTDEE(bmr, activityLevel);
        setMaintenanceCalories(tdee);
      }
    }
  }, [weight, goalWeight, goalDate, dateOfBirth, height, gender, activityLevel]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Calculate trial end date (7 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email!,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
      country,
      gender,
      height_cm: parseFloat(height),
      starting_weight_kg: parseFloat(weight),
      current_weight_kg: parseFloat(weight),
      goal_weight_kg: parseFloat(goalWeight),
      goal_date: goalDate,
      activity_level: activityLevel,
    });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Create subscription with trial
    const { error: subError } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      status: "trialing",
      trial_ends_at: trialEndsAt.toISOString(),
    });

    if (subError) {
      console.error("Subscription error:", subError);
      // Don't block - subscription can be created later
    }

    router.push("/dashboard?welcome=true");
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return firstName && lastName && dateOfBirth && country && gender;
      case 1:
        return weight && height && activityLevel;
      case 2:
        return goalWeight && goalDate && deficitAnalysis?.isAchievable;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid-pattern flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step, index) => (
              <div
                key={step}
                className={`text-sm ${
                  index <= currentStep
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {step}
              </div>
            ))}
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{
                width: `${((currentStep + 1) / STEPS.length) * 100}%`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <Card className="p-8 bg-card border-border">
          <AnimatePresence mode="wait">
            {/* Step 1: Personal Info */}
            {currentStep === 0 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h1 className="font-display text-2xl font-bold mb-2">
                  Tell us about yourself
                </h1>
                <p className="text-muted-foreground mb-6">
                  We'll use this to personalize your experience
                </p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <select
                      id="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                    >
                      <option value="">Select country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["male", "female", "other"] as Gender[]).map((g) => (
                        <Button
                          key={g}
                          type="button"
                          variant={gender === g ? "default" : "outline"}
                          onClick={() => setGender(g)}
                          className="capitalize"
                        >
                          {g}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Body Stats */}
            {currentStep === 1 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h1 className="font-display text-2xl font-bold mb-2">
                  Your current stats
                </h1>
                <p className="text-muted-foreground mb-6">
                  We'll calculate your maintenance calories
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight">Current weight (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder="75.0"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="bg-background text-2xl font-display h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="height">Height (cm)</Label>
                    <Input
                      id="height"
                      type="number"
                      placeholder="175"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="bg-background text-2xl font-display h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Activity level</Label>
                    <div className="space-y-2">
                      {(Object.keys(ACTIVITY_DESCRIPTIONS) as ActivityLevel[]).map(
                        (level) => (
                          <Button
                            key={level}
                            type="button"
                            variant={activityLevel === level ? "default" : "outline"}
                            onClick={() => setActivityLevel(level)}
                            className="w-full justify-start text-left h-auto py-3"
                          >
                            <div>
                              <div className="font-medium capitalize">
                                {level.replace("_", " ")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {ACTIVITY_DESCRIPTIONS[level]}
                              </div>
                            </div>
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Goal */}
            {currentStep === 2 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h1 className="font-display text-2xl font-bold mb-2">
                  Set your goal
                </h1>
                <p className="text-muted-foreground mb-6">
                  What weight do you want to reach, and by when?
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="goalWeight">Goal weight (kg)</Label>
                    <Input
                      id="goalWeight"
                      type="number"
                      step="0.1"
                      placeholder="70.0"
                      value={goalWeight}
                      onChange={(e) => setGoalWeight(e.target.value)}
                      className="bg-background text-2xl font-display h-14"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goalDate">Target date</Label>
                    <Input
                      id="goalDate"
                      type="date"
                      value={goalDate}
                      onChange={(e) => setGoalDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="bg-background"
                    />
                  </div>

                  {/* Real-time calculation display */}
                  {deficitAnalysis && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-lg border ${
                        deficitAnalysis.riskLevel === "safe"
                          ? "border-success bg-success-muted/20"
                          : deficitAnalysis.riskLevel === "aggressive"
                          ? "border-gold bg-gold/10"
                          : "border-danger bg-danger-muted/20"
                      }`}
                    >
                      <div className="text-center mb-4">
                        <p className="text-sm text-muted-foreground mb-1">
                          Required daily deficit
                        </p>
                        <p
                          className={`font-display text-4xl font-bold ${
                            deficitAnalysis.riskLevel === "safe"
                              ? "text-success"
                              : deficitAnalysis.riskLevel === "aggressive"
                              ? "text-gold"
                              : "text-danger"
                          }`}
                        >
                          {deficitAnalysis.dailyDeficit.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          kcal/day
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-center text-sm">
                        <div>
                          <p className="text-muted-foreground">Weekly loss</p>
                          <p className="font-medium">
                            {deficitAnalysis.weeklyLoss} kg/week
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Time to goal</p>
                          <p className="font-medium">
                            {deficitAnalysis.weeksRemaining} weeks
                          </p>
                        </div>
                      </div>

                      {maintenanceCalories && (
                        <div className="mt-4 pt-4 border-t border-border text-center text-sm">
                          <p className="text-muted-foreground">
                            Your maintenance: {maintenanceCalories.toLocaleString()} kcal/day
                          </p>
                          <p className="text-muted-foreground">
                            Target intake: {(maintenanceCalories - deficitAnalysis.dailyDeficit).toLocaleString()} kcal/day
                          </p>
                        </div>
                      )}

                      <p
                        className={`mt-4 text-sm text-center ${
                          deficitAnalysis.riskLevel === "safe"
                            ? "text-success"
                            : deficitAnalysis.riskLevel === "aggressive"
                            ? "text-gold"
                            : "text-danger"
                        }`}
                      >
                        {deficitAnalysis.message}
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-danger-muted text-danger text-sm">
              {error}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={nextStep}
              disabled={!canProceed() || loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading
                ? "Setting up..."
                : currentStep === STEPS.length - 1
                ? "Start my journey"
                : "Continue"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}



