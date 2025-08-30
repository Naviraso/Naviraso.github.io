CREATE TABLE IF NOT EXISTS routes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_label   TEXT NOT NULL,
    from_lon     REAL NOT NULL,
    from_lat     REAL NOT NULL,
    to_label     TEXT NOT NULL,
    to_lon       REAL NOT NULL,
    to_lat       REAL NOT NULL,
    distance_m   INTEGER,
    duration_s   INTEGER,
    created_at   TEXT DEFAULT (datetime('now'))
);
