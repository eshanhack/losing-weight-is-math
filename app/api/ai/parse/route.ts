import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { AIParseResponse } from "@/types";

// Lazy initialization of OpenAI client
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `You are a nutrition and fitness assistant for a calorie tracking app. Parse the user's natural language input about food, exercise, OR corrections/edits to previous entries.

## For NEW FOOD entries:
- Identify each food item mentioned
- Estimate calories and protein in grams (be reasonable, use common serving sizes)
- Use appropriate food emojis
- If quantities aren't specified, assume reasonable single servings

## For NEW EXERCISE entries:
- Identify the activity and duration
- Estimate calories burned (consider average adult, be conservative)
- Use appropriate activity emojis

## For EDIT/CORRECTION requests:
When the user wants to correct or update a previous entry (e.g., "actually the tuna had 17g protein each", "update my eggs to 100 calories", "change my breakfast calories"):
- Identify what item they want to edit (search_term)
- Identify what values to update (calories and/or protein)
- Use type "edit"

## For DELETE requests:
When the user wants to remove an entry (e.g., "delete the pizza", "remove my lunch"):
- Identify what item they want to delete (search_term)
- Use type "delete"

## Response Formats:

For FOOD/EXERCISE (new entries):
{
  "type": "food" or "exercise",
  "items": [{ "description": "item name", "calories": number, "protein": number, "emoji": "🍳" }],
  "total_calories": number,
  "total_protein": number,
  "message": "A friendly confirmation message"
}

For EDIT (corrections):
{
  "type": "edit",
  "search_term": "keyword to find the entry (e.g., 'tuna', 'eggs', 'breakfast')",
  "updates": { "calories": number (optional), "protein": number (optional) },
  "items": [],
  "total_calories": 0,
  "total_protein": 0,
  "message": "A friendly confirmation of the edit"
}

For DELETE:
{
  "type": "delete",
  "search_term": "keyword to find the entry",
  "items": [],
  "total_calories": 0,
  "total_protein": 0,
  "message": "A friendly confirmation of deletion"
}

## Examples:

User: "2 eggs and toast"
Response: {"type":"food","items":[{"description":"2 eggs","calories":180,"protein":12,"emoji":"🍳"},{"description":"1 slice toast","calories":80,"protein":2,"emoji":"🍞"}],"total_calories":260,"total_protein":14,"message":"Got it! 🍳 Logging 2 eggs and toast."}

User: "30 min run"
Response: {"type":"exercise","items":[{"description":"30 minute run","calories":300,"protein":0,"emoji":"🏃"}],"total_calories":300,"total_protein":0,"message":"Nice work! 🏃 Logging 30 minute run."}

User: "actually the tuna I had earlier had 17g of protein each, not 40g"
Response: {"type":"edit","search_term":"tuna","updates":{"protein":17},"items":[],"total_calories":0,"total_protein":0,"message":"Got it! 📝 I'll update your tuna entries to 17g protein each."}

User: "update my eggs to have 200 calories"
Response: {"type":"edit","search_term":"eggs","updates":{"calories":200},"items":[],"total_calories":0,"total_protein":0,"message":"Sure! 📝 Updating eggs to 200 calories."}

User: "delete the pizza I logged"
Response: {"type":"delete","search_term":"pizza","items":[],"total_calories":0,"total_protein":0,"message":"🗑️ I'll remove the pizza from your log."}

Only respond with the JSON object, no additional text.`;

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check if OpenAI is configured
    const openai = getOpenAI();
    if (!openai) {
      // Return mock response for development
      return NextResponse.json(getMockResponse(message));
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    // Parse the JSON response
    const parsed: AIParseResponse = JSON.parse(responseText);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("AI Parse error:", error);

    // Return a fallback response
    return NextResponse.json({
      type: "food",
      items: [
        {
          description: "Unknown item",
          calories: 0,
          protein: 0,
          emoji: "❓",
        },
      ],
      total_calories: 0,
      total_protein: 0,
      message:
        "I couldn't quite understand that. Could you be more specific about what you ate or what exercise you did?",
    } as AIParseResponse);
  }
}

