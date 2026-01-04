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

## CRITICAL RULES:
1. ALWAYS parse food entries, even complex multi-item meals
2. If the user provides specific protein values (e.g., "17g protein"), USE THOSE EXACT VALUES
3. Break down complex entries into individual items
4. Estimate calories based on reasonable serving sizes
5. NEVER return "unknown item" - always make your best estimate

## For NEW FOOD entries:
- Identify EACH food item mentioned, even in long lists
- If user provides protein amounts, use those exact values
- Estimate calories using common nutritional data
- Use appropriate food emojis for each item
- For mixed dishes, break them into components
- If quantities aren't specified, assume reasonable single servings

## Common nutritional estimates per serving:
- Can of tuna: 100-120 cal, 25g protein (unless specified otherwise)
- Can of salmon: 120-150 cal, 20g protein
- Greek yogurt (100g): 60-100 cal, 10g protein
- Cottage cheese (100g): 80-100 cal, 11g protein
- Rice cake: 35-50 cal, 1g protein
- Banana (medium): 105 cal, 1g protein
- Blueberries (20): 15-20 cal, 0g protein
- Kiwi fruit: 40-50 cal, 1g protein
- Honey (1 tbsp): 60 cal, 0g protein
- Mayo/Sriracha mayo (1 tbsp): 90-100 cal, 0g protein

## For EXERCISE entries:
- Identify the activity and duration
- Estimate calories burned (consider average adult)
- Use appropriate activity emojis

## For EDIT/CORRECTION requests:
When user wants to correct a previous entry:
- Identify item to edit (search_term)
- Identify values to update
- Use type "edit"

## For DELETE requests:
When user wants to remove an entry:
- Identify item to delete (search_term)
- Use type "delete"

## Response Format for FOOD:
{
  "type": "food",
  "items": [
    { "description": "item name with quantity", "calories": number, "protein": number, "emoji": "🍳" }
  ],
  "total_calories": sum of all calories,
  "total_protein": sum of all protein,
  "message": "Brief friendly confirmation with emojis"
}

## Example - Complex meal:
User: "I ate: can of tuna (17g protein), can of salmon (17g protein) mixed with greek yogurt, cottage cheese and sriracha mayo. 3 rice cakes, half a banana with honey. 20 blueberries, 1 kiwi, 130g greek yogurt"

Response: {"type":"food","items":[{"description":"Can of tuna","calories":100,"protein":17,"emoji":"🐟"},{"description":"Can of salmon","calories":120,"protein":17,"emoji":"🐟"},{"description":"Greek yogurt (tbsp)","calories":30,"protein":3,"emoji":"🥛"},{"description":"Cottage cheese","calories":80,"protein":11,"emoji":"🧀"},{"description":"Sriracha mayo","calories":90,"protein":0,"emoji":"🌶️"},{"description":"3 rice cakes","calories":105,"protein":3,"emoji":"🍘"},{"description":"Half banana","calories":50,"protein":1,"emoji":"🍌"},{"description":"Honey drizzle","calories":30,"protein":0,"emoji":"🍯"},{"description":"20 blueberries","calories":16,"protein":0,"emoji":"🫐"},{"description":"1 kiwi","calories":42,"protein":1,"emoji":"🥝"},{"description":"130g greek yogurt","calories":85,"protein":13,"emoji":"🥛"}],"total_calories":748,"total_protein":66,"message":"Logged your meal! 🐟🥛🍌 That's a protein-packed feast!"}

