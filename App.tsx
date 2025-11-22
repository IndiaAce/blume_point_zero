import React, { useState, useCallback, useEffect } from 'react';
import { Activity, Database, Layers, Shield, Network, FileText, Terminal, Save } from 'lucide-react';
import ForceGraph from './components/ForceGraph';
import IngestionPanel from './components/IngestionPanel';
import EntityDetails from './components/EntityDetails';
import EntityLibrary from './components/EntityLibrary';
import ThreatQuery from './components/ThreatQuery';
import { Entity, FeedItem, Relationship, EntityType, Report } from './types';
import { processTextLocal, mergeKnowledgeGraph } from './services/mlEngine';
import { enrichEntityProfile } from './services/geminiService';

type ViewMode = 'GRAPH' | 'LIBRARY' | 'QUERY';

const App: React.FC = () => {
  // --- State Management ---
  const [viewMode, setViewMode] = useState<ViewMode>('GRAPH');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [reports, setReports] = useState<Report[]>([]); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);

  // --- Persistence Logic ---
  useEffect(() => {
    const loadData = async () => {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const data = await response.json();
                if (data.entities) setEntities(data.entities);
                if (data.relationships) setRelationships(data.relationships);
                if (data.reports) setReports(data.reports);
                setRecentActivity(prev => ["System: Persistence data loaded.", ...prev]);
            }
        } catch (e) {
            console.error("Failed to load data", e);
            setRecentActivity(prev => ["System: Could not connect to storage server.", ...prev]);
        }
    };
    loadData();
  }, []);

  const saveWorkspace = async () => {
      try {
          const payload = { entities, relationships, reports };
          const res = await fetch('/api/data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (res.ok) {
             setRecentActivity(prev => [`System: Workspace saved to disk.`, ...prev]);
          } else {
             throw new Error("Save failed");
          }
      } catch (e) {
          setRecentActivity(prev => [`Error: Save failed. Is Docker running?`, ...prev]);
      }
  };

  // --- Logic ---

  // 1. LOCAL INGESTION PIPELINE
  const handleIngest = useCallback(async (items: FeedItem[]) => {
    setIsProcessing(true);
    
    let incomingEntities: Entity[] = [];
    let incomingRels: Relationship[] = [];

    for (const item of items) {
        setRecentActivity(prev => [`Ingesting: ${item.title}...`, ...prev]);

        // A. Create Report Node
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

        const reportEntity: Entity = {
            id: reportId,
            name: `REPORT: ${item.title}`,
            type: EntityType.REPORT,
            confidenceScore: 1,
            firstSeen: item.timestamp,
            lastSeen: item.timestamp,
            aliases: [],
            sources: [item.id],
            description: `Source: ${item.sourceName}\nURL: ${item.url}`,
            isEnriched: false,
            isValidated: true
        };
        incomingEntities.push(reportEntity);

        // B. Run Local ML Engine (Cortex)
        const result = processTextLocal(item.content, reportId);
        
        setRecentActivity(prev => [`Local ML: Extracted ${result.entities.length} entities from text.`, ...prev]);

        incomingEntities = [...incomingEntities, ...result.entities];
        
        // C. Link everything to Report
        result.entities.forEach(e => {
            incomingRels.push({
                source: reportId,
                target: e.id,
                type: "MENTIONS",
                weight: 1
            });
        });
        incomingRels = [...incomingRels, ...result.relationships];
    }

    // D. Normalize and Merge
    setEntities(prev => {
        const { merged, map } = mergeKnowledgeGraph(prev, incomingEntities);
        
        // Remap relationships to merged IDs
        setRelationships(prevRels => {
             const updatedIncomingRels = incomingRels.map(r => ({
                 ...r,
                 source: map.get(r.source) || r.source,
                 target: map.get(r.target) || r.target
             })).filter(r => r.source !== r.target);

             // Merge and dedupe relationships
             const combined = [...prevRels, ...updatedIncomingRels];
             // (Simple dedupe by stringifying)
             const unique = Array.from(new Set(combined.map(r => JSON.stringify(r)))).map(s => JSON.parse(s));
             return unique;
        });

        return merged;
    });

    setIsProcessing(false);
    // Trigger a save after ingestion
    setTimeout(saveWorkspace, 1000);
  }, [entities]); // Depend on entities for merge logic

  // 2. MANUAL ENRICHMENT (The AI Button)
  const handleEnrichment = async (entity: Entity) => {
      setRecentActivity(prev => [`AI: Enriching profile for ${entity.name}...`, ...prev]);
      try {
          const updates = await enrichEntityProfile(entity);
          
          setEntities(prev => prev.map(e => {
              if (e.id === entity.id) {
                  return { 
                      ...e, 
                      ...updates,
                      aliases: [...new Set([...e.aliases, ...(updates.aliases || [])])],
                      sectors: [...new Set([...(e.sectors || []), ...(updates.sectors || [])])],
                      tools: [...new Set([...(e.tools || []), ...(updates.tools || [])])],
                  };
              }
              return e;
          }));
          
          // Update the selected view immediately
          if (selectedEntity && selectedEntity.id === entity.id) {
              setSelectedEntity(prev => prev ? ({ ...prev, ...updates, isEnriched: true }) : null);
          }

          setRecentActivity(prev => [`AI: Enrichment complete for ${entity.name}.`, ...prev]);
          saveWorkspace();
      } catch (e) {
          setRecentActivity(prev => [`Error: Enrichment failed.`, ...prev]);
      }
  };

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
            <button 
              onClick={saveWorkspace}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-xs text-gray-300 transition-colors active:scale-95"
            >
                <Save className="w-3 h-3" /> Save Workspace
            </button>
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Cortex Local Engine Online
            </div>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Feed & Controls Column */}
          <div className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-xl">
            <IngestionPanel onIngest={handleIngest} isAnalyzing={isProcessing} />
            
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
          onEnrich={handleEnrichment}
        />
      )}

    </div>
  );
};

export default App;