# Routenplaner Webanwendung

## Übersicht
Dieses Projekt implementiert eine Single Page Application (SPA) zur Berechnung und Anzeige von Routen zwischen zwei Orten.  
Die Anwendung nutzt die [OpenRouteService API](https://openrouteservice.org) für Geocoding, Autocomplete und Routenberechnung.  
Zusätzlich wird eine eigene REST-API bereitgestellt, um häufig genutzte oder persönliche Routen in einer SQLite-Datenbank zu speichern.

---

## Features
- Eingabe von Start- und Zielorten mit Autocomplete-Vorschlägen  
- Anzeige der Route (Entfernung und Dauer)  
- Speicherung und Anzeige der 10 häufigsten Suchanfragen im Browser  
- REST-API (Richardson Maturity Level 2) mit Swagger-Dokumentation  
- Schutz vor SQL-Injection (Prepared Statements mit `better-sqlite3`)  
- Unit-Tests (Jest/Supertest) und Akzeptanztests (Playwright)  
- Automatisiertes Deployment und CI/CD-Pipeline (GitLab CI)

---

## Projektstruktur
```
├── db/
├── frontend
│ ├── index.html
│ ├── script.js
│ └── style.css
├── tests/
│ ├── api.test.js
│ ├── assignment.test.js
│ ├── example.spec.js
│ └── utils.test.js
├── .gitignore
├── .gitlab-ci.yml
├── README.md
├── package-lock.json
├── package.json
├── playwright.config.js
├── routes.db
└── server.js
```

---

## Installation und Start
### Voraussetzungen
- Node.js >= 16
- npm

### Setup
```
# Repository klonen
git clone [<REPO_URL>](https://github.com/Naviraso/Naviraso.github.io)

# Dependencies installieren
npm install

# Datenbank initialisieren
sqlite3 routes.db < init.sql
```
### Anwendung starten
```
npm run start
```
Standardmässig läuft der Server auf http://localhost:3000

---

## REST-API
Die Anwendung stellt eine REST-API unter /api/routes bereit.
Dokumentation via Swagger erreichbar unter http://localhost:3000/api-docs

### Endpunkte
- GET /api/routes – Liste gespeicherter Routen
- POST /api/routes – Neue Route speichern
- GET /api/routes/:id – Einzelne Route abrufen

---

## Tests
### Unit- und Integrationstests
```
npm run test
```

### Akzeptanztests (Playwright)
```
npm run test:headed   # mit Browserfenster
npm run test:debug    # Debug-Modus
```

---

## CI/CD und Deployment
GitLab CI/CD (.gitlab-ci.yml):
- Installiert Dependencies
- Führt Unit- und Akzeptanztests automatisch aus

---

## Sicherheit
- Prepared Statements (better-sqlite3) verhindern SQL Injection
- Eingaben werden clientseitig und serverseitig validiert
- CORS-Policy aktiviert (cors Middleware)

---
## Bewertungskriterien (Abdeckung)
- Frontend (Autocomplete, Routing, Top 10 Suchanfragen)
- REST-API mit Swagger und SQL Injection Schutz
- Unit- und Akzeptanztests
- Automatisches Deployment via CI/CD
- Mobile Friendly und barrierefreies Layout