Only respond with valid JSON, no additional text.`;

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
      max_tokens: 1500, // Increased for complex multi-item entries
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

// Food database for mock parsing
const FOOD_DATABASE: Record<string, { calories: number; protein: number; emoji: string }> = {
  // Proteins
  tuna: { calories: 100, protein: 25, emoji: "🐟" },
  salmon: { calories: 120, protein: 20, emoji: "🐟" },
  chicken: { calories: 165, protein: 31, emoji: "🍗" },
  egg: { calories: 90, protein: 6, emoji: "🍳" },
  eggs: { calories: 90, protein: 6, emoji: "🍳" },
  beef: { calories: 250, protein: 26, emoji: "🥩" },
  steak: { calories: 270, protein: 26, emoji: "🥩" },
  pork: { calories: 240, protein: 25, emoji: "🥓" },
  shrimp: { calories: 85, protein: 18, emoji: "🦐" },
  fish: { calories: 130, protein: 22, emoji: "🐟" },
  
  // Dairy
  yogurt: { calories: 100, protein: 10, emoji: "🥛" },
  "greek yogurt": { calories: 100, protein: 10, emoji: "🥛" },
  "cottage cheese": { calories: 100, protein: 11, emoji: "🧀" },
  cheese: { calories: 110, protein: 7, emoji: "🧀" },
  milk: { calories: 150, protein: 8, emoji: "🥛" },
  
  // Carbs
  rice: { calories: 200, protein: 4, emoji: "🍚" },
  "rice cake": { calories: 35, protein: 1, emoji: "🍘" },
  "rice cakes": { calories: 35, protein: 1, emoji: "🍘" },
  bread: { calories: 80, protein: 3, emoji: "🍞" },
  toast: { calories: 80, protein: 3, emoji: "🍞" },
  pasta: { calories: 220, protein: 8, emoji: "🍝" },
  oatmeal: { calories: 150, protein: 5, emoji: "🥣" },
  
  // Fruits
  banana: { calories: 105, protein: 1, emoji: "🍌" },
  apple: { calories: 95, protein: 0, emoji: "🍎" },
  blueberries: { calories: 1, protein: 0, emoji: "🫐" },
  blueberry: { calories: 1, protein: 0, emoji: "🫐" },
  kiwi: { calories: 42, protein: 1, emoji: "🥝" },
  orange: { calories: 62, protein: 1, emoji: "🍊" },
  strawberries: { calories: 4, protein: 0, emoji: "🍓" },
  avocado: { calories: 240, protein: 3, emoji: "🥑" },
  
  // Other
  honey: { calories: 60, protein: 0, emoji: "🍯" },
  mayo: { calories: 90, protein: 0, emoji: "🥫" },
  "sriracha mayo": { calories: 90, protein: 0, emoji: "🌶️" },
  coffee: { calories: 5, protein: 0, emoji: "☕" },
  pizza: { calories: 285, protein: 12, emoji: "🍕" },
  burger: { calories: 350, protein: 20, emoji: "🍔" },
  salad: { calories: 100, protein: 3, emoji: "🥗" },
  sandwich: { calories: 350, protein: 15, emoji: "🥪" },
};

// Mock response for development without OpenAI key
function getMockResponse(message: string): AIParseResponse {
  const lowerMessage = message.toLowerCase();

  // Detect if this is an edit/update request
  const editPatterns = [
    /update/i, /change/i, /correct/i, /actually/i, /edit/i, /modify/i, /fix/i,
    /adjust/i, /should\s+(?:be|have)/i, /was\s+(?:actually|really)/i,
    /not\s+\d+/i, /instead\s+of/i, /wrong/i, /mistake/i,
  ];
  const isEdit = editPatterns.some(pattern => pattern.test(lowerMessage)) && 
                 !lowerMessage.includes("i ate") && !lowerMessage.includes("i had");

  // Detect if this is a delete request
  const isDelete = /\b(delete|remove|undo)\b/.test(lowerMessage);

  if (isDelete) {
    const words = lowerMessage.split(/\s+/);
    const deleteIdx = words.findIndex(w => ["delete", "remove", "undo"].includes(w));
    const searchTerm = words.slice(deleteIdx + 1).join(" ").replace(/^the\s+/, "").split(/\s+/)[0] || "item";
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
    const proteinMatch = lowerMessage.match(/(\d+)\s*g(?:rams?)?\s*(?:of\s+)?(?:protein)?/i);
    const calorieMatch = lowerMessage.match(/(\d+)\s*(?:cal(?:ories)?|kcal)/i);
    const foodKeywords = Object.keys(FOOD_DATABASE);
    const searchTerm = foodKeywords.find(food => lowerMessage.includes(food)) || "item";
    
    const updates: { calories?: number; protein?: number } = {};
    if (proteinMatch) updates.protein = parseInt(proteinMatch[1]);
    if (calorieMatch) updates.calories = parseInt(calorieMatch[1]);
    
    if (Object.keys(updates).length > 0) {
      const updateParts = [];
      if (updates.protein !== undefined) updateParts.push(`${updates.protein}g protein`);
      if (updates.calories !== undefined) updateParts.push(`${updates.calories} calories`);
      return {
        type: "edit",
        search_term: searchTerm,
        updates,
        items: [],
        total_calories: 0,
        total_protein: 0,
        message: `📝 I'll update your ${searchTerm} entries to ${updateParts.join(" and ")}.`,
      };
    }
  }

  // Detect exercise
  const exerciseMatch = lowerMessage.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*(run|walk|jog|bike|swim|workout|exercise|gym)/i);
  if (exerciseMatch) {
    const duration = parseInt(exerciseMatch[1]) || 30;
    const activity = exerciseMatch[2];
    const caloriesPer30 = { run: 300, walk: 150, jog: 250, bike: 250, swim: 350, workout: 200, exercise: 200, gym: 250 };
    const calories = Math.round((caloriesPer30[activity as keyof typeof caloriesPer30] || 200) * (duration / 30));
    return {
      type: "exercise",
      items: [{ description: `${duration} minute ${activity}`, calories, protein: 0, emoji: "🏃" }],
      total_calories: calories,
      total_protein: 0,
      message: `Nice workout! 🏃 Logged ${duration} min ${activity}.`,
    };
  }

  // Parse food items - smart multi-item parsing
  const items: Array<{ description: string; calories: number; protein: number; emoji: string }> = [];
  
  // Split by common delimiters
  const parts = lowerMessage
    .replace(/i ate:?|i had:?|for breakfast:?|for lunch:?|for dinner:?/gi, "")
    .split(/[,\-\n•]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  for (const part of parts) {
    // Look for quantity patterns
    const quantityMatch = part.match(/^(\d+(?:\.\d+)?)\s*(?:x\s+)?(.+)/i) || 
                          part.match(/(.+?)\s*(?:\(|x\s*)(\d+)/i);
    
    // Check for user-provided protein
    const proteinProvided = part.match(/\(?\s*(\d+)\s*g\s*(?:of\s+)?protein\s*\)?/i);
    
    let quantity = 1;
    let foodPart = part;
    
    if (quantityMatch) {
      quantity = parseFloat(quantityMatch[1]) || 1;
      foodPart = quantityMatch[2] || part;
    }
    
    // Handle "half" quantities
    if (part.includes("half")) {
      quantity = 0.5;
      foodPart = part.replace(/half\s*(a\s+)?/i, "");
    }
    
    // Find matching food in database
    let matched = false;
    for (const [food, data] of Object.entries(FOOD_DATABASE)) {
      if (foodPart.includes(food)) {
        const protein = proteinProvided ? parseInt(proteinProvided[1]) : Math.round(data.protein * quantity);
        const calories = Math.round(data.calories * quantity);
        
        items.push({
          description: quantity !== 1 ? `${quantity} ${food}` : food.charAt(0).toUpperCase() + food.slice(1),
          calories,
          protein,
          emoji: data.emoji,
        });
        matched = true;
        break;
      }
    }
    
    // If no match, create a generic entry
    if (!matched && foodPart.length > 2) {
      const protein = proteinProvided ? parseInt(proteinProvided[1]) : 5;
      items.push({
        description: foodPart.replace(/\([^)]*\)/g, "").trim(),
        calories: 100,
        protein,
        emoji: "🍽️",
      });
    }
  }

  // If no items parsed, try to find individual foods in the whole message
  if (items.length === 0) {
    for (const [food, data] of Object.entries(FOOD_DATABASE)) {
      const regex = new RegExp(`(\\d+)?\\s*(?:cans?\\s+(?:of\\s+)?)?${food}s?`, "i");
      const match = lowerMessage.match(regex);
      if (match) {
        const quantity = parseInt(match[1]) || 1;
        const proteinMatch = lowerMessage.match(new RegExp(`${food}[^,]*?(\\d+)\\s*g\\s*(?:of\\s+)?protein`, "i"));
        const protein = proteinMatch ? parseInt(proteinMatch[1]) : data.protein * quantity;
        
        items.push({
          description: `${quantity > 1 ? quantity + " " : ""}${food}`,
          calories: data.calories * quantity,
          protein,
          emoji: data.emoji,
        });
      }
    }
  }

  // Still no items? Create a generic meal
  if (items.length === 0) {
    items.push({
      description: "Meal",
      calories: 400,
      protein: 20,
      emoji: "🍽️",
    });
  }

  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = items.reduce((sum, item) => sum + item.protein, 0);

  return {
    type: "food",
    items,
    total_calories: totalCalories,
    total_protein: totalProtein,
    message: `Got it! 🍽️ Logged ${items.length} item${items.length > 1 ? "s" : ""}.`,
  };
}

