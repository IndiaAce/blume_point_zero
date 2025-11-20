import React from 'react';
import { X, ShieldAlert, Hash, Globe, Bug, Server, Fingerprint, Target, Briefcase } from 'lucide-react';
import { Entity, EntityType, Relationship } from '../types';

interface EntityDetailsProps {
  entity: Entity | null;
  relationships: Relationship[];
  allEntities: Entity[];
  onClose: () => void;
}

const EntityDetails: React.FC<EntityDetailsProps> = ({ entity, relationships, allEntities, onClose }) => {
  if (!entity) return null;

  const relatedEntities = relationships
    .filter(r => r.source === entity.id || r.target === entity.id)
    .map(r => {
      const otherId = r.source === entity.id ? r.target : r.source;
      const other = allEntities.find(e => e.id === otherId);
      return { relation: r.type, entity: other };
    })
    .filter(item => item.entity !== undefined);

  const getIcon = (type: EntityType) => {
    switch (type) {
      case EntityType.THREAT_ACTOR: return <ShieldAlert className="w-6 h-6 text-red-500" />;
      case EntityType.MALWARE: return <Bug className="w-6 h-6 text-orange-500" />;
      case EntityType.IP_ADDRESS: return <Server className="w-6 h-6 text-blue-500" />;
      case EntityType.DOMAIN: return <Globe className="w-6 h-6 text-cyan-500" />;
      case EntityType.TTP: return <Fingerprint className="w-6 h-6 text-purple-500" />;
      default: return <Hash className="w-6 h-6 text-gray-400" />;
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-[32rem] bg-cyber-panel border-l border-gray-700 shadow-2xl transform transition-transform z-10 flex flex-col">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-800/50">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          {getIcon(entity.type)}
          Profile Dossier
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        <div>
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Identity</label>
          <h1 className="text-3xl font-mono font-bold text-cyber-accent mt-1 tracking-tight break-words">{entity.name}</h1>
          
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-200 border border-gray-600">
              {entity.type}
            </span>
            {entity.aliases && entity.aliases.map(alias => (
              <span key={alias} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 border-dashed">
                AKA: {alias}
              </span>
            ))}
          </div>
        </div>

        {/* Enrichment Data: Sectors */}
        {entity.sectors && entity.sectors.length > 0 && (
          <div className="bg-gray-800/20 p-3 rounded border border-gray-700/50">
             <label className="text-xs text-gray-500 uppercase flex items-center gap-1 mb-2">
                <Briefcase className="w-3 h-3" /> Targeted Sectors
             </label>
             <div className="flex flex-wrap gap-1.5">
                {entity.sectors.map(s => (
                   <span key={s} className="px-2 py-0.5 text-[10px] bg-blue-900/20 text-blue-200 border border-blue-800 rounded">
                      {s}
                   </span>
                ))}
             </div>
          </div>
        )}

         {/* Enrichment Data: Tools */}
         {entity.tools && entity.tools.length > 0 && (
          <div className="bg-gray-800/20 p-3 rounded border border-gray-700/50">
             <label className="text-xs text-gray-500 uppercase flex items-center gap-1 mb-2">
                <Target className="w-3 h-3" /> Tools & Malware
             </label>
             <div className="flex flex-wrap gap-1.5">
                {entity.tools.map(t => (
                   <span key={t} className="px-2 py-0.5 text-[10px] bg-orange-900/20 text-orange-200 border border-orange-800 rounded">
                      {t}
                   </span>
                ))}
             </div>
          </div>
        )}

        {entity.description && (
          <div className="bg-gray-800/30 p-5 rounded-lg border border-gray-700">
            <label className="text-xs uppercase tracking-wider text-cyber-accent font-semibold mb-3 block flex items-center gap-2">
              <ActivityIcon /> Intelligence Dossier (Aggregated)
            </label>
            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line font-sans">
              {entity.description}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <label className="text-xs text-gray-500 uppercase">Confidence</label>
            <div className="text-xl font-mono text-white mt-1">
              {(entity.confidenceScore * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <label className="text-xs text-gray-500 uppercase">Sources</label>
            <div className="text-xl font-mono text-white mt-1">
              {entity.sources.length}
            </div>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
             <label className="text-xs text-gray-500 uppercase">Last Seen</label>
             <div className="text-xs font-mono text-white mt-2">
               {new Date(entity.lastSeen).toLocaleDateString()}
             </div>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 block">Correlated Graph Nodes</label>
          <div className="space-y-2">
            {relatedEntities.length > 0 ? (
              relatedEntities.map((rel, idx) => (
                <div key={idx} className="group flex items-center justify-between bg-gray-800 p-3 rounded border border-gray-700 hover:border-cyber-accent/50 transition-all cursor-pointer">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {getIcon(rel.entity!.type)}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{rel.entity!.name}</div>
                      <div className="text-xs text-gray-500">{rel.entity!.type}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-cyber-accent bg-blue-900/20 px-2 py-1 rounded border border-blue-900/30">
                    {rel.relation}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500 italic p-4 bg-gray-800/20 rounded border border-dashed border-gray-800 text-center">
                No direct correlations found.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

const ActivityIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export default EntityDetails;