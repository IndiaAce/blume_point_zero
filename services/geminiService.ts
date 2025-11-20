import { GoogleGenAI, Type, Schema } from "@google/genai";
import { EntityType, AnalysisResult, Entity, Relationship } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

// --- NER & NLP Configuration ---
// This schema defines exactly what the AI should extract from the unstructured text.
const entitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A brief executive summary of the threat intelligence report.",
    },
    entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "The primary name of the entity (e.g., 'Lazarus Group')." },
          aliases: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Known aliases or alternative names found in text (e.g., 'APT38', 'Hidden Cobra')." 
          },
          type: { 
            type: Type.STRING, 
            enum: Object.values(EntityType),
            description: "The classification of the entity." 
          },
          sectors: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Industries or sectors targeted by this entity (e.g., 'Financial', 'Aerospace')."
          },
          tools: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Specific tools, malware families, or utilities used by this entity."
          },
          confidenceScore: { type: Type.NUMBER, description: "Confidence level 0-1." },
          description: { type: Type.STRING, description: "Specific details, capabilities, or observations about this entity from the text." }
        },
        required: ["name", "type", "confidenceScore"]
      }
    },
    relationships: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceEntityName: { type: Type.STRING },
          targetEntityName: { type: Type.STRING },
          relationshipType: { type: Type.STRING, description: "e.g., USES, TARGETS, COMMUNICATES_WITH, EXPLOITS" }
        },
        required: ["sourceEntityName", "targetEntityName", "relationshipType"]
      }
    }
  },
  required: ["summary", "entities", "relationships"]
};

export const analyzeThreatText = async (text: string, sourceId: string): Promise<AnalysisResult> => {
  try {
    // The System Prompt defines the behavior of the NLP Engine
    const prompt = `
      You are an advanced Cyber Threat Intelligence (CTI) Engine performing Named Entity Recognition (NER) and Relation Extraction.
      Your goal is to extract structured data to build and enrich profiles on Threat Actors, Malware, and Infrastructure.

      Analyze the following raw intelligence text. 
      
      Step 1: NLP Extraction
      Identify all relevant entities. Classify them accurately.
      
      Step 2: Normalization
      Look for synonyms. If text says "Lazarus (APT38)", extract "Lazarus" as name and "APT38" as alias.
      
      Step 3: Profile Enrichment Extraction
      - Extract 'sectors': What industries are being victimized?
      - Extract 'tools': What specific malware or utilities are mentioned?
      
      Step 4: Correlation
      Identify directional relationships between these entities.
      
      Text to analyze:
      """
      ${text}
      """
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: entitySchema,
        temperature: 0.1, // Low temperature ensures deterministic extraction
      },
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error("No response from Gemini");

    const parsed = JSON.parse(rawJson);
    const timestamp = new Date().toISOString();

    // Transform API response to internal App types
    const entityMap = new Map<string, string>();
    
    const entities: Entity[] = parsed.entities.map((e: any) => {
      const id = crypto.randomUUID();
      entityMap.set(e.name, id);
      
      // Map aliases to ID for relationship resolution
      if (e.aliases) {
        e.aliases.forEach((alias: string) => entityMap.set(alias, id));
      }

      return {
        id,
        name: e.name,
        aliases: e.aliases || [],
        type: e.type as EntityType,
        confidenceScore: e.confidenceScore,
        firstSeen: timestamp,
        lastSeen: timestamp,
        description: e.description,
        sectors: e.sectors || [],
        tools: e.tools || [],
        sources: [sourceId]
      };
    });

    const relationships: Relationship[] = parsed.relationships
      .map((r: any) => {
        const sourceId = entityMap.get(r.sourceEntityName);
        const targetId = entityMap.get(r.targetEntityName);
        
        if (sourceId && targetId) {
          return {
            source: sourceId,
            target: targetId,
            type: r.relationshipType,
            weight: 1
          };
        }
        return null;
      })
      .filter((r: Relationship | null) => r !== null);

    return {
      summary: parsed.summary,
      entities,
      relationships
    };

  } catch (error) {
    console.error("Error in analyzeThreatText:", error);
    throw error;
  }
};