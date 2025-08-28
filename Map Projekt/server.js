import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Angepasste Helmet-Konfiguration für Leaflet und Inline-Skripte


app.use(express.static(path.join(__dirname, 'public')));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});

async function fetchAddressSuggestions(query) {
    if (!query || query.length < 3) return [];
    const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.features) return [];
        // Nur echte Punkte zulassen!
        return data.features
            .filter(f => f.geometry && f.geometry.type === "Point")
            .map(f => ({
                label: f.properties.label,
                coords: f.geometry.coordinates
            }));
    } catch (e) {
        return [];
    }
}