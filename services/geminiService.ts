import { GoogleGenAI, Type, Schema } from "@google/genai";
import { EntityType, Entity } from "../types";

// Helper to get API Key from window (injected by Docker)
const getApiKey = (): string => {
  if (typeof window !== 'undefined' && (window as any).__ENV__?.API_KEY) {
    return (window as any).__ENV__.API_KEY;
  }
  return process.env.API_KEY || '';
};

// Lazy initialization to handle key not being present immediately
const getAI = () => {
    const key = getApiKey();
    if (!key) return null;
    return new GoogleGenAI({ apiKey: key });
}

const MODEL_NAME = 'gemini-2.5-flash';

// Schema for targeted enrichment
const enrichmentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING, description: "A detailed technical biography of the threat entity." },
    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
    sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
    tools: { type: Type.ARRAY, items: { type: Type.STRING } },
    suspectedOrigin: { type: Type.STRING, description: "Country or region of origin if known." }
  },
  required: ["description", "sectors", "tools"]
};

/**
 * ENRICHMENT ONLY
 * This function is called manually by the user to "ask the AI" about a specific node 
 * that was found by our internal ML engine.
 */
export const enrichEntityProfile = async (entity: Entity): Promise<Partial<Entity>> => {
  try {
    const ai = getAI();
    if (!ai) throw new Error("API Key missing. Please check .env file.");

    const prompt = `
      I have a Threat Intelligence entity extracted from a report. 
      Name: "${entity.name}"
      Type: "${entity.type}"
      
      Please query your internal knowledge base to provide a detailed enrichment profile for this entity.
      Focus on TTPs, attribution, and target sectors.
      
      Rules:
      1. If the entity is unknown to you, return a generic description stating it was not found in training data.
      2. Be concise and technical.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: enrichmentSchema,
        temperature: 0.2,
      },
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error("No response from Gemini");

    const parsed = JSON.parse(rawJson);
    
    return {
      description: parsed.description,
      aliases: parsed.aliases || [],
      sectors: parsed.sectors || [],
      tools: parsed.tools || [],
      isEnriched: true
    };

  } catch (error) {
    console.error("Enrichment failed:", error);
    throw error;
  }
};