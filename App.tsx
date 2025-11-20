import React, { useState, useCallback } from 'react';
import { Activity, Database, Layers, Shield, Network } from 'lucide-react';
import ForceGraph from './components/ForceGraph';
import IngestionPanel from './components/IngestionPanel';
import EntityDetails from './components/EntityDetails';
import { Entity, FeedItem, Relationship, AnalysisResult } from './types';
import { analyzeThreatText } from './services/geminiService';

const App: React.FC = () => {
  // --- State Management ---
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);

  // --- Logic ---

  const handleIngest = useCallback(async (item: FeedItem) => {
    setFeedItems(prev => [item, ...prev]);
    setIsAnalyzing(true);
    setRecentActivity(prev => [`Ingesting: ${item.title}...`, ...prev]);

    try {
      // 1. NLP/NER Extraction Phase
      const result: AnalysisResult = await analyzeThreatText(item.content, item.id);
      
      setRecentActivity(prev => [`NER Complete: Identified ${result.entities.length} entities in "${item.title}"`, ...prev]);

      // 2. Profile Enrichment & Normalization Engine
      setEntities(prevEntities => {
        const newEntities = [...prevEntities];
        const entityIdMap = new Map<string, string>(); // Map New_ID -> Existing_ID

        result.entities.forEach(incoming => {
          // Normalization Logic: Fuzzy match against Name and Aliases
          const existingIndex = newEntities.findIndex(e => {
            const nameMatch = e.name.toLowerCase() === incoming.name.toLowerCase();
            const aliasMatch = e.aliases?.some(a => a.toLowerCase() === incoming.name.toLowerCase()) || 
                               incoming.aliases?.some(a => a.toLowerCase() === e.name.toLowerCase());
            const crossAliasMatch = e.aliases?.some(ea => incoming.aliases?.some(ia => ia.toLowerCase() === ea.toLowerCase()));
            
            return (nameMatch || aliasMatch || crossAliasMatch) && e.type === incoming.type;
          });

          if (existingIndex >= 0) {
            // --- ENRICHMENT PHASE ---
            const existing = newEntities[existingIndex];
            entityIdMap.set(incoming.id, existing.id);
            
            // Merge Structured Data (Set Unions)
            const mergedAliases = [...new Set([...(existing.aliases || []), ...(incoming.aliases || [])])];
            const mergedSectors = [...new Set([...(existing.sectors || []), ...(incoming.sectors || [])])];
            const mergedTools = [...new Set([...(existing.tools || []), ...(incoming.tools || [])])];
            
            // Append temporal intelligence to description
            let newDescription = existing.description || "";
            if (incoming.description && !newDescription.includes(incoming.description)) {
              const dateStr = new Date().toLocaleDateString();
              newDescription += `\n\n[Intel Update ${dateStr}]: ${incoming.description}`;
            }

            // Update Profile
            newEntities[existingIndex] = {
              ...existing,
              aliases: mergedAliases,
              sectors: mergedSectors,
              tools: mergedTools,
              lastSeen: new Date().toISOString(),
              sources: [...new Set([...existing.sources, ...incoming.sources])],
              description: newDescription,
              confidenceScore: Math.max(existing.confidenceScore, incoming.confidenceScore)
            };
            
            setRecentActivity(prev => [`Enrichment: Updated profile for ${existing.name} (Added Sectors/Tools/Intel)`, ...prev]);
          } else {
            // --- NEW PROFILE CREATION ---
            newEntities.push(incoming);
            entityIdMap.set(incoming.id, incoming.id);
          }
        });

        // 3. Relationship Correlation
        setRelationships(prevRels => {
          const validRelationships = result.relationships.map(r => {
             const newSource = entityIdMap.get(r.source) || r.source;
             const newTarget = entityIdMap.get(r.target) || r.target;
             if (newSource === newTarget) return null; // Prevent self-loops
             return { ...r, source: newSource, target: newTarget };
          }).filter(Boolean) as Relationship[];

          // Deduplicate relationships
          const mergedRels = [...prevRels];
          validRelationships.forEach(newRel => {
            const exists = mergedRels.some(
              r => r.source === newRel.source && r.target === newRel.target && r.type === newRel.type
            );
            if (!exists) mergedRels.push(newRel);
          });
          
          return mergedRels;
        });

        return newEntities;
      });

    } catch (error) {
      console.error("Ingestion failed", error);
      setRecentActivity(prev => [`Error: Failed to analyze "${item.title}"`, ...prev]);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cyber-dark text-gray-100 font-sans selection:bg-cyber-accent selection:text-white">
      
      {/* Left Sidebar */}
      <div className="w-16 flex flex-col items-center py-6 bg-gray-900 border-r border-gray-800 gap-8 z-20">
        <div className="p-2 bg-cyber-accent/10 rounded-lg border border-cyber-accent/30">
          <Shield className="w-8 h-8 text-cyber-accent" />
        </div>
        <nav className="flex flex-col gap-6">
          <button className="p-3 rounded-xl bg-gray-800 text-white shadow-lg shadow-cyan-500/20 transition-all">
            <Network className="w-6 h-6" />
          </button>
          <button className="p-3 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800 transition-all">
            <Layers className="w-6 h-6" />
          </button>
          <button className="p-3 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800 transition-all">
            <Database className="w-6 h-6" />
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Top Header */}
        <header className="h-16 border-b border-gray-800 flex items-center px-6 justify-between bg-cyber-dark/95 backdrop-blur">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight text-white">ThreatNexus <span className="text-cyber-accent">Intel Graph</span></h1>
            <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400">
              Engine: Gemini NLP/NER
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Enrichment Active
            </div>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Feed & Controls Column */}
          <div className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-xl">
            <IngestionPanel onIngest={handleIngest} isAnalyzing={isAnalyzing} />
            
            {/* Activity Log */}
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              <div className="flex items-center gap-2 mb-3 text-gray-400 text-sm font-semibold uppercase tracking-wider">
                <Activity className="w-4 h-4" />
                Engine Activity
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
                {recentActivity.length === 0 && <span className="text-gray-600">Waiting for data stream...</span>}
                {recentActivity.map((log, i) => (
                  <div key={i} className="border-l-2 border-gray-700 pl-3 py-1 text-gray-400 animate-in slide-in-from-left-2 fade-in duration-300">
                    <span className="text-cyber-accent">[{new Date().toLocaleTimeString()}]</span> {log}
                  </div>
                ))}
              </div>
            </div>

            {/* Stats footer */}
            <div className="p-4 bg-gray-950 border-t border-gray-800 grid grid-cols-2 gap-4">
               <div>
                 <div className="text-2xl font-bold text-white">{entities.length}</div>
                 <div className="text-xs text-gray-500">Profiles Tracked</div>
               </div>
               <div>
                 <div className="text-2xl font-bold text-cyber-accent">{relationships.length}</div>
                 <div className="text-xs text-gray-500">Correlations</div>
               </div>
            </div>
          </div>

          {/* Visualization Area */}
          <div className="flex-1 relative bg-slate-900">
             <ForceGraph 
                entities={entities} 
                relationships={relationships}
                onNodeClick={setSelectedEntity}
             />

             {/* Legend */}
             <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur p-3 rounded border border-gray-700 text-xs pointer-events-none">
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Threat Actor</div>
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Malware</div>
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> IP Address</div>
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-cyan-500"></div> Domain</div>
             </div>
          </div>

        </div>
      </div>

      {/* Right Slide-over Detail Panel */}
      {selectedEntity && (
        <EntityDetails 
          entity={selectedEntity} 
          relationships={relationships} 
          allEntities={entities}
          onClose={() => setSelectedEntity(null)}
        />
      )}

    </div>
  );
};

export default App;