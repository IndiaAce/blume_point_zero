import React, { useState, useRef } from 'react';
import { Plus, Rss, FileText, Loader2, Upload, FileJson } from 'lucide-react';
import { FeedItem } from '../types';

interface IngestionPanelProps {
  onIngest: (items: FeedItem[]) => void;
  isAnalyzing: boolean;
}

const SAMPLE_THREAT_DATA = `
The Lazarus Group (APT38) has recently targeted financial institutions using the "Manuscrypt" malware family. 
Activity was observed originating from IP address 104.168.44.12 and communicating with domain 'logon-update.com'.
This campaign exploits CVE-2024-1234 for initial access. 
Analysts also observed overlaps with 'AppleJeus' campaigns.
`;

const IngestionPanel: React.FC<IngestionPanelProps> = ({ onIngest, isAnalyzing }) => {
  const [inputType, setInputType] = useState<'rss' | 'text' | 'file'>('text');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('https://feeds.feedburner.com/TheHackersNews');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const handleIngest = async () => {
    if (inputType === 'text') {
      if (!content.trim()) return;
      const newItem: FeedItem = {
        id: crypto.randomUUID(),
        title: 'Manual Analyst Input',
        content: content,
        sourceName: 'Analyst Input',
        url: '',
        timestamp: new Date().toISOString(),
        processed: false
      };
      onIngest([newItem]);
      setContent('');
    } else if (inputType === 'file' && selectedFiles) {
      const items: FeedItem[] = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const text = await file.text();
        try {
          const json = JSON.parse(text);
          // Handle Array of items or single item (Feedly/Generic JSON support)
          const entries = Array.isArray(json) ? json : (json.items || [json]);
          
          entries.forEach((entry: any) => {
             items.push({
               id: crypto.randomUUID(),
               title: entry.title || entry.header || file.name,
               content: entry.content || entry.summary || entry.text || JSON.stringify(entry),
               sourceName: entry.origin?.title || 'File Upload',
               url: entry.canonicalUrl || '',
               timestamp: new Date().toISOString(),
               processed: false
             });
          });
        } catch (e) {
          console.error("Failed to parse file", file.name);
        }
      }
      onIngest(items);
      setSelectedFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else if (inputType === 'rss') {
       // Simulating RSS fetch
       const newItem: FeedItem = {
        id: crypto.randomUUID(),
        title: 'Simulated RSS Feed Entry',
        content: "Simulated fetch content from " + url,
        sourceName: 'RSS Feed',
        url: url,
        timestamp: new Date().toISOString(),
        processed: false
      };
      onIngest([newItem]);
    }
  };

  const loadSample = () => {
    setContent(SAMPLE_THREAT_DATA.trim());
    setInputType('text');
  };

  return (
    <div className="bg-cyber-panel border-b border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Plus className="w-5 h-5 text-cyber-accent" />
          Data Ingestion
        </h2>
        <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
          <button 
            onClick={() => setInputType('text')}
            className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 transition-colors ${inputType === 'text' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <FileText className="w-3 h-3" /> Text
          </button>
          <button 
            onClick={() => setInputType('file')}
            className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 transition-colors ${inputType === 'file' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <Upload className="w-3 h-3" /> Upload
          </button>
          <button 
            onClick={() => setInputType('rss')}
            className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 transition-colors ${inputType === 'rss' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <Rss className="w-3 h-3" /> Feed
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {inputType === 'text' && (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste threat report, email body, or logs here..."
              className="w-full h-32 bg-gray-900 text-gray-200 p-3 rounded border border-gray-700 focus:border-cyber-accent focus:outline-none font-mono text-sm"
            />
             <div className="mt-2 flex justify-end">
                <button 
                  onClick={loadSample} 
                  className="text-xs text-gray-400 hover:text-cyber-accent mr-auto underline"
                >
                  Load Sample Lazarus Data
                </button>
             </div>
          </div>
        )}

        {inputType === 'file' && (
          <div className="h-32 bg-gray-900 border-2 border-dashed border-gray-700 rounded flex flex-col items-center justify-center text-gray-400 hover:border-cyber-accent transition-colors">
             <input 
               type="file" 
               multiple
               accept=".json,.txt"
               ref={fileInputRef}
               onChange={(e) => setSelectedFiles(e.target.files)}
               className="hidden"
               id="file-upload"
             />
             <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <FileJson className="w-8 h-8 text-gray-500" />
                <span className="text-sm">{selectedFiles ? `${selectedFiles.length} file(s) selected` : 'Drop JSON files or Click to Upload'}</span>
                <span className="text-xs text-gray-600">Supports Feedly Exports & CTI JSON</span>
             </label>
          </div>
        )}

        {inputType === 'rss' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Feed URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-700 focus:border-cyber-accent focus:outline-none font-mono text-sm"
              placeholder="https://..."
            />
          </div>
        )}

        <button
          onClick={handleIngest}
          disabled={isAnalyzing || (inputType === 'text' && !content)}
          className={`w-full py-2 px-4 rounded font-medium flex items-center justify-center gap-2 transition-all
            ${isAnalyzing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-cyber-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyzing & Normalizing...
            </>
          ) : (
            <>
              Process Intelligence
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default IngestionPanel;