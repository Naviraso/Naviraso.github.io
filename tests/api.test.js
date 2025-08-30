// Unit Tests für die API Endpunkte
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import der Server-App (muss angepasst werden für Testing)
let app, db;

beforeAll(() => {
  // Test-Database in Memory
  db = new Database(':memory:');
  
  // Server Setup für Tests
  app = express();
  app.use(express.json());
  
  // DB Schema
  db.prepare(`
    CREATE TABLE routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_label TEXT NOT NULL,
      from_lon REAL NOT NULL,
      from_lat REAL NOT NULL,
      to_label TEXT NOT NULL,
      to_lon REAL NOT NULL,
      to_lat REAL NOT NULL,
      distance_m INTEGER,
      duration_s INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `).run();
  
  // API Routes für Tests
  app.get('/api/routes', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);
    
    const total = db.prepare('SELECT COUNT(*) AS c FROM routes').get().c;
    const items = db.prepare(`
      SELECT * FROM routes ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    res.json({ total, items });
  });
  
  app.post('/api/routes', (req, res) => {
    const { from, to, distance_m, duration_s } = req.body;
    
    if (!from?.label || !from?.lon || !from?.lat || !to?.label || !to?.lon || !to?.lat) {
      return res.status(400).json({ error: 'Invalid body' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO routes (from_label, from_lon, from_lat, to_label, to_lon, to_lat, distance_m, duration_s)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      from.label, from.lon, from.lat,
      to.label, to.lon, to.lat,
      distance_m ?? null, duration_s ?? null
    );
    
    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(route);
  });
  
  app.get('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    if (!route) return res.status(404).json({ error: 'Not found' });
    res.json(route);
  });
  
  app.delete('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM routes WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  });
});

beforeEach(() => {
  // Clean database before each test
  db.prepare('DELETE FROM routes').run();
});

afterAll(() => {
  db.close();
});

describe('Routes API', () => {
  describe('GET /api/routes', () => {
    test('should return empty list initially', async () => {
      const response = await request(app).get('/api/routes');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ total: 0, items: [] });
    });
    
    test('should return routes with pagination', async () => {
      // Insert test data
      const testRoute = {
        from: { label: 'Bern', lon: 7.4474, lat: 46.9470 },
        to: { label: 'Zürich', lon: 8.5417, lat: 47.3769 },
        distance_m: 120000,
        duration_s: 4800
      };
      
      await request(app).post('/api/routes').send(testRoute);
      
      const response = await request(app).get('/api/routes?limit=10&offset=0');
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].from_label).toBe('Bern');
    });
  });
  
  describe('POST /api/routes', () => {
    test('should create a new route', async () => {
      const newRoute = {
        from: { label: 'Basel', lon: 7.5886, lat: 47.5596 },
        to: { label: 'Genf', lon: 6.1432, lat: 46.2044 },
        distance_m: 280000,
        duration_s: 10800
      };
      
      const response = await request(app).post('/api/routes').send(newRoute);
      expect(response.status).toBe(201);
      expect(response.body.from_label).toBe('Basel');
      expect(response.body.to_label).toBe('Genf');
      expect(response.body.distance_m).toBe(280000);
      expect(response.body.id).toBeDefined();
    });
    
    test('should reject invalid route data', async () => {
      const invalidRoute = {
        from: { label: 'Basel' }, // missing coordinates
        to: { label: 'Genf', lon: 6.1432, lat: 46.2044 }
      };
      
      const response = await request(app).post('/api/routes').send(invalidRoute);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid body');
    });
  });
  
  describe('GET /api/routes/:id', () => {
    test('should return specific route', async () => {
      const newRoute = {
        from: { label: 'Luzern', lon: 8.3093, lat: 47.0502 },
        to: { label: 'St. Gallen', lon: 9.3767, lat: 47.4245 }
      };
      
      const createResponse = await request(app).post('/api/routes').send(newRoute);
      const routeId = createResponse.body.id;
      
      const response = await request(app).get(`/api/routes/${routeId}`);
      expect(response.status).toBe(200);
      expect(response.body.from_label).toBe('Luzern');
      expect(response.body.to_label).toBe('St. Gallen');
    });
    
    test('should return 404 for non-existent route', async () => {
      const response = await request(app).get('/api/routes/999');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });
  });
  
  describe('DELETE /api/routes/:id', () => {
    test('should delete existing route', async () => {
      const newRoute = {
        from: { label: 'Winterthur', lon: 8.7233, lat: 47.5017 },
        to: { label: 'Schaffhausen', lon: 8.6311, lat: 47.6965 }
      };
      
      const createResponse = await request(app).post('/api/routes').send(newRoute);
      const routeId = createResponse.body.id;
      
      const deleteResponse = await request(app).delete(`/api/routes/${routeId}`);
      expect(deleteResponse.status).toBe(204);
      
      // Verify deletion
      const getResponse = await request(app).get(`/api/routes/${routeId}`);
      expect(getResponse.status).toBe(404);
    });
    
    test('should return 404 when deleting non-existent route', async () => {
      const response = await request(app).delete('/api/routes/999');
      expect(response.status).toBe(404);
    });
  });
});

describe('SQL Injection Protection', () => {
  test('should prevent SQL injection in route ID parameter', async () => {
    const maliciousId = "1; DROP TABLE routes; --";
    const response = await request(app).get(`/api/routes/${maliciousId}`);
    
    // Should return 404 (invalid ID) not crash the server
    expect(response.status).toBe(404);
    
    // Verify table still exists by creating a route
    const testRoute = {
      from: { label: 'Test', lon: 7.0, lat: 47.0 },
      to: { label: 'Test2', lon: 8.0, lat: 47.0 }
    };
    const createResponse = await request(app).post('/api/routes').send(testRoute);
    expect(createResponse.status).toBe(201);
  });
});