// Mock response for development without OpenAI key
function getMockResponse(message: string): AIParseResponse {
  const lowerMessage = message.toLowerCase();

  // Detect if this is an edit/update request
  const isEdit =
    lowerMessage.includes("update") ||
    lowerMessage.includes("change") ||
    lowerMessage.includes("correct") ||
    lowerMessage.includes("actually") ||
    lowerMessage.includes("edit") ||
    (lowerMessage.includes("had") && lowerMessage.includes("not"));

  // Detect if this is a delete request
  const isDelete =
    lowerMessage.includes("delete") ||
    lowerMessage.includes("remove");

  if (isDelete) {
    // Try to find what they want to delete
    const words = lowerMessage.split(" ");
    const deleteIdx = words.findIndex(w => w === "delete" || w === "remove");
    const searchTerm = words.slice(deleteIdx + 1).join(" ").replace(/^the\s+/, "").split(" ")[0] || "item";
    
    return {
      type: "delete",
      search_term: searchTerm,
      items: [],
      total_calories: 0,
      total_protein: 0,
      message: `🗑️ I'll remove the ${searchTerm} from your log.`,
    };
  }

  if (isEdit) {
    // Try to extract the protein or calorie value and what to search for
    const proteinMatch = lowerMessage.match(/(\d+)\s*g(?:rams?)?\s*(?:of\s+)?protein/);
    const calorieMatch = lowerMessage.match(/(\d+)\s*(?:cal(?:ories)?|kcal)/);
    
    // Find the food item being referenced
    const foodKeywords = ["tuna", "egg", "chicken", "rice", "bread", "toast", "milk", "coffee", "lunch", "dinner", "breakfast"];
    const searchTerm = foodKeywords.find(food => lowerMessage.includes(food)) || "item";
    
    const updates: { calories?: number; protein?: number } = {};
    if (proteinMatch) updates.protein = parseInt(proteinMatch[1]);
    if (calorieMatch) updates.calories = parseInt(calorieMatch[1]);
    
    return {
      type: "edit",
      search_term: searchTerm,
      updates,
      items: [],
      total_calories: 0,
      total_protein: 0,
      message: `📝 I'll update your ${searchTerm} entries${updates.protein ? ` to ${updates.protein}g protein` : ""}${updates.calories ? ` to ${updates.calories} calories` : ""}.`,
    };
  }

  // Detect if exercise or food
  const isExercise =
    lowerMessage.includes("run") ||
    lowerMessage.includes("walk") ||
    lowerMessage.includes("exercise") ||
    lowerMessage.includes("gym") ||
    lowerMessage.includes("workout") ||
    lowerMessage.includes("bike") ||
    lowerMessage.includes("swim");

  if (isExercise) {
    return {
      type: "exercise",
      items: [
        {
          description: "Exercise session",
          calories: 300,
          protein: 0,
          emoji: "🏃",
        },
      ],
      total_calories: 300,
      total_protein: 0,
      message: "Nice workout! 🏃 Here's what I logged:",
    };
  }

  // Common food patterns
  if (lowerMessage.includes("egg")) {
    const count = lowerMessage.match(/(\d+)\s*egg/)?.[1] || "2";
    return {
      type: "food",
      items: [
        {
          description: `${count} eggs`,
          calories: parseInt(count) * 90,
          protein: parseInt(count) * 6,
          emoji: "🍳",
        },
      ],
      total_calories: parseInt(count) * 90,
      total_protein: parseInt(count) * 6,
      message: "Got it! 🍳 Here's what I logged:",
    };
  }

  // Default food response
  return {
    type: "food",
    items: [
      {
        description: "Meal",
        calories: 400,
        protein: 20,
        emoji: "🍽️",
      },
    ],
    total_calories: 400,
    total_protein: 20,
    message: "Got it! 🍽️ Here's what I logged:",
  };
}

