// API Tests für Route Planner Backend - OHNE Jest
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { z } from 'zod';

// Test-DB Setup Function
function setupTestDB() {
  const db = new Database(':memory:');
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
  return db;
}

// Validation Schema
const RouteInput = z.object({
  from: z.object({
    label: z.string().min(1),
    lon: z.number().finite(),
    lat: z.number().finite()
  }),
  to: z.object({
    label: z.string().min(1),
    lon: z.number().finite(),
    lat: z.number().finite()
  }),
  distance_m: z.number().nonnegative().optional(),
  duration_s: z.number().nonnegative().optional()
});

// API Routes für Tests
function createApp(db) {
  const testApp = express();
  testApp.use(express.json());

  testApp.get('/api/routes', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);

    const total = db.prepare('SELECT COUNT(*) AS c FROM routes').get().c;
    const items = db.prepare(`
      SELECT * FROM routes
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({ total, items });
  });

  testApp.post('/api/routes', (req, res) => {
    const parsed = RouteInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { from, to, distance_m, duration_s } = parsed.data;

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
    res.status(201)
      .location(`/api/routes/${route.id}`)
      .json(route);
  });

  testApp.get('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    if (!route) return res.status(404).json({ error: 'Not found' });
    res.json(route);
  });

  return testApp;
}

// Simple Assertion Helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Test Runner
async function runTests() {
  console.log('🧪 Starting API Tests...\n');
  
  let passed = 0;
  let failed = 0;
  const tests = [];

  // Test 1: Empty routes list
  tests.push({
    name: 'should get empty routes list initially',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const response = await request(testApp).get('/api/routes');
      
      assertEqual(response.status, 200, 'Status should be 200');
      assertEqual(response.body.total, 0, 'Total should be 0');
      assert(Array.isArray(response.body.items), 'Items should be array');
      assertEqual(response.body.items.length, 0, 'Items array should be empty');
      
      db.close();
    }
  });

  // Test 2: Create new route
  tests.push({
    name: 'should create a new route',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const routeData = {
        from: {
          label: 'Freiburgstrasse 251, 3018 Bern, Switzerland',
          lon: 7.4474,
          lat: 46.9470
        },
        to: {
          label: 'Belpstrasse 37, 3008 Bern, Switzerland',
          lon: 7.4500,
          lat: 46.9500
        },
        distance_m: 5432,
        duration_s: 480
      };

      const response = await request(testApp)
        .post('/api/routes')
        .send(routeData);
      
      assertEqual(response.status, 201, 'Status should be 201');
      assert(typeof response.body.id === 'number', 'ID should be number');
      assertEqual(response.body.from_label, routeData.from.label, 'From label should match');
      assertEqual(response.body.from_lon, routeData.from.lon, 'From longitude should match');
      assertEqual(response.body.from_lat, routeData.from.lat, 'From latitude should match');
      assertEqual(response.body.to_label, routeData.to.label, 'To label should match');
      assertEqual(response.body.to_lon, routeData.to.lon, 'To longitude should match');
      assertEqual(response.body.to_lat, routeData.to.lat, 'To latitude should match');
      assertEqual(response.body.distance_m, routeData.distance_m, 'Distance should match');
      assertEqual(response.body.duration_s, routeData.duration_s, 'Duration should match');
      assert(typeof response.body.created_at === 'string', 'Created_at should be string');
      assertEqual(response.headers.location, `/api/routes/${response.body.id}`, 'Location header should be set');
      
      db.close();
    }
  });

  // Test 3: Validation
  tests.push({
    name: 'should validate route input data',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const invalidData = {
        from: {
          label: '', // Invalid: empty string
          lon: 7.4474,
          lat: 46.9470
        },
        to: {
          label: 'Belpstrasse 37, 3008 Bern',
          lon: 'invalid', // Invalid: not a number
          lat: 46.9500
        }
      };

      const response = await request(testApp)
        .post('/api/routes')
        .send(invalidData);
      
      assertEqual(response.status, 400, 'Status should be 400');
      assertEqual(response.body.error, 'Invalid body', 'Error message should match');
      assert(Array.isArray(response.body.issues), 'Issues should be array');
      assert(response.body.issues.length > 0, 'Should have validation issues');
      
      db.close();
    }
  });

  // Test 4: Get route by ID
  tests.push({
    name: 'should get route by ID',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const routeData = {
        from: {
          label: 'Bahnhofplatz 1, 3011 Bern',
          lon: 7.4391,
          lat: 46.9489
        },
        to: {
          label: 'Wankdorfallee 4, 3014 Bern',
          lon: 7.4650,
          lat: 46.9580
        },
        distance_m: 8500,
        duration_s: 720
      };

      const createResponse = await request(testApp)
        .post('/api/routes')
        .send(routeData);
      
      const routeId = createResponse.body.id;
      
      const getResponse = await request(testApp)
        .get(`/api/routes/${routeId}`);
      
      assertEqual(getResponse.status, 200, 'Status should be 200');
      assertEqual(getResponse.body.id, routeId, 'ID should match');
      assertEqual(getResponse.body.from_label, routeData.from.label, 'From label should match');
      assertEqual(getResponse.body.to_label, routeData.to.label, 'To label should match');
      
      db.close();
    }
  });

  // Test 5: 404 for non-existent route
  tests.push({
    name: 'should return 404 for non-existent route',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const response = await request(testApp).get('/api/routes/999');
      
      assertEqual(response.status, 404, 'Status should be 404');
      assertDeepEqual(response.body, { error: 'Not found' }, 'Error message should match');
      
      db.close();
    }
  });

  // Test 6: Pagination
  tests.push({
    name: 'should handle pagination correctly',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const routes = [
        {
          from: { label: 'Route 1 Start', lon: 7.4474, lat: 46.9470 },
          to: { label: 'Route 1 End', lon: 7.4500, lat: 46.9500 }
        },
        {
          from: { label: 'Route 2 Start', lon: 7.4391, lat: 46.9489 },
          to: { label: 'Route 2 End', lon: 7.4650, lat: 46.9580 }
        },
        {
          from: { label: 'Route 3 Start', lon: 7.4300, lat: 46.9400 },
          to: { label: 'Route 3 End', lon: 7.4600, lat: 46.9600 }
        }
      ];

      for (const route of routes) {
        await request(testApp).post('/api/routes').send(route);
      }

      const page1 = await request(testApp).get('/api/routes?limit=2&offset=0');
      assertEqual(page1.status, 200, 'Page 1 status should be 200');
      assertEqual(page1.body.total, 3, 'Total should be 3');
      assertEqual(page1.body.items.length, 2, 'Page 1 should have 2 items');

      const page2 = await request(testApp).get('/api/routes?limit=2&offset=2');
      assertEqual(page2.status, 200, 'Page 2 status should be 200');
      assertEqual(page2.body.total, 3, 'Total should be 3');
      assertEqual(page2.body.items.length, 1, 'Page 2 should have 1 item');
      
      db.close();
    }
  });

  // Test 7: Swiss coordinates
  tests.push({
    name: 'should handle Swiss coordinate validation',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const swissRoute = {
        from: {
          label: 'Zürich Hauptbahnhof',
          lon: 8.5417,
          lat: 47.3769
        },
        to: {
          label: 'Genf Hauptbahnhof',
          lon: 6.1432,
          lat: 46.2044
        },
        distance_m: 279000,
        duration_s: 10800
      };

      const response = await request(testApp)
        .post('/api/routes')
        .send(swissRoute);
      
      assertEqual(response.status, 201, 'Status should be 201');
      assertEqual(response.body.from_lon, 8.5417, 'From longitude should match');
      assertEqual(response.body.from_lat, 47.3769, 'From latitude should match');
      assertEqual(response.body.to_lon, 6.1432, 'To longitude should match');
      assertEqual(response.body.to_lat, 46.2044, 'To latitude should match');
      
      db.close();
    }
  });

  // Test 8: Routes without metrics
  tests.push({
    name: 'should handle routes without distance and duration',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const routeWithoutMetrics = {
        from: {
          label: 'Kramgasse 49, 3011 Bern',
          lon: 7.4515,
          lat: 46.9481
        },
        to: {
          label: 'Bundesplatz 3, 3005 Bern',
          lon: 7.4436,
          lat: 46.9463
        }
      };

      const response = await request(testApp)
        .post('/api/routes')
        .send(routeWithoutMetrics);
      
      assertEqual(response.status, 201, 'Status should be 201');
      assertEqual(response.body.distance_m, null, 'Distance should be null');
      assertEqual(response.body.duration_s, null, 'Duration should be null');
      assertEqual(response.body.from_label, routeWithoutMetrics.from.label, 'From label should match');
      assertEqual(response.body.to_label, routeWithoutMetrics.to.label, 'To label should match');
      
      db.close();
    }
  });

  // Test 9: Invalid coordinates
  tests.push({
    name: 'should reject invalid coordinate values',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const invalidCoordinates = [
        {
          from: { label: 'Test', lon: 181, lat: 46.9470 }, // Invalid longitude > 180
          to: { label: 'Test', lon: 7.4500, lat: 46.9500 }
        },
        {
          from: { label: 'Test', lon: 7.4474, lat: 91 }, // Invalid latitude > 90
          to: { label: 'Test', lon: 7.4500, lat: 46.9500 }
        },
        {
          from: { label: 'Test', lon: 7.4474, lat: 46.9470 },
          to: { label: 'Test', lon: -181, lat: 46.9500 } // Invalid longitude < -180
        }
      ];

      for (const invalidRoute of invalidCoordinates) {
        const response = await request(testApp)
          .post('/api/routes')
          .send(invalidRoute);
        assertEqual(response.status, 400, 'Invalid coordinates should return 400');
      }
      
      db.close();
    }
  });

  // Test 10: Special characters
  tests.push({
    name: 'should handle special characters in labels',
    test: async () => {
      const db = setupTestDB();
      const testApp = createApp(db);
      
      const routeWithSpecialChars = {
        from: {
          label: 'Münstergasse 2, 3011 Bern, Schweiz',
          lon: 7.4515,
          lat: 46.9481
        },
        to: {
          label: 'Bärenplatz 1, 3011 Bern, Schweiz',
          lon: 7.4476,
          lat: 46.9480
        },
        distance_m: 150,
        duration_s: 120
      };

      const response = await request(testApp)
        .post('/api/routes')
        .send(routeWithSpecialChars);
      
      assertEqual(response.status, 201, 'Status should be 201');
      assertEqual(response.body.from_label, 'Münstergasse 2, 3011 Bern, Schweiz', 'From label with umlauts should match');
      assertEqual(response.body.to_label, 'Bärenplatz 1, 3011 Bern, Schweiz', 'To label with umlauts should match');
      
      db.close();
    }
  });

  // Run all tests
  for (const { name, test } of tests) {
    try {
      await test();
      console.log(`${name} - PASSED`);
      passed++;
    } catch (error) {
      console.log(`${name} - FAILED`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, createApp, setupTestDB };