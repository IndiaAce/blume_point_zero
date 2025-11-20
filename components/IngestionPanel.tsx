import React, { useState } from 'react';
import { Plus, Rss, FileText, Loader2 } from 'lucide-react';
import { FeedItem } from '../types';

interface IngestionPanelProps {
  onIngest: (item: FeedItem) => void;
  isAnalyzing: boolean;
}

const SAMPLE_THREAT_DATA = `
The Lazarus Group (APT38) has recently targeted financial institutions using the "Manuscrypt" malware family. 
Activity was observed originating from IP address 104.168.44.12 and communicating with domain 'logon-update.com'.
This campaign exploits CVE-2024-1234 for initial access. 
Analysts also observed overlaps with 'AppleJeus' campaigns.
`;

const IngestionPanel: React.FC<IngestionPanelProps> = ({ onIngest, isAnalyzing }) => {
  const [inputType, setInputType] = useState<'rss' | 'text'>('text');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('https://feeds.feedburner.com/TheHackersNews'); // Example, though CORS usually blocks real fetch in browser

  const handleIngest = () => {
    if (inputType === 'text' && !content.trim()) return;
    
    const newItem: FeedItem = {
      id: crypto.randomUUID(),
      title: inputType === 'rss' ? 'Simulated RSS Feed Entry' : 'Manual Text Input',
      content: inputType === 'text' ? content : "Simulated fetch content from " + url,
      sourceName: inputType === 'rss' ? 'RSS Feed' : 'Analyst Input',
      url: inputType === 'rss' ? url : '',
      timestamp: new Date().toISOString(),
      processed: false
    };

    onIngest(newItem);
    setContent(''); // Clear text input
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
        <div className="flex gap-2 bg-gray-800 p-1 rounded-lg">
          <button 
            onClick={() => setInputType('text')}
            className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 transition-colors ${inputType === 'text' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <FileText className="w-4 h-4" /> Raw Text
          </button>
          <button 
            onClick={() => setInputType('rss')}
            className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 transition-colors ${inputType === 'rss' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <Rss className="w-4 h-4" /> Feed Connector
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {inputType === 'text' ? (
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
        ) : (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Feed URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-700 focus:border-cyber-accent focus:outline-none font-mono text-sm"
              placeholder="https://..."
            />
            <p className="text-xs text-yellow-600 mt-2">
              Note: Direct RSS fetching often blocked by CORS in browsers. This demo simulates the fetch step for RSS.
            </p>
          </div>
        )}

        <button
          onClick={handleIngest}
          disabled={isAnalyzing || (inputType === 'text' && !content)}
          className={`w-full py-2 px-4 rounded font-medium flex items-center justify-center gap-2 transition-all
            ${isAnalyzing || (inputType === 'text' && !content)
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-cyber-accent hover:bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Extracting Entities with Gemini...
            </>
          ) : (
            <>
              Start Extraction & Correlation
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default IngestionPanel;
