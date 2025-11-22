import { Entity, EntityType, Relationship } from '../types';

/**
 * INTERNAL ML ENGINE (The "Cortex")
 * 
 * This service replaces the reliance on Gemini for initial extraction.
 * It uses deterministic algorithms, regex patterns, and heuristic NLP 
 * to process text locally.
 */

// --- 1. REGEX PATTERNS (Hard Indicators) ---
const PATTERNS = {
  IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  CVE: /CVE-\d{4}-\d{4,7}/gi,
  DOMAIN: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/gi,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

// --- 2. SEED LISTS (Knowledge Base) ---
// In a real python backend, this would be a vector database or larger model.
const KNOWN_ACTORS = ['APT28', 'Lazarus', 'Fancy Bear', 'Cozy Bear', 'Sandworm', 'Equation Group', 'OilRig', 'MuddyWater', 'Kimsuky', 'DarkSide'];
const KNOWN_MALWARE = ['Emotet', 'Trickbot', 'Cobalt Strike', 'Mimikatz', 'Ryuk', 'WannaCry', 'Pegasus', 'Manuscrypt', 'AppleJeus'];
const SECTORS = ['Financial', 'Defense', 'Healthcare', 'Energy', 'Government', 'Technology'];

interface ExtractionCandidate {
  name: string;
  type: EntityType;
  confidence: number;
  index: number; // Position in text for correlation
}

// --- 3. ALGORITHMS ---

// Jaccard Similarity for String Normalization
const getSimilarity = (str1: string, str2: string): number => {
  const set1 = new Set(str1.toLowerCase().split(''));
  const set2 = new Set(str2.toLowerCase().split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
};

export const processTextLocal = (text: string, sourceId: string): { entities: Entity[], relationships: Relationship[] } => {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  const timestamp = new Date().toISOString();
  const candidates: ExtractionCandidate[] = [];

  // A. Extract Hard Indicators (Regex)
  const extractRegex = (regex: RegExp, type: EntityType) => {
    let match;
    // Reset lastIndex to ensure global search works correctly
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
       // Filter out common False Positives for domains
       if (type === EntityType.DOMAIN) {
           const d = match[0].toLowerCase();
           if (d.endsWith('.png') || d.endsWith('.jpg') || d.length < 4 || !d.includes('.')) continue;
       }
       
       candidates.push({
         name: match[0],
         type: type,
         confidence: 0.95, // High confidence in regex
         index: match.index
       });
    }
  };

  extractRegex(PATTERNS.IP_ADDRESS, EntityType.IP_ADDRESS);
  extractRegex(PATTERNS.CVE, EntityType.CVE);
  extractRegex(PATTERNS.DOMAIN, EntityType.DOMAIN);

  // B. Extract Known Entities (Dictionary Match)
  KNOWN_ACTORS.forEach(actor => {
    const idx = text.toLowerCase().indexOf(actor.toLowerCase());
    if (idx !== -1) {
      candidates.push({ name: actor, type: EntityType.THREAT_ACTOR, confidence: 0.9, index: idx });
    }
  });
  KNOWN_MALWARE.forEach(mal => {
    const idx = text.toLowerCase().indexOf(mal.toLowerCase());
    if (idx !== -1) {
      candidates.push({ name: mal, type: EntityType.MALWARE, confidence: 0.9, index: idx });
    }
  });

  // C. Heuristic NER (Capitalized Phrases)
  // Look for patterns like "Operation [Capitalized]" or "[Capitalized] Group"
  const potentialGroups = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s(Group|Team|Spider|Panda|Kitten|Bear|Choillima)/g);
  if (potentialGroups) {
      potentialGroups.forEach(group => {
          candidates.push({ name: group, type: EntityType.THREAT_ACTOR, confidence: 0.75, index: text.indexOf(group) });
      });
  }

  // D. Convert Candidates to Entities (De-duplication)
  const uniqueMap = new Map<string, Entity>();
  
  candidates.forEach(cand => {
     // Simple normalization: Lowercase key
     const key = cand.name.toLowerCase();
     if (!uniqueMap.has(key)) {
         uniqueMap.set(key, {
             id: crypto.randomUUID(),
             name: cand.name,
             aliases: [],
             type: cand.type,
             confidenceScore: cand.confidence,
             firstSeen: timestamp,
             lastSeen: timestamp,
             sources: [sourceId],
             isEnriched: false,
             isValidated: false,
             description: `Extracted via internal engine heuristics.`
         });
     }
  });

  entities.push(...Array.from(uniqueMap.values()));

  // E. Positional Correlation (Proximity Logic)
  // If an Actor and an IP/Malware are within 250 characters, link them.
  const entityList = Array.from(uniqueMap.values());
  
  // We need the candidates again to get indices, matched to the created entities
  for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
          const c1 = candidates[i];
          const c2 = candidates[j];
          
          // Don't link same types (IP to IP) usually
          if (c1.type === c2.type) continue;

          // Distance check (Proximity)
          const distance = Math.abs(c1.index - c2.index);
          
          if (distance < 350) { // Window size
             // Find the actual Entity IDs
             const e1 = entityList.find(e => e.name.toLowerCase() === c1.name.toLowerCase());
             const e2 = entityList.find(e => e.name.toLowerCase() === c2.name.toLowerCase());
             
             if (e1 && e2) {
                 relationships.push({
                     source: e1.id,
                     target: e2.id,
                     type: "CORRELATED_TO", // Generic relation inferred from proximity
                     weight: 0.5 // Lower weight for heuristic proximity
                 });
             }
          }
      }
  }

  return { entities, relationships };
};

/**
 * NORMALIZATION UTILITY
 * Merges a new extraction result into the existing knowledge graph.
 */
export const mergeKnowledgeGraph = (currentEntities: Entity[], newEntities: Entity[]): { merged: Entity[], map: Map<string, string> } => {
    const idMap = new Map<string, string>(); // OldID -> NewID (or ExistingID)
    const result = [...currentEntities];

    newEntities.forEach(newE => {
        // 1. Exact Match
        let match = result.find(e => e.name.toLowerCase() === newE.name.toLowerCase());

        // 2. Fuzzy Match (Levenshtein/Jaccard)
        if (!match && newE.type === EntityType.THREAT_ACTOR) {
             match = result.find(e => {
                 return e.type === newE.type && getSimilarity(e.name, newE.name) > 0.8;
             });
        }

        if (match) {
            // Merge
            idMap.set(newE.id, match.id);
            match.lastSeen = newE.lastSeen;
            match.sources = [...new Set([...match.sources, ...newE.sources])];
            // If new one is higher confidence (e.g. from manual entry), bump score
            match.confidenceScore = Math.max(match.confidenceScore, newE.confidenceScore);
        } else {
            // Add New
            result.push(newE);
            idMap.set(newE.id, newE.id); // Maps to itself
        }
    });

    return { merged: result, map: idMap };
};