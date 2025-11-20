export enum EntityType {
  THREAT_ACTOR = 'THREAT_ACTOR',
  MALWARE = 'MALWARE',
  IP_ADDRESS = 'IP_ADDRESS',
  DOMAIN = 'DOMAIN',
  CVE = 'CVE',
  TTP = 'TTP', // Tactics, Techniques, and Procedures
  ORGANIZATION = 'ORGANIZATION',
  LOCATION = 'LOCATION'
}

export interface Entity {
  id: string;
  name: string;
  aliases: string[]; // Alternative names for normalization (e.g., APT28, Fancy Bear)
  type: EntityType;
  confidenceScore: number;
  firstSeen: string;
  lastSeen: string;
  description?: string;
  // Enrichment Fields
  sectors?: string[]; // e.g. Financial, Defense, Healthcare
  tools?: string[]; // e.g. Cobalt Strike, Mimikatz
  sources: string[]; // IDs of feeds/articles
}

export interface Relationship {
  source: string; // Entity ID
  target: string; // Entity ID
  type: string; // e.g., "USES", "TARGETS", "ORIGINATES_FROM"
  weight: number;
}

export interface FeedItem {
  id: string;
  title: string;
  content: string; // The raw text to analyze
  sourceName: string; // e.g., "Google Threat Analysis Group"
  url: string;
  timestamp: string;
  processed: boolean;
}

export interface AnalysisResult {
  entities: Entity[];
  relationships: Relationship[];
  summary: string;
}

export interface GraphData {
  nodes: (Entity & { x?: number; y?: number; val?: number })[];
  links: (Relationship & { source: any; target: any })[];
}