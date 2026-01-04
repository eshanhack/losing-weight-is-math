import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { AIParseResponse } from "@/types";
import { createClient } from "@supabase/supabase-js";

// Lazy initialization of OpenAI client
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

// Create Supabase client for server-side operations
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey);
}

// User food memory - stores user's personal food nutrition data
interface UserFoodMemory {
  id: string;
  user_id: string;
  food_name: string; // normalized name (lowercase, trimmed)
  display_name: string; // how user typed it
  calories: number;
  protein_grams: number;
  created_at: string;
  updated_at: string;
}

// Get user's personalized food memory
async function getUserFoodMemory(userId: string, foodTerms: string[]): Promise<UserFoodMemory[]> {
  const supabase = getSupabase();
  if (!supabase || !userId || foodTerms.length === 0) return [];
  
  try {
    // Search for matching food items in user's memory
    const { data, error } = await supabase
      .from("user_food_memory")
      .select("*")
      .eq("user_id", userId)
      .or(foodTerms.map(term => `food_name.ilike.%${term.toLowerCase()}%`).join(","));
    
    if (error) {
      console.error("Error fetching user food memory:", error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error("Error in getUserFoodMemory:", error);
    return [];
  }
}

// API Ninjas Nutrition API for accurate nutrition data
// https://api-ninjas.com/api/nutrition
interface NutritionItem {
  name: string;
  calories: number;
  serving_size_g: number;
  fat_total_g: number;
  fat_saturated_g: number;
  protein_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  carbohydrates_total_g: number;
  fiber_g: number;
  sugar_g: number;
}

async function getNutritionData(query: string): Promise<NutritionItem[]> {
  const apiKey = process.env.API_NINJAS_KEY;
  if (!apiKey) {
    console.log("API Ninjas key not configured");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`,
      {
        headers: {
          "X-Api-Key": apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error("API Ninjas error:", response.status);
      return [];
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error("API Ninjas fetch error:", error);
    return [];
  }
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
When user wants to correct a previous entry (e.g., "the rice cakes had 70 cals each", "I think the banana is more like 70 calories", "actually each tuna can was 17g protein"):
- Identify item(s) to edit (search_term) - use a keyword that will match the logged entry
- Identify ALL values to update (calories, protein, or both)
- Use type "edit"
- If multiple items mentioned, handle each one
- IMPORTANT: Always return PER-UNIT values in updates. If user says "each rice cake is 70 cal", return 70, not the multiplied total. The frontend handles quantity multiplication.

Response format for EDIT:
{
  "type": "edit",
  "search_term": "rice cake",
  "updates": { "calories": 70, "protein": 1 },
  "items": [],
  "total_calories": 0,
  "total_protein": 0,
  "message": "📝 I'll update your rice cake entries to 70 cal each."
}

For MULTIPLE edits in one message (e.g., "rice cakes were 70 cal each, banana was 80 cal"):
{
  "type": "multi_edit",
  "edits": [
    { "search_term": "rice cake", "updates": { "calories": 70 } },
    { "search_term": "banana", "updates": { "calories": 80 } }
  ],
  "items": [],
  "total_calories": 0,
  "total_protein": 0,
  "message": "📝 I'll update your rice cake and banana entries."
}

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
    const { message, user_id } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check for edit/delete/weight operations first (don't need nutrition lookup)
    const lowerMessage = message.toLowerCase();
    
    // Expanded edit detection - catches conversational corrections
    const editPatterns = [
      /\b(update|change|correct|actually|edit|modify|fix|adjust)\b/,  // Direct edit words
      /\bi think\b.*\b(is|was|should be|more like|actually)\b/,  // "I think X is more like Y"
      /\b(had|has|have)\b.*\b(\d+)\s*(cal|kcal|calories)\b.*each/,  // "X had 70 cals each"
      /\bmore like\b.*\d+/,  // "more like 70 calories"
      /\bshould\s*(be|have)\b/,  // "should be 70 cal"
      /\bwas\s*(actually|really)\b/,  // "was actually 100 cal"
      /\bnot\s*\d+/,  // "not 100 calories"
      /\binstead\s*of\b/,  // "instead of 100"
      /\bwrong\b|\bmistake\b/,  // "that's wrong"
      /\beach\s*(had|has|is|was|were)\b.*\d+/,  // "each had 70 cal"
      /\bper\s*(cake|item|piece|serving)\b.*\d+/,  // "per cake is 70"
    ];
    
    const isEdit = editPatterns.some(pattern => pattern.test(lowerMessage)) && 
                   !/^(?:i ate|i had|i eat|just had|for breakfast|for lunch|for dinner)\b/.test(lowerMessage.trim());
    const isDelete = /\b(delete|remove|undo)\b/.test(lowerMessage);
    const isExercise = /\b(run|walk|jog|bike|swim|workout|exercise|gym|cycling|hiit|yoga|lift|weights)\b/.test(lowerMessage);
    
    // Check for weight entry (e.g., "I weigh 82kg", "my weight is 80.5", "82.3 kg today", "weight: 81")
    const weightMatch = lowerMessage.match(/(?:weigh|weight|scale|weighed|weighing)[:\s]+(\d+(?:\.\d+)?)\s*(?:kg|kilos?|pounds?|lbs?)?/i) ||
                        lowerMessage.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?)\s*(?:today|now|this morning)?/i) ||
                        lowerMessage.match(/(?:i'?m|i am)\s+(\d+(?:\.\d+)?)\s*(?:kg|kilos?)/i);
    
    if (weightMatch && !isEdit && !isDelete) {
      const weight = parseFloat(weightMatch[1]);
      if (weight > 20 && weight < 500) { // Sanity check for realistic weight
        return NextResponse.json({
          type: "weight",
          items: [],
          total_calories: 0,
          total_protein: 0,
          weight_kg: weight,
          message: `⚖️ Got it! I'll log your weight as ${weight} kg.`,
        } as AIParseResponse);
      }
    }

    // For food entries, get accurate nutrition data from API Ninjas AND user's personal memory
    let nutritionContext = "";
    let userMemoryContext = "";
    
    if (!isEdit && !isDelete && !isExercise) {
      // Extract potential food terms from the message for user memory lookup
      const foodTerms = message
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((word: string) => word.length > 2 && !["and", "with", "the", "for", "ate", "had", "some", "few"].includes(word));
      
      // Check user's personalized food memory FIRST (highest priority)
      if (user_id && foodTerms.length > 0) {
        const userMemory = await getUserFoodMemory(user_id, foodTerms);
        if (userMemory.length > 0) {
          userMemoryContext = `\n\n## USER'S PERSONAL FOOD DATA (HIGHEST PRIORITY - always use these over API data):
${userMemory.map(item => 
  `- ${item.display_name}: ${item.calories} cal, ${item.protein_grams}g protein (user's custom values)`
).join("\n")}

CRITICAL: The user has previously corrected these food values. ALWAYS use the USER'S PERSONAL FOOD DATA above for these items!`;
        }
      }
      
      const nutritionData = await getNutritionData(message);
      if (nutritionData.length > 0) {
        nutritionContext = `\n\n## VERIFIED NUTRITION DATA (from API Ninjas database - use if not in user's personal data):
${nutritionData.map(item => 
  `- ${item.name}: ${Math.round(item.calories)} cal, ${Math.round(item.protein_g)}g protein per ${item.serving_size_g}g serving`
).join("\n")}

Use the verified nutrition data above for accuracy. Only estimate if an item isn't in the verified data.`;
      }
    }

    // Check if OpenAI is configured
    const openai = getOpenAI();
    if (!openai) {
      // If no OpenAI but we have API Ninjas data, use it directly
      const nutritionData = await getNutritionData(message);
      if (nutritionData.length > 0) {
        return NextResponse.json(buildResponseFromNutritionData(nutritionData, message));
      }
      // Fall back to mock response
      return NextResponse.json(getMockResponse(message));
    }

    // Build the prompt with user memory (highest priority) + nutrition context
    const enhancedPrompt = SYSTEM_PROMPT + userMemoryContext + nutritionContext;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: enhancedPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 1500,
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

    // Try API Ninjas as fallback
    try {
      const { message } = await request.json();
      const nutritionData = await getNutritionData(message);
      if (nutritionData.length > 0) {
        return NextResponse.json(buildResponseFromNutritionData(nutritionData, message));
      }
    } catch {
      // Ignore fallback errors
    }

    // Return an error response - UI will hide log/cancel buttons
    return NextResponse.json({
      type: "food",
      items: [],
      total_calories: 0,
      total_protein: 0,
      message:
        "I couldn't quite understand that. Could you be more specific about what you ate or what exercise you did?",
      is_error: true,
    } as AIParseResponse);
  }
}

// Build response directly from API Ninjas data (when OpenAI is unavailable)
function buildResponseFromNutritionData(data: NutritionItem[], originalMessage: string): AIParseResponse {
  const items = data.map(item => ({
    description: item.name.charAt(0).toUpperCase() + item.name.slice(1),
    calories: Math.round(item.calories),
    protein: Math.round(item.protein_g),
    emoji: getEmojiForFood(item.name),
  }));

  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = items.reduce((sum, item) => sum + item.protein, 0);

  return {
    type: "food",
    items,
    total_calories: totalCalories,
    total_protein: totalProtein,
    message: `Got it! 🍽️ Logged ${items.length} item${items.length > 1 ? "s" : ""} (verified nutrition data).`,
  };
}

// Get appropriate emoji for food item
function getEmojiForFood(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("egg")) return "🍳";
  if (lowerName.includes("chicken")) return "🍗";
  if (lowerName.includes("beef") || lowerName.includes("steak")) return "🥩";
  if (lowerName.includes("fish") || lowerName.includes("tuna") || lowerName.includes("salmon")) return "🐟";
  if (lowerName.includes("rice")) return "🍚";
  if (lowerName.includes("bread") || lowerName.includes("toast")) return "🍞";
  if (lowerName.includes("banana")) return "🍌";
  if (lowerName.includes("apple")) return "🍎";
  if (lowerName.includes("orange")) return "🍊";
  if (lowerName.includes("yogurt") || lowerName.includes("milk")) return "🥛";
  if (lowerName.includes("cheese")) return "🧀";
  if (lowerName.includes("salad") || lowerName.includes("vegetable")) return "🥗";
  if (lowerName.includes("pizza")) return "🍕";
  if (lowerName.includes("burger")) return "🍔";
  if (lowerName.includes("coffee")) return "☕";
  if (lowerName.includes("avocado")) return "🥑";
  if (lowerName.includes("berry") || lowerName.includes("blueberry")) return "🫐";
  if (lowerName.includes("kiwi")) return "🥝";
  return "🍽️";
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

