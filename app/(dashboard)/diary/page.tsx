"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, AIParseResponse, LogEntry } from "@/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  parsedData?: AIParseResponse;
  confirmed?: boolean;
}

export default function DiaryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayEntries, setTodayEntries] = useState<LogEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchTodayEntries();
    loadChatHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTodayEntries = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get today's log
    const { data: log } = await supabase
      .from("daily_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .single();

    if (log) {
      const { data: entries } = await supabase
        .from("log_entries")
        .select("*")
        .eq("daily_log_id", log.id)
        .order("created_at", { ascending: true });

      if (entries) setTodayEntries(entries);
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
      // Add welcome message
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content:
            "Hey! 👋 What have you eaten or what exercise have you done today? Just tell me naturally, like \"had 2 eggs and toast for breakfast\" or \"went for a 30 min run\".",
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Call AI parsing API
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data: AIParseResponse = await response.json();

      const assistantMessage: Message = {
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
          {
            user_id: user.id,
            role: "assistant",
            content: data.message,
            log_date: today,
          },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "Sorry, I had trouble understanding that. Could you try again?",
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
      raw_input: messages.find((m) => m.id === (parseInt(messageId) - 1).toString())
        ?.content,
    }));

    await supabase.from("log_entries").insert(entries);

    // Update daily log totals
    const { data: allEntries } = await supabase
      .from("log_entries")
      .select("*")
      .eq("daily_log_id", log.id);

    if (allEntries) {
      const foodEntries = allEntries.filter((e) => e.entry_type === "food");
      const exerciseEntries = allEntries.filter(
        (e) => e.entry_type === "exercise"
      );

      const totalIntake = foodEntries.reduce((sum, e) => sum + e.calories, 0);
      const totalOuttake = exerciseEntries.reduce(
        (sum, e) => sum + e.calories,
        0
      );
      const totalProtein = foodEntries.reduce(
        (sum, e) => sum + (e.protein_grams || 0),
        0
      );

      await supabase
        .from("daily_logs")
        .update({
          caloric_intake: totalIntake,
          caloric_outtake: totalOuttake,
          protein_grams: totalProtein,
        })
        .eq("id", log.id);
    }

    // Mark as confirmed
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, confirmed: true } : m))
    );

    // Refresh entries
    fetchTodayEntries();

    // Add confirmation message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "✅ Logged! What else?",
        confirmed: true,
      },
    ]);
  };

  const totalIntake = todayEntries
    .filter((e) => e.entry_type === "food")
    .reduce((sum, e) => sum + e.calories, 0);

  const totalOuttake = todayEntries
    .filter((e) => e.entry_type === "exercise")
    .reduce((sum, e) => sum + e.calories, 0);

  const totalProtein = todayEntries
    .filter((e) => e.entry_type === "food")
    .reduce((sum, e) => sum + (e.protein_grams || 0), 0);

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold">AI Diary</h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Today's summary */}
      <Card className="p-4 mb-4 bg-card border-border">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Intake</p>
            <p className="font-display text-xl font-bold">
              {totalIntake.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">kcal</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exercise</p>
            <p className="font-display text-xl font-bold text-success">
              +{totalOuttake.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">kcal</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Protein</p>
            <p className="font-display text-xl font-bold">{totalProtein}</p>
            <p className="text-xs text-muted-foreground">grams</p>
          </div>
        </div>
      </Card>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>

                {/* Parsed items display */}
                {message.parsedData && !message.confirmed && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="space-y-2 text-sm">
                      {message.parsedData.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {"emoji" in item && item.emoji}{" "}
                            {item.description}
                          </span>
                          <span className="text-muted-foreground">
                            {item.calories} kcal
                            {"protein" in item && item.protein > 0 && (
                              <>, {item.protein}g protein</>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50 flex justify-between font-medium">
                      <span>Total</span>
                      <span>
                        {message.parsedData.total_calories} kcal
                        {message.parsedData.total_protein > 0 && (
                          <>, {message.parsedData.total_protein}g protein</>
                        )}
                      </span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(message.id)}
                        className="bg-success hover:bg-success/90"
                      >
                        ✓ Confirm
                      </Button>
                      <Button size="sm" variant="outline">
                        ✏️ Edit
                      </Button>
                      <Button size="sm" variant="ghost">
                        ✗ Cancel
                      </Button>
                    </div>
                  </div>
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
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <span
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What did you eat or what exercise did you do?"
          className="flex-1 bg-card border-border"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-primary hover:bg-primary/90"
        >
          Send
        </Button>
      </form>

      {/* Quick actions */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInput("I had ")}
          className="text-xs"
        >
          🍽️ Add food
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInput("I did ")}
          className="text-xs"
        >
          🏃 Log exercise
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInput("My weight today is ")}
          className="text-xs"
        >
          ⚖️ Log weight
        </Button>
      </div>
    </div>
  );
}

