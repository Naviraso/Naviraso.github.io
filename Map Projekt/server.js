import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Angepasste Helmet-Konfiguration für Leaflet und Inline-Skripte
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // für Inline-Skripte
          "https://unpkg.com" // für Leaflet
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // für Inline-Styles
          "https://unpkg.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://unpkg.com",
          "https://*.tile.openstreetmap.org"
        ],
        fontSrc: ["'self'", "https://unpkg.com"],
        connectSrc: [
          "'self'",
          "https://api.openrouteservice.org",
          "https://unpkg.com"
        ],
        mediaSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    }
  })
);

app.use(cors());
app.use(morgan('dev'));
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