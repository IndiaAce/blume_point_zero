import React, { useState, useMemo } from 'react';
import { Entity, EntityType, Relationship } from '../types';
import { Terminal, Play, Download, AlertCircle, HelpCircle, CheckCircle2 } from 'lucide-react';

interface ThreatQueryProps {
  entities: Entity[];
  relationships: Relationship[];
}

interface QueryResultRow {
  id: string;
  [key: string]: any;
}

const ThreatQuery: React.FC<ThreatQueryProps> = ({ entities, relationships }) => {
  const [query, setQuery] = useState('FROM THREAT_ACTOR WHERE confidence > 50 SHOW MALWARE, SECTORS');
  const [results, setResults] = useState<QueryResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number>(0);

  const runQuery = () => {
    const start = performance.now();
    setError(null);
    setResults([]);

    try {
      // --- 1. LEXICAL PARSING (Basic) ---
      // Syntax: FROM <Type> [WHERE <conditions>] [SHOW <relations/fields>]
      const normalized = query.trim();
      const parts = normalized.match(/FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+SHOW\s+(.+))?$/i);

      if (!parts) {
        throw new Error("Invalid Syntax. Expected: FROM <Type> [WHERE ...] [SHOW ...]");
      }

      const [, targetTypeStr, whereClause, showClause] = parts;
      
      // Resolve Entity Type
      const targetType = Object.values(EntityType).find(t => t === targetTypeStr.toUpperCase());
      const isAll = targetTypeStr.toUpperCase() === 'ALL';
      
      if (!targetType && !isAll) {
        throw new Error(`Unknown Entity Type: ${targetTypeStr}. Valid types: ${Object.values(EntityType).join(', ')}`);
      }

      // --- 2. FILTERING (WHERE) ---
      let filtered = entities.filter(e => isAll || e.type === targetType);

      if (whereClause) {
        const conditions = whereClause.split(/\s+AND\s+/i); // Simple AND logic for now
        
        filtered = filtered.filter(entity => {
          return conditions.every(cond => {
            // Parse: <field> <operator> <value>
            const match = cond.match(/(\w+)\s*(==|!=|>|<|CONTAINS)\s*(.+)/i);
            if (!match) return true; // Ignore malformed?
            
            const [, field, op, valRaw] = match;
            let val = valRaw.replace(/['"]/g, '').trim(); // strip quotes
            
            // Resolve Entity Value
            let entityVal: any = (entity as any)[field];
            
            // Special handling for common fields
            if (field.toLowerCase() === 'confidence') {
                // Handle > 80 as > 0.8
                let numVal = parseFloat(val);
                if (numVal > 1) numVal = numVal / 100;
                return compare(entity.confidenceScore, op, numVal);
            }

            if (Array.isArray(entityVal)) {
                 // Array comparison (e.g. sectors contains "Finance")
                 if (op.toUpperCase() === 'CONTAINS') {
                     return entityVal.some(v => v.toLowerCase().includes(val.toLowerCase()));
                 }
                 return false; // Basic operators don't apply to arrays well in this simple parser
            }
            
            return compare(String(entityVal || '').toLowerCase(), op, String(val).toLowerCase());
          });
        });
      }

      // --- 3. PROJECTION / PIVOTING (SHOW) ---
      // This is where we join relationships or pick fields
      const mappedResults = filtered.map(entity => {
        const row: QueryResultRow = { 
            id: entity.id, 
            Type: entity.type, 
            Name: entity.name,
            Confidence: (entity.confidenceScore * 100).toFixed(0) + '%'
        };

        if (showClause) {
            const fieldsToShow = showClause.split(',').map(s => s.trim().toUpperCase());
            
            fieldsToShow.forEach(field => {
                // Check if field is an EntityType (Relationship pivot)
                const relatedType = Object.values(EntityType).find(t => t === field || t + 'S' === field); // plural check hack
                
                if (relatedType || field === 'MALWARE' || field === 'TOOLS') {
                     // FIND RELATED NODES
                     const related = relationships
                        .filter(r => (r.source === entity.id || r.target === entity.id))
                        .map(r => {
                            const otherId = r.source === entity.id ? r.target : r.source;
                            return entities.find(e => e.id === otherId);
                        })
                        .filter(e => e && (e.type === relatedType || (field === 'TOOLS' && e.type === EntityType.MALWARE)))
                        .map(e => e?.name);
                     
                     row[field] = related.length > 0 ? related.join(', ') : '-';
                } 
                else if (field === 'SECTORS') {
                    row['Sectors'] = entity.sectors?.join(', ') || '-';
                }
                else if (field === 'SOURCES') {
                    row['Source Count'] = entity.sources.length;
                }
            });
        }

        return row;
      });

      setResults(mappedResults);
      setExecutionTime(performance.now() - start);

    } catch (e: any) {
      setError(e.message);
    }
  };

  const compare = (a: any, op: string, b: any) => {
      switch (op) {
          case '==': return a == b;
          case '!=': return a != b;
          case '>': return a > b;
          case '<': return a < b;
          case 'CONTAINS': return String(a).includes(String(b));
          default: return false;
      }
  };

  const downloadReport = () => {
     if (results.length === 0) return;
     const headers = Object.keys(results[0]).filter(k => k !== 'id');
     const csv = [
         headers.join(','),
         ...results.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
     ].join('\n');
     
     const blob = new Blob([csv], { type: 'text/csv' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `threat_report_${new Date().getTime()}.csv`;
     a.click();
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200 font-mono">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-cyber-accent/20 rounded text-cyber-accent">
                    <Terminal className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="font-bold text-white">TQL Console</h2>
                    <p className="text-xs text-gray-500">Threat Query Language Engine</p>
                </div>
            </div>
            <div className="flex gap-2 text-xs text-gray-500">
               <div className="flex items-center gap-1 bg-gray-900 px-2 py-1 rounded border border-gray-800">
                  <HelpCircle className="w-3 h-3" />
                  <span>Syntax: FROM &lt;Type&gt; WHERE &lt;Field&gt; &lt;Op&gt; &lt;Value&gt; SHOW &lt;Relations&gt;</span>
               </div>
            </div>
        </div>

        {/* Query Editor */}
        <div className="p-4 bg-gray-950/50">
            <div className="relative">
                <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent outline-none font-mono leading-relaxed text-green-400"
                    spellCheck={false}
                />
                <button 
                    onClick={runQuery}
                    className="absolute bottom-3 right-3 bg-cyber-accent hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                >
                    <Play className="w-3 h-3 fill-current" /> Run
                </button>
            </div>
            
            {error && (
                <div className="mt-2 text-red-400 text-xs flex items-center gap-2 bg-red-900/10 p-2 rounded border border-red-900/30">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
                <div className="text-xs text-gray-400 flex gap-4">
                    <span>Status: {results.length > 0 ? 'Success' : 'Ready'}</span>
                    {executionTime > 0 && <span>Time: {executionTime.toFixed(2)}ms</span>}
                    <span>Rows: {results.length}</span>
                </div>
                <button 
                    onClick={downloadReport}
                    disabled={results.length === 0}
                    className={`text-xs flex items-center gap-1 px-3 py-1 rounded border transition-colors ${results.length > 0 ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-transparent text-gray-600 cursor-not-allowed'}`}
                >
                    <Download className="w-3 h-3" /> Export CSV
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {results.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                {Object.keys(results[0]).filter(k => k !== 'id').map(header => (
                                    <th key={header} className="sticky top-0 bg-gray-800 text-gray-400 text-xs uppercase font-semibold px-4 py-3 border-b border-gray-700">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((row, idx) => (
                                <tr key={row.id || idx} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                    {Object.keys(row).filter(k => k !== 'id').map(key => (
                                        <td key={key} className="px-4 py-3 text-sm text-gray-300">
                                            {key === 'Name' ? (
                                                <span className="font-bold text-white">{row[key]}</span>
                                            ) : row[key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                            <Terminal className="w-8 h-8 text-gray-500" />
                        </div>
                        <p>No results generated. Run a query to hunt for threats.</p>
                        <div className="text-xs bg-gray-800 p-3 rounded text-gray-400">
                             Try: <span className="text-green-400 font-mono">FROM THREAT_ACTOR SHOW MALWARE</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ThreatQuery;