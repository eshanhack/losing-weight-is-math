"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";
import type { AIParseResponse } from "@/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parsedData?: AIParseResponse;
  confirmed?: boolean;
}

export default function MobileDiaryPage() {
  const { refreshData } = useDashboard();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayStats, setTodayStats] = useState({ intake: 0, outtake: 0, protein: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadChatHistory();
    fetchTodayStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTodayStats = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: log } = await supabase
      .from("daily_logs")
      .select("caloric_intake, caloric_outtake, protein_grams")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .single();

    if (log) {
      setTodayStats({
        intake: log.caloric_intake || 0,
        outtake: log.caloric_outtake || 0,
        protein: log.protein_grams || 0,
      });
    }
  };

  const loadChatHistory = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: chatMessages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .order("created_at", { ascending: true });

    if (chatMessages && chatMessages.length > 0) {
      setMessages(
        chatMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          confirmed: true,
        }))
      );
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hey! 👋 What have you eaten or done today? Tell me anything like:\n\n• \"Had 2 eggs and toast for breakfast\"\n• \"Just finished a 30 min run\"\n• \"Coffee with oat milk\"",
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data: AIParseResponse = await response.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        parsedData: data,
        confirmed: false,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save to chat history
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("chat_messages").insert([
          { user_id: user.id, role: "user", content: input, log_date: today },
          { user_id: user.id, role: "assistant", content: data.message, log_date: today },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I had trouble understanding that. Could you try rephrasing?",
        },
      ]);
    }

    setLoading(false);
  };

  const handleConfirm = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.parsedData) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get or create today's log
    let { data: log } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .single();

    if (!log) {
      const { data: newLog } = await supabase
        .from("daily_logs")
        .insert({ user_id: user.id, log_date: today })
        .select()
        .single();
      log = newLog;
    }

    if (!log) return;

    // Add entries
    const entries = message.parsedData.items.map((item) => ({
      daily_log_id: log.id,
      entry_type: message.parsedData!.type,
      description: item.description,
      calories: item.calories,
      protein_grams: "protein" in item ? item.protein : 0,
      ai_parsed: true,
    }));

    await supabase.from("log_entries").insert(entries);

    // Recalculate totals
    const { data: allEntries } = await supabase
      .from("log_entries")
      .select("*")
      .eq("daily_log_id", log.id);

    if (allEntries) {
      const foodEntries = allEntries.filter((e) => e.entry_type === "food");
      const exerciseEntries = allEntries.filter((e) => e.entry_type === "exercise");

      const totalIntake = foodEntries.reduce((sum, e) => sum + e.calories, 0);
      const totalOuttake = exerciseEntries.reduce((sum, e) => sum + e.calories, 0);
      const totalProtein = foodEntries.reduce((sum, e) => sum + (e.protein_grams || 0), 0);

      await supabase
        .from("daily_logs")
        .update({
          caloric_intake: totalIntake,
          caloric_outtake: totalOuttake,
          protein_grams: totalProtein,
        })
        .eq("id", log.id);

      setTodayStats({ intake: totalIntake, outtake: totalOuttake, protein: totalProtein });
    }

    // Mark as confirmed
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, confirmed: true } : m))
    );

    // Add confirmation message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "✅ Logged! Keep going - what else did you have?",
        confirmed: true,
      },
    ]);

    // Refresh dashboard data
    refreshData();
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
        content: "No problem! Try describing it differently and I'll take another shot.",
        confirmed: true,
      },
    ]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Today's Stats Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-success/5">
        <h1 className="font-display font-semibold text-lg mb-3">AI Diary</h1>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Eaten</p>
            <p className="font-display font-bold text-lg">{todayStats.intake}</p>
            <p className="text-[10px] text-muted-foreground">kcal</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Burned</p>
            <p className="font-display font-bold text-lg text-success">+{todayStats.outtake}</p>
            <p className="text-[10px] text-muted-foreground">kcal</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Protein</p>
            <p className="font-display font-bold text-lg">{todayStats.protein}</p>
            <p className="text-[10px] text-muted-foreground">grams</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>

                {/* Parsed data card */}
                {message.parsedData && !message.confirmed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 p-3 rounded-lg bg-background/50 border border-border/50"
                  >
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      {message.parsedData.type === "food" ? "🍽️ Food" : "🏃 Exercise"}
                    </p>
                    <div className="space-y-2">
                      {message.parsedData.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span>{item.description}</span>
                          <span className="text-muted-foreground">{item.calories} kcal</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-border/50 flex justify-between font-medium">
                        <span>Total</span>
                        <span>{message.parsedData.total_calories} kcal</span>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleConfirm(message.id)}
                        className="flex-1 bg-success hover:bg-success/90 text-white"
                      >
                        ✓ Log it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(message.id)}
                        className="flex-1"
                      >
                        ✗ Wrong
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background/50 backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what you ate or did..."
            className="flex-1 bg-secondary border-0 h-12 text-base"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-12 w-12 bg-primary hover:bg-primary/90"
          >
            <span className="text-xl">→</span>
          </Button>
        </form>
      </div>
    </div>
  );
}

