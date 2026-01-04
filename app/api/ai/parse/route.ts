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

const SYSTEM_PROMPT = `You are a nutrition and fitness assistant for a calorie tracking app. Parse the user's natural language input about food or exercise.

For FOOD:
- Identify each food item mentioned
- Estimate calories and protein in grams (be reasonable, use common serving sizes)
- Use appropriate food emojis
- If quantities aren't specified, assume reasonable single servings

For EXERCISE:
- Identify the activity and duration
- Estimate calories burned (consider average adult, be conservative)
- Use appropriate activity emojis

Always respond with a valid JSON object in this exact format:
{
  "type": "food" or "exercise",
  "items": [
    { "description": "item name", "calories": number, "protein": number, "emoji": "🍳" }
  ],
  "total_calories": number,
  "total_protein": number,
  "message": "A friendly, brief confirmation message"
}

Be conversational but concise. Use emojis in the message.

Examples:
User: "2 eggs and toast"
Response: {"type":"food","items":[{"description":"2 eggs","calories":180,"protein":12,"emoji":"🍳"},{"description":"1 slice toast","calories":80,"protein":2,"emoji":"🍞"}],"total_calories":260,"total_protein":14,"message":"Got it! Here's what I logged:"}

User: "30 min run"
Response: {"type":"exercise","items":[{"description":"30 minute run","calories":300,"protein":0,"emoji":"🏃"}],"total_calories":300,"total_protein":0,"message":"Nice work! Here's what I logged:"}

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
      message: "Nice workout! Here's what I logged:",
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
      message: "Got it! Here's what I logged:",
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
    message: "Got it! Here's what I logged:",
  };
}

