const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '50mb' })); // Allow large payloads for threat data
app.use(express.static(__dirname));

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

const initDataDir = async () => {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
};
initDataDir();

// --- API Routes ---

// 1. Environment Configuration (Pass Docker ENV to Browser)
app.get('/env.js', (req, res) => {
    const envData = {
        API_KEY: process.env.API_KEY || ''
    };
    res.type('application/javascript');
    res.send(`window.__ENV__ = ${JSON.stringify(envData)};`);
});

// 2. Load Data
app.get('/api/data', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        // If file doesn't exist, return empty structure
        if (error.code === 'ENOENT') {
            return res.json({ entities: [], relationships: [], reports: [] });
        }
        console.error("Read error:", error);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// 3. Save Data
app.post('/api/data', async (req, res) => {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).end();
    }
});

app.listen(PORT, () => {
    console.log(`ThreatNexus running at http://localhost:${PORT}`);
    console.log(`Data persistence enabled at: ${DATA_FILE}`);
});