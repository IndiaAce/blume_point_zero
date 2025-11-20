import React, { useState, useMemo } from 'react';
import { Entity, EntityType, Relationship } from '../types';
import { ShieldAlert, Bug, Download, Search, Filter, Eye, Code } from 'lucide-react';

interface EntityLibraryProps {
  entities: Entity[];
  relationships: Relationship[];
  onViewEntity: (e: Entity) => void;
}

const EntityLibrary: React.FC<EntityLibraryProps> = ({ entities, relationships, onViewEntity }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<EntityType | 'ALL'>('ALL');
  const [showTDM, setShowTDM] = useState<string | null>(null); // ID of entity to show TDM for

  const filteredEntities = useMemo(() => {
    return entities.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            e.aliases?.some(a => a.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = filterType === 'ALL' || e.type === filterType;
      // Hide Report nodes in this view usually, or keep them. Let's hide reports to focus on intelligence.
      return matchesSearch && matchesType && e.type !== EntityType.REPORT;
    });
  }, [entities, searchTerm, filterType]);

  const generateTDM = (entity: Entity) => {
    // Gather related IOCs
    const relatedIOCs = relationships
        .filter(r => (r.source === entity.id || r.target === entity.id))
        .map(r => {
             const otherId = r.source === entity.id ? r.target : r.source;
             const other = entities.find(e => e.id === otherId);
             return other;
        })
        .filter(e => e && (e.type === EntityType.IP_ADDRESS || e.type === EntityType.DOMAIN || e.type === EntityType.MALWARE));

    const tdm = {
        schema_version: "1.0.0",
        object_type: entity.type,
        primary_name: entity.name,
        aliases: entity.aliases || [],
        confidence: entity.confidenceScore,
        profile: {
            sectors_targeted: entity.sectors || [],
            tools_used: entity.tools || [],
            description: entity.description
        },
        indicators: relatedIOCs.map(ioc => ({
            type: ioc!.type,
            value: ioc!.name,
            relation: "LINKED_TO_ACTOR"
        })),
        meta: {
            generated_at: new Date().toISOString(),
            source_count: entity.sources.length
        }
    };

    return JSON.stringify(tdm, null, 2);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/50 backdrop-blur p-6 overflow-hidden">
      
      {/* Header / Controls */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Threat Data Model Library</h2>
          <p className="text-gray-400 text-sm">Manage normalized entities and export detection models.</p>
        </div>
        <div className="flex gap-3">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Search entities..." 
                    className="pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:border-cyber-accent outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="relative">
                <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <select 
                    className="pl-9 pr-8 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:border-cyber-accent outline-none appearance-none"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                >
                    <option value="ALL">All Types</option>
                    <option value={EntityType.THREAT_ACTOR}>Threat Actors</option>
                    <option value={EntityType.MALWARE}>Malware</option>
                    <option value={EntityType.TTP}>TTPs</option>
                </select>
            </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 gap-4">
            {filteredEntities.map(entity => (
                <div key={entity.id} className="bg-gray-800 border border-gray-700 rounded p-4 flex flex-col gap-4 hover:border-gray-600 transition-all">
                    <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${entity.type === EntityType.THREAT_ACTOR ? 'bg-red-900/20 text-red-500' : 'bg-blue-900/20 text-blue-500'}`}>
                                {entity.type === EntityType.THREAT_ACTOR ? <ShieldAlert className="w-6 h-6" /> : <Bug className="w-6 h-6" />}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    {entity.name}
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-400 font-mono">{entity.type}</span>
                                </h3>
                                <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-2">
                                    {entity.aliases?.map(a => (
                                        <span key={a} className="text-xs border border-gray-600 px-1.5 rounded text-gray-500">AKA: {a}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setShowTDM(showTDM === entity.id ? null : entity.id)}
                                className={`p-2 rounded hover:bg-gray-700 transition-colors ${showTDM === entity.id ? 'text-cyber-accent bg-cyber-accent/10' : 'text-gray-400'}`}
                                title="View Threat Data Model"
                            >
                                <Code className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => onViewEntity(entity)}
                                className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                title="View Graph Details"
                            >
                                <Eye className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* TDM Preview Panel */}
                    {showTDM === entity.id && (
                        <div className="bg-gray-950 rounded border border-gray-800 p-4 mt-2 animate-in fade-in slide-in-from-top-2">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold text-cyber-accent uppercase tracking-wider">Threat Data Model (JSON)</h4>
                                <button className="text-xs text-gray-500 hover:text-white flex items-center gap-1">
                                    <Download className="w-3 h-3" /> Export
                                </button>
                            </div>
                            <pre className="text-xs font-mono text-gray-300 overflow-x-auto p-2 bg-black/30 rounded">
                                {generateTDM(entity)}
                            </pre>
                        </div>
                    )}

                    <div className="flex gap-4 text-sm text-gray-500 border-t border-gray-700/50 pt-3 mt-1">
                        <div>
                            <span className="block text-xs uppercase font-semibold text-gray-600">Confidence</span>
                            <span className="text-gray-300">{(entity.confidenceScore * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                            <span className="block text-xs uppercase font-semibold text-gray-600">Sectors</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {entity.sectors && entity.sectors.length > 0 ? entity.sectors.slice(0,3).map(s => (
                                    <span key={s} className="px-1.5 bg-gray-700/50 rounded text-[10px]">{s}</span>
                                )) : <span>-</span>}
                            </div>
                        </div>
                        <div>
                            <span className="block text-xs uppercase font-semibold text-gray-600">Tools</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {entity.tools && entity.tools.length > 0 ? entity.tools.slice(0,3).map(t => (
                                    <span key={t} className="px-1.5 bg-gray-700/50 rounded text-[10px]">{t}</span>
                                )) : <span>-</span>}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default EntityLibrary;