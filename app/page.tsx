"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background bg-grid-pattern">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧮</span>
              <span className="font-display font-bold text-xl">
                Losing Weight is Math
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-primary hover:bg-primary/90">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              Weight loss isn't magic.
              <br />
              <span className="text-gradient">It's math.</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Track calories in vs calories out with AI-powered food logging.
            Watch your real weight trend down. Hit your goal with mathematical
            certainty.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/signup">
              <Button
                size="lg"
                className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 glow-accent"
              >
                Start Your Free 7-Day Trial
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              No credit card required
            </p>
          </motion.div>
        </div>
      </section>

      {/* The Math Preview */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            {/* Card 1: Today's Balance */}
            <Card className="p-6 bg-card border-border hover:border-success/50 transition-colors group">
              <p className="text-sm text-muted-foreground mb-2">Today's Balance</p>
              <p className="font-display text-4xl font-bold text-success">
                -420
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                kcal deficit
              </p>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Maintenance</span>
                  <span>2,200</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Intake</span>
                  <span>1,500</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Exercise</span>
                  <span>+280</span>
                </div>
              </div>
            </Card>

            {/* Card 2: 7-Day Balance */}
            <Card className="p-6 bg-card border-border hover:border-success/50 transition-colors">
              <p className="text-sm text-muted-foreground mb-2">7-Day Balance</p>
              <p className="font-display text-4xl font-bold text-success">
                -2,940
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                kcal total deficit
              </p>
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Averaging <span className="text-success">-420</span>/day
                </p>
              </div>
            </Card>

            {/* Card 3: Real Weight */}
            <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
              <p className="text-sm text-muted-foreground mb-2">Real Weight</p>
              <p className="font-display text-4xl font-bold">78.3</p>
              <p className="text-xs text-muted-foreground mt-2">kg (7-day avg)</p>
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-success">
                  ↓ 0.4 kg from last week
                </p>
              </div>
            </Card>

            {/* Card 4: 30-Day Prediction */}
            <Card className="p-6 bg-card border-border hover:border-gold/50 transition-colors">
              <p className="text-sm text-muted-foreground mb-2">30-Day Prediction</p>
              <p className="font-display text-4xl font-bold">-1.8</p>
              <p className="text-xs text-muted-foreground mt-2">kg projected</p>
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs">
                  <span className="text-gold">🔥 12</span> day streak
                </p>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="font-display text-3xl sm:text-4xl font-bold text-center mb-16"
          >
            How it works
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="text-3xl">💬</span>
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                Just talk to it
              </h3>
              <p className="text-muted-foreground">
                "Ate 2 eggs and avocado toast" — Our AI parses calories and
                protein automatically. No searching databases.
              </p>
            </motion.div>

            {/* Step 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-success/10 flex items-center justify-center">
                <span className="text-3xl">📊</span>
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                See your real weight
              </h3>
              <p className="text-muted-foreground">
                Daily weigh-ins averaged over 7 days. No more panicking over
                water weight fluctuations.
              </p>
            </motion.div>

            {/* Step 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gold/10 flex items-center justify-center">
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                Hit your goal
              </h3>
              <p className="text-muted-foreground">
                We calculate exactly what deficit you need. Follow the math,
                reach your target weight.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI Diary Preview */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="font-display text-3xl sm:text-4xl font-bold text-center mb-6"
          >
            Your AI food diary
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-center text-muted-foreground mb-12"
          >
            Just describe what you ate. The AI handles the rest.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <Card className="p-6 bg-card border-border">
              {/* Chat messages */}
              <div className="space-y-4">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
                    just had 2 scrambled eggs and a slice of toast with butter
                  </div>
                </div>

                {/* AI response */}
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 max-w-[80%]">
                    <p className="mb-3">Got it! Here's what I logged:</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>🍳 2 scrambled eggs</span>
                        <span className="text-muted-foreground">
                          180 kcal, 12g protein
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>🍞 1 slice toast with butter</span>
                        <span className="text-muted-foreground">
                          150 kcal, 3g protein
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex justify-between font-medium">
                      <span>Total</span>
                      <span>330 kcal, 15g protein</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" className="bg-success hover:bg-success/90">
                        ✓ Confirm
                      </Button>
                      <Button size="sm" variant="outline">
                        ✏️ Edit
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/50">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="font-display text-3xl sm:text-4xl font-bold text-center mb-4"
          >
            Simple pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-center text-muted-foreground mb-12"
          >
            Start with a 7-day free trial. Cancel anytime.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Monthly */}
            <Card className="p-8 bg-card border-border hover:border-primary/50 transition-colors">
              <h3 className="font-display text-xl font-semibold mb-2">
                Monthly
              </h3>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">$24.95</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground mb-8">
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Unlimited AI food
                  logging
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Daily weight tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Progress analytics
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Cancel anytime
                </li>
              </ul>
              <Button className="w-full" variant="outline">
                Start Free Trial
              </Button>
            </Card>

            {/* Annual */}
            <Card className="p-8 bg-card border-primary relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-gold text-background text-xs font-bold px-2 py-1 rounded">
                SAVE 40%
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">
                Annual
              </h3>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">$179</span>
                <span className="text-muted-foreground">/year</span>
                <p className="text-sm text-muted-foreground mt-1">
                  $14.92/month
                </p>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground mb-8">
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Everything in Monthly
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Priority support
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span> Early access to
                  features
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gold">✓</span> Save $120/year
                </li>
              </ul>
              <Button className="w-full bg-primary hover:bg-primary/90">
                Start Free Trial
              </Button>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="font-display text-3xl sm:text-4xl font-bold mb-6"
          >
            Ready to do the math?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-muted-foreground mb-8"
          >
            Join thousands of people who've discovered that weight loss is just
            simple arithmetic.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <Link href="/signup">
              <Button
                size="lg"
                className="text-lg px-8 py-6 bg-primary hover:bg-primary/90"
              >
                Start Your Free 7-Day Trial
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧮</span>
            <span className="font-display font-semibold">
              Losing Weight is Math
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Losing Weight is Math. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
