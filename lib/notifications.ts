import { createClient } from "@/lib/supabase/client";

export type NotificationType = "food" | "exercise" | "edit" | "delete" | "weight" | "goal" | "streak" | "system";

interface NotificationData {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a notification to the database
 */
export async function logNotification(data: NotificationData): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    await supabase.from("notifications").insert({
      user_id: user.id,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata || {},
    });
  } catch (error) {
    // Silently fail if notifications table doesn't exist
    console.log("Notification logging skipped:", error);
  }
}

/**
 * Helper to create food log notification
 */
export function createFoodNotification(items: Array<{ description: string; calories: number; protein?: number }>) {
  const totalCals = items.reduce((sum, i) => sum + i.calories, 0);
  const totalProtein = items.reduce((sum, i) => sum + (i.protein || 0), 0);
  const itemNames = items.map(i => i.description).join(", ");
  
  return {
    type: "food" as NotificationType,
    title: "Food Logged",
    message: itemNames,
    metadata: { calories: totalCals, protein: totalProtein, items },
  };
}

/**
 * Helper to create exercise log notification
 */
export function createExerciseNotification(items: Array<{ description: string; calories: number }>) {
  const totalCals = items.reduce((sum, i) => sum + i.calories, 0);
  const itemNames = items.map(i => i.description).join(", ");
  
  return {
    type: "exercise" as NotificationType,
    title: "Exercise Logged",
    message: itemNames,
    metadata: { calories: totalCals, items },
  };
}

/**
 * Helper to create edit notification
 */
export function createEditNotification(searchTerm: string, updates: { calories?: number; protein?: number }, count: number) {
  const updateParts = [];
  if (updates.calories !== undefined) updateParts.push(`${updates.calories} cal`);
  if (updates.protein !== undefined) updateParts.push(`${updates.protein}g protein`);
  
  return {
    type: "edit" as NotificationType,
    title: "Entry Updated",
    message: `Updated ${count} "${searchTerm}" ${count === 1 ? "entry" : "entries"} to ${updateParts.join(" and ")}`,
    metadata: { searchTerm, updates, count },
  };
}

/**
 * Helper to create delete notification
 */
export function createDeleteNotification(searchTerm: string, count: number) {
  return {
    type: "delete" as NotificationType,
    title: "Entry Deleted",
    message: `Removed ${count} "${searchTerm}" ${count === 1 ? "entry" : "entries"}`,
    metadata: { searchTerm, count },
  };
}

/**
 * Helper to create weight log notification
 */
export function createWeightNotification(weight: number, date: string) {
  return {
    type: "weight" as NotificationType,
    title: "Weight Logged",
    message: `Recorded ${weight} kg for ${new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    metadata: { weight, date },
  };
}

