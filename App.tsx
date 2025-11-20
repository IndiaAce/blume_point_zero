import React, { useState, useCallback } from 'react';
import { Activity, Database, Layers, Shield, Network, FileText, Terminal } from 'lucide-react';
import ForceGraph from './components/ForceGraph';
import IngestionPanel from './components/IngestionPanel';
import EntityDetails from './components/EntityDetails';
import EntityLibrary from './components/EntityLibrary';
import ThreatQuery from './components/ThreatQuery';
import { Entity, FeedItem, Relationship, AnalysisResult, EntityType, Report } from './types';
import { analyzeThreatText } from './services/geminiService';

type ViewMode = 'GRAPH' | 'LIBRARY' | 'QUERY';

const App: React.FC = () => {
  // --- State Management ---
  const [viewMode, setViewMode] = useState<ViewMode>('GRAPH');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [reports, setReports] = useState<Report[]>([]); // Store source reports
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);

  // --- Logic ---

  const handleIngest = useCallback(async (items: FeedItem[]) => {
    setIsAnalyzing(true);
    
    for (const item of items) {
        setRecentActivity(prev => [`Ingesting: ${item.title}...`, ...prev]);

        try {
          // Create Report Node Metadata
          const reportId = crypto.randomUUID();
          const newReport: Report = {
              id: reportId,
              title: item.title,
              source: item.sourceName,
              timestamp: item.timestamp,
              url: item.url,
              summary: item.content.substring(0, 100) + "..."
          };
          setReports(prev => [newReport, ...prev]);

          // Create Report Entity for Graph
          const reportEntity: Entity = {
              id: reportId,
              name: `REPORT: ${item.title}`,
              type: EntityType.REPORT,
              confidenceScore: 1,
              firstSeen: item.timestamp,
              lastSeen: item.timestamp,
              aliases: [],
              sources: [item.id],
              description: `Source: ${item.sourceName}\nURL: ${item.url}`
          };

          // 1. NLP/NER Extraction Phase
          const result: AnalysisResult = await analyzeThreatText(item.content, item.id);
          
          setRecentActivity(prev => [`NER Complete: Identified ${result.entities.length} entities in "${item.title}"`, ...prev]);

          // 2. Profile Enrichment & Normalization Engine
          setEntities(prevEntities => {
            const newEntities = [...prevEntities];
            
            // Add Report Node if not exists
            if (!newEntities.find(e => e.id === reportId)) {
                newEntities.push(reportEntity);
            }

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
                
                const mergedAliases = [...new Set([...(existing.aliases || []), ...(incoming.aliases || [])])];
                const mergedSectors = [...new Set([...(existing.sectors || []), ...(incoming.sectors || [])])];
                const mergedTools = [...new Set([...(existing.tools || []), ...(incoming.tools || [])])];
                
                let newDescription = existing.description || "";
                if (incoming.description && !newDescription.includes(incoming.description)) {
                  const dateStr = new Date().toLocaleDateString();
                  newDescription += `\n\n[Intel Update ${dateStr}]: ${incoming.description}`;
                }

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
                 if (newSource === newTarget) return null; 
                 return { ...r, source: newSource, target: newTarget };
              }).filter(Boolean) as Relationship[];

              // Add Links from Report -> Entities
              result.entities.forEach(e => {
                 const targetId = entityIdMap.get(e.id) || e.id;
                 validRelationships.push({
                     source: reportId,
                     target: targetId,
                     type: "MENTIONS",
                     weight: 1
                 });
              });

              // Deduplicate
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
        }
    }
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cyber-dark text-gray-100 font-sans selection:bg-cyber-accent selection:text-white">
      
      {/* Left Sidebar */}
      <div className="w-16 flex flex-col items-center py-6 bg-gray-900 border-r border-gray-800 gap-8 z-20">
        <div className="p-2 bg-cyber-accent/10 rounded-lg border border-cyber-accent/30">
          <Shield className="w-8 h-8 text-cyber-accent" />
        </div>
        <nav className="flex flex-col gap-6">
          <button 
            onClick={() => setViewMode('GRAPH')}
            className={`p-3 rounded-xl transition-all ${viewMode === 'GRAPH' ? 'bg-gray-800 text-white shadow-lg shadow-cyan-500/20' : 'text-gray-500 hover:text-white'}`}
            title="Threat Graph"
          >
            <Network className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setViewMode('LIBRARY')}
            className={`p-3 rounded-xl transition-all ${viewMode === 'LIBRARY' ? 'bg-gray-800 text-white shadow-lg shadow-cyan-500/20' : 'text-gray-500 hover:text-white'}`}
            title="Entity Database"
          >
            <Database className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setViewMode('QUERY')}
            className={`p-3 rounded-xl transition-all ${viewMode === 'QUERY' ? 'bg-gray-800 text-white shadow-lg shadow-cyan-500/20' : 'text-gray-500 hover:text-white'}`}
            title="Query Engine"
          >
            <Terminal className="w-6 h-6" />
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Top Header */}
        <header className="h-16 border-b border-gray-800 flex items-center px-6 justify-between bg-cyber-dark/95 backdrop-blur">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight text-white">ThreatNexus <span className="text-cyber-accent">Intel Platform</span></h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 border-l border-gray-700 pl-4">
               <span>Reports Processed: {reports.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Engine Online
            </div>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Feed & Controls Column (Only show in Graph Mode or if user wants to ingest everywhere - let's keep it always visible for now as a dock) */}
          <div className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-xl">
            <IngestionPanel onIngest={handleIngest} isAnalyzing={isAnalyzing} />
            
            {/* Activity Log */}
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              <div className="flex items-center gap-2 mb-3 text-gray-400 text-sm font-semibold uppercase tracking-wider">
                <Activity className="w-4 h-4" />
                Ops Log
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
                {recentActivity.length === 0 && <span className="text-gray-600">Waiting for intelligence...</span>}
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
                 <div className="text-xs text-gray-500">Total Objects</div>
               </div>
               <div>
                 <div className="text-2xl font-bold text-cyber-accent">{relationships.length}</div>
                 <div className="text-xs text-gray-500">Correlations</div>
               </div>
            </div>
          </div>

          {/* Visualization / Library / Query Area */}
          <div className="flex-1 relative bg-slate-900 overflow-hidden">
             {viewMode === 'GRAPH' && (
                <>
                    <ForceGraph 
                        entities={entities} 
                        relationships={relationships}
                        onNodeClick={setSelectedEntity}
                    />
                     {/* Legend */}
                    <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur p-4 rounded border border-gray-700 text-xs pointer-events-none shadow-2xl z-50">
                        <h3 className="mb-2 font-bold text-gray-400 uppercase tracking-wider text-[10px]">Legend</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-white border border-gray-500"></div> Report Node</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow shadow-red-500/50"></div> Actor</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow shadow-orange-500/50"></div> Malware</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow shadow-purple-500/50"></div> TTP</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow shadow-yellow-500/50"></div> CVE</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow shadow-blue-500/50"></div> IP/Infra</div>
                        </div>
                    </div>
                </>
             )}

             {viewMode === 'LIBRARY' && (
                 <EntityLibrary 
                    entities={entities} 
                    relationships={relationships} 
                    onViewEntity={(e) => { setSelectedEntity(e); setViewMode('GRAPH'); }}
                 />
             )}

             {viewMode === 'QUERY' && (
                 <ThreatQuery 
                    entities={entities} 
                    relationships={relationships} 
                 />
             )}
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