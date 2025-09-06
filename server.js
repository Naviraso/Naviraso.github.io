import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// --- Static Frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// --- DB init
const db = new Database(path.join(__dirname, 'routes.db'));
db.prepare(`
CREATE TABLE IF NOT EXISTS routes (
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
    )
`).run();

// 1) Duplikate entfernen (alle außer der jeweils kleinsten id)
db.exec(`
BEGIN;
DELETE FROM routes
WHERE id NOT IN (
  SELECT MIN(id) FROM routes
  GROUP BY from_label, to_label
);
COMMIT;
`);

// 2) Danach UNIQUE-Index anlegen
db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_from_to
        ON routes(from_label, to_label)
`).run();

// --- Validation (Zod)
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

// --- Swagger (OpenAPI)
const swaggerSpec = swaggerJSDoc({
    definition: {
        openapi: '3.0.3',
        info: { title: 'Routes API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:' + PORT }]
    },
    apis: [__filename], // JSDoc-Kommentare in dieser Datei lesen
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * components:
 *   schemas:
 *     Route:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         from_label: { type: string }
 *         from_lon: { type: number }
 *         from_lat: { type: number }
 *         to_label: { type: string }
 *         to_lon: { type: number }
 *         to_lat: { type: number }
 *         distance_m: { type: integer, nullable: true }
 *         duration_s: { type: integer, nullable: true }
 *         created_at: { type: string, format: date-time }
 *     RouteInput:
 *       type: object
 *       required: [from, to]
 *       properties:
 *         from:
 *           type: object
 *           required: [label, lon, lat]
 *           properties:
 *             label: { type: string }
 *             lon: { type: number }
 *             lat: { type: number }
 *         to:
 *           type: object
 *           required: [label, lon, lat]
 *           properties:
 *             label: { type: string }
 *             lon: { type: number }
 *             lat: { type: number }
 *         distance_m: { type: integer }
 *         duration_s: { type: integer }
 */

/**
 * @openapi
 * /api/routes:
 *   get:
 *     summary: List routes (paginated)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0, minimum: 0 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Route' }
 */
app.get('/api/routes', (req, res) => {
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

/**
 * @openapi
 * /api/routes:
 *   post:
 *     summary: Create a route
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RouteInput' }
 *     responses:
 *       201:
 *         description: Created
 *         headers:
 *           Location: { description: Resource URL, schema: { type: string } }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Route' }
 *       400: { description: Bad request }
 */
app.post('/api/routes', (req, res) => {
    const parsed = RouteInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });

    const { from, to, distance_m, duration_s } = parsed.data;

    // Duplikatcheck
    const existing = db.prepare(`
    SELECT id FROM routes
    WHERE from_label = ? AND to_label = ?
    LIMIT 1
  `).get(from.label, to.label);

    if (existing) {
        return res.status(204).send();
    }

    const stmt = db.prepare(`
    INSERT INTO routes (from_label, from_lon, from_lat, to_label, to_lon, to_lat, distance_m, duration_s)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const info = stmt.run(
        from.label, from.lon, from.lat,
        to.label,   to.lon,   to.lat,
        distance_m ?? null, duration_s ?? null
    );

    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201)
        .location(`/api/routes/${route.id}`)
        .json(route);
});

/**
 * @openapi
 * /api/routes/{id}:
 *   get:
 *     summary: Get a route by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Route' } } } }
 *       404: { description: Not found }
 */
app.get('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    if (!route) return res.status(404).json({ error: 'Not found' });
    res.json(route);
});

/**
 * @openapi
 * /api/routes/{id}:
 *   put:
 *     summary: Replace a route
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RouteInput' }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Route' } } } }
 *       404: { description: Not found }
 */
app.put('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const exists = db.prepare('SELECT 1 FROM routes WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Not found' });

    const parsed = RouteInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });

    const { from, to, distance_m, duration_s } = parsed.data;
    db.prepare(`
    UPDATE routes SET
      from_label = ?, from_lon = ?, from_lat = ?,
      to_label   = ?, to_lon   = ?, to_lat   = ?,
      distance_m = ?, duration_s = ?
    WHERE id = ?
  `).run(
        from.label, from.lon, from.lat,
        to.label,   to.lon,   to.lat,
        distance_m ?? null, duration_s ?? null,
        id
    );

    const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    res.json(route);
});

/**
 * @openapi
 * /api/routes/{id}:
 *   delete:
 *     summary: Delete a route
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: No Content }
 *       404: { description: Not found }
 */
app.delete('/api/routes/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM routes WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
});

// SPA: alles außer /api/* auf index.html
app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// --- Error handler
app.use((err, req, res) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT} (Swagger: /api/docs)`);
});
