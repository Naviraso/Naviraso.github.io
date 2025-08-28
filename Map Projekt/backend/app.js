// app.js – minimale, test-freundliche Basis ohne externe Map-Bibliothek
// Funktionalität:
// - Formular-Submit abfangen
// - (Optional) Autocomplete über ORS, falls window.ORS_API_KEY gesetzt ist
// - Top-10 meistgesuchte Routen in localStorage zählen & anzeigen
// - "Karten"-Container mit einfachem Status-Text aktualisieren (platzhalter)

(function () {
    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const form = qs('#route-form');
    const startInput = qs('#start');
    const zielInput = qs('#ziel');
    const mapEl = qs('#map');
    const topListEl = qs('#top-routes-list');
    const startDatalist = qs('#start-suggestions');
    const zielDatalist = qs('#ziel-suggestions');

    const STORAGE_KEY = 'topRoutes';
    const MAX_TOP = 10;

    // --- Utils: Local Storage ---
    function loadTop() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function saveTop(map) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        } catch (_) {
            // ignore
        }
    }

    function recordRoute(start, ziel) {
        const key = `${start.trim()} → ${ziel.trim()}`;
        const data = loadTop();
        data[key] = (data[key] || 0) + 1;
        saveTop(data);
        renderTop();
    }

    function renderTop() {
        const data = loadTop();
        const entries = Object.entries(data)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_TOP);

        topListEl.innerHTML = '';
        if (entries.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Noch keine Suchanfragen.';
            topListEl.appendChild(li);
            return;
        }

        for (const [route, count] of entries) {
            const li = document.createElement('li');
            li.textContent = `${route} (${count})`;
            li.setAttribute('data-count', String(count));
            topListEl.appendChild(li);
        }
    }

    // --- ORS Helpers (optional) ---
    const ORS_KEY = window.ORS_API_KEY || '';
    const ORS_BASE = 'https://api.openrouteservice.org';

    async function orsAutocomplete(q) {
        if (!ORS_KEY || !q) return [];
        const url = new URL(`${ORS_BASE}/geocode/autocomplete`);
        url.searchParams.set('api_key', ORS_KEY);
        url.searchParams.set('text', q);
        url.searchParams.set('size', '5');
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        const json = await res.json();
        return (json.features || []).map(f => ({
            label: f.properties.label,
            coord: f.geometry && f.geometry.coordinates,
        }));
    }

    async function orsGeocodeSearch(q) {
        if (!ORS_KEY || !q) return null;
        const url = new URL(`${ORS_BASE}/geocode/search`);
        url.searchParams.set('api_key', ORS_KEY);
        url.searchParams.set('text', q);
        url.searchParams.set('size', '1');
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        const json = await res.json();
        const f = json.features && json.features[0];
        if (!f) return null;
        return {
            label: f.properties.label,
            coord: f.geometry && f.geometry.coordinates, // [lon, lat]
        };
    }

    async function orsDirections(startCoord, zielCoord) {
        if (!ORS_KEY || !startCoord || !zielCoord) return null;
        const profile = 'driving-car';
        const url = new URL(`${ORS_BASE}/v2/directions/${profile}`);
        url.searchParams.set('api_key', ORS_KEY);
        url.searchParams.set('start', `${startCoord[0]},${startCoord[1]}`);
        url.searchParams.set('end', `${zielCoord[0]},${zielCoord[1]}`);
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        return res.json();
    }

    // --- UI: Autocomplete via datalist (nur wenn KEY vorhanden) ---
    function attachAutocomplete(inputEl, datalistEl) {
        if (!inputEl || !datalistEl) return;
        let lastQuery = '';
        inputEl.addEventListener('input', async () => {
            const q = inputEl.value.trim();
            if (!q || q === lastQuery) return;
            lastQuery = q;
            try {
                const items = await orsAutocomplete(q);
                datalistEl.innerHTML = '';
                for (const it of items) {
                    const opt = document.createElement('option');
                    opt.value = it.label;
                    datalistEl.appendChild(opt);
                }
            } catch (_) {
                // ignore network errors silently
            }
        });
    }

    // --- Karte (Platzhalter) ---
    function updateMapStatus(text) {
        mapEl.textContent = text;
        mapEl.setAttribute('aria-live', 'polite');
        mapEl.dataset.lastRoute = text; // hilfreich für Tests
    }

    // --- Formular-Submit ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const start = startInput.value.trim();
        const ziel = zielInput.value.trim();
        if (!start || !ziel) return;

        // Sofortiges UI-Feedback
        updateMapStatus(`Route wird berechnet: ${start} → ${ziel} …`);

        // Optional: echte ORS-Abfrage, wenn API-Key vorhanden
        if (ORS_KEY) {
            try {
                const [s, z] = await Promise.all([
                    orsGeocodeSearch(start),
                    orsGeocodeSearch(ziel),
                ]);
                if (s && z) {
                    const dir = await orsDirections(s.coord, z.coord);
                    if (dir && dir.routes && dir.routes[0]) {
                        const sum = dir.routes[0].summary;
                        const km = (sum.distance / 1000).toFixed(1);
                        const min = Math.round(sum.duration / 60);
                        updateMapStatus(`Route: ${start} → ${ziel} — ${km} km, ${min} min`);
                    } else {
                        updateMapStatus(`Route: ${start} → ${ziel} — keine Daten erhalten`);
                    }
                } else {
                    updateMapStatus(`Ort(e) nicht gefunden: ${start} / ${ziel}`);
                }
            } catch (_) {
                updateMapStatus(`Fehler bei der Routenberechnung für ${start} → ${ziel}`);
            }
        } else {
            // Fallback ohne API-Key: Erfolg simulieren
            updateMapStatus(`Route: ${start} → ${ziel}`);
        }

        // Top-Routen aktualisieren
        recordRoute(start, ziel);
    });

    // Init
    renderTop();
    attachAutocomplete(startInput, startDatalist);
    attachAutocomplete(zielInput, zielDatalist);
})();