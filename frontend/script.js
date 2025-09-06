// ==== Konfiguration ====
const ORS_API_KEY = '5b3ce3597851110001cf62487d4bc6548715427c837b81645c6abf66';

// ==== Autocomplete ====
async function fetchAddressSuggestions(query) {
  if (!query || query.length < 3) return [];
  const url = `https://api.openrouteservice.org/geocode/autocomplete` +
      `?api_key=${ORS_API_KEY}` +
      `&text=${encodeURIComponent(query)}` +
      `&layers=address,street,venue` +     // straßennahe Kandidaten
      `&boundary.country=CHE` +            // Fokus Schweiz
      `&size=8`                            // mehr Auswahl
  ;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features) return [];
    return data.features
      .filter(f => f.geometry && f.geometry.type === "Point")
      .map(f => ({
        label: f.properties.label,
        coords: f.geometry.coordinates // [lon, lat]
      }));
  } catch (e) {
    console.error("Autocomplete Fehler:", e);
    return [];
  }
}

async function setupAutocomplete(inputId, datalistId, onSelect) {
  const input = document.getElementById(inputId);
  const datalist = document.getElementById(datalistId);

  if (!input || !datalist) {
    console.warn('Autocomplete: Input oder Datalist nicht gefunden:', inputId, datalistId);
    return;
  }

  input.addEventListener('input', async () => {
    const value = input.value.trim();
    if (value.length < 3) {
      datalist.innerHTML = '';
      return;
    }
    const suggestions = await fetchAddressSuggestions(value);
    datalist.innerHTML = '';
    suggestions.forEach(s => {
      const option = document.createElement('option');
      option.value = s.label;
      datalist.appendChild(option);
    });
  });

  input.addEventListener('change', async () => {
    const value = input.value.trim();
    if (!value) return;

    // Erst Autocomplete probieren …
    let suggestions = await fetchAddressSuggestions(value);

    // … wenn leer: Fallback "search"
    if (!suggestions.length) {
      suggestions = await fetchAddressBySearch(value);
    }

    // 1) exakter Treffer?
    let match = suggestions.find(s => s.label === value);

    // 2) sonst: erster sinnvoller Vorschlag (wenn vorhanden)
    if (!match && suggestions.length) {
      match = suggestions[0];
    }

    if (match) onSelect && onSelect(match);
  });

}

// Fallback: tolerantere Suche, wenn Autocomplete nichts findet
async function fetchAddressBySearch(query) {
  if (!query || query.length < 3) return [];
  const url = `https://api.openrouteservice.org/geocode/search` +
      `?api_key=${ORS_API_KEY}` +
      `&text=${encodeURIComponent(query)}` +
      `&layers=address,street,venue` +
      `&boundary.country=CHE` +
      `&size=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features) return [];
    return data.features
        .filter(f => f.geometry && f.geometry.type === "Point")
        .map(f => ({
          label: f.properties.label,
          coords: f.geometry.coordinates // [lon, lat]
        }));
  } catch (e) {
    console.error("Search Fallback Fehler:", e);
    return [];
  }
}

// ==== Leaflet Map & Routing ====
let map, routeLayer;
function initMap() {
  map = L.map('map').setView([46.9470, 7.4474], 9); // Bern Region
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 100);
}

// Request-Body bauen
function buildDirectionsRequest(fromCoords, toCoords) {
  return {
    coordinates: [fromCoords, toCoords], // [ [lon,lat], [lon,lat] ]
    instructions: false
  };
}

// Request senden
async function postDirections(requestBody) {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  return res;
}

// HTTP-Fehler in eine verständliche Meldung umwandeln
async function parseHttpError(res, fromLabel, toLabel) {
  const errTxt = await res.text();
  try {
    const j = JSON.parse(errTxt);
    if (res.status === 404 && j?.error?.code === 2010) {
      return "Kein routenfähiger Punkt in der Nähe gefunden. Bitte eine genauere Adresse oder Straße auswählen.";
    }
  } catch {}
  return `HTTP ${res.status}: ${errTxt}`;
}

// GeoJSON-Feature sicher extrahieren
function extractRouteFeature(data) {
  if (!data || !Array.isArray(data.features)) return null;
  return data.features[0] || null; // erwartet LineString
}

// Zusammenfassung (Distanz/Dauer) lesen
function extractSummary(feature) {
  const s = feature?.properties?.summary || {};
  return {
    distance_m: Number(s.distance ?? 0),
    duration_s: Number(s.duration ?? 0)
  };
}

// km / Minuten formatiert zurückgeben
function formatKm(meters) {
  if (meters == null) return '—';
  return (meters / 1000).toFixed(2);
}
function formatMinutes(seconds) {
  if (seconds == null) return '—';
  return Math.round(seconds / 60);
}

// Ergebnis-Text in die Seite schreiben
function renderRouteSummary(fromLabel, toLabel, distance_m, duration_s) {
  const distanceKm = formatKm(distance_m);
  const durationMin = formatMinutes(duration_s);

  const results = document.getElementById('results');
  results.innerHTML = ''; // alten Inhalt löschen

  const h3 = document.createElement('h3');
  h3.textContent = `Route von "${fromLabel}" nach "${toLabel}"`;

  const p1 = document.createElement('p');
  p1.innerHTML = `<strong>Entfernung:</strong> ${distanceKm} km`;

  const p2 = document.createElement('p');
  p2.innerHTML = `<strong>Fahrzeit:</strong> ${durationMin} Minuten`;

  results.appendChild(h3);
  results.appendChild(p1);
  results.appendChild(p2);
}

// Linie auf die Karte zeichnen
function drawRouteOnMap(feature) {
  if (!feature?.geometry?.coordinates) return;

  if (routeLayer) map.removeLayer(routeLayer);
  const latLngs = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  routeLayer = L.polyline(latLngs, { weight: 5 }).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}

// Hauptfunktion: koordiniert die Schritte
async function calculateRoute(fromCoords, toCoords, fromLabel, toLabel) {
  const saveBtn = document.getElementById('save-route-btn');
  try {
    if (saveBtn) saveBtn.disabled = true;
    const body = buildDirectionsRequest(fromCoords, toCoords);
    const res = await postDirections(body);


    if (!res.ok) {
      const msg = await parseHttpError(res, fromLabel, toLabel);
      lastRoute = null;
      showRouteError(fromLabel, toLabel, msg);
      return;
    }

    const data = await res.json();
    const feature = extractRouteFeature(data);

    if (
        !feature ||
        !feature.geometry ||
        !Array.isArray(feature.geometry.coordinates) ||
        feature.geometry.coordinates.length === 0
    ) {
      lastRoute = null;
      showRouteError(fromLabel, toLabel, "Keine Route gefunden");
      return;
    }

    const { distance_m, duration_s } = extractSummary(feature);

    renderRouteSummary(fromLabel, toLabel, distance_m, duration_s);
    drawRouteOnMap(feature);

    // letzte Route merken
    lastRoute = {
      from: { label: fromLabel, lon: Number(fromCoords[0]), lat: Number(fromCoords[1]) },
      to:   { label: toLabel,   lon: Number(toCoords[0]),   lat: Number(toCoords[1]) },
      distance_m: Math.round(Number(distance_m ?? 0)),
      duration_s: Math.round(Number(duration_s ?? 0)),
    };

    // Suchhistorie aktualisieren
    addToHistory(fromLabel, toLabel);
    displayHistory();

    // Speichern erlauben
    if (saveBtn) saveBtn.disabled = false;

  } catch (error) {
    console.error('Routing Error:', error);
    lastRoute = null;
    if (saveBtn) saveBtn.disabled = true;
    showRouteError(fromLabel, toLabel, "Netzwerk-Fehler");
  }
}

function showRouteError(from, to, msg) {
  const results = document.getElementById('results');
  results.innerHTML = '';

  const h3 = document.createElement('h3');
  h3.textContent = 'Fehler bei der Routenberechnung';

  const p1 = document.createElement('p');
  p1.textContent = `Die Route von "${from}" nach "${to}" konnte nicht berechnet werden.`;

  const p2 = document.createElement('p');
  p2.textContent = `Fehler: ${msg}`;

  results.appendChild(h3);
  results.appendChild(p1);
  results.appendChild(p2);
}

// ==== Suchhistorie ====
function getHistory() {
  const raw = localStorage.getItem('routeHistory');
  if (!raw) return [];
  try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('routeHistory defekt – zurücksetzen:', e);
      localStorage.removeItem('routeHistory');
      return [];
    }
}

function saveHistory(history) {
  localStorage.setItem('routeHistory', JSON.stringify(history));
}

function addToHistory(from, to) {
  let history = getHistory();
  const key = `${from}__${to}`;
  let entry = history.find(h => h.key === key);
  if (entry) entry.count++;
  else history.push({ key, from, to, count: 1 });
  history.sort((a, b) => b.count - a.count);
  saveHistory(history.slice(0, 10));
  displayHistory();
}

function displayHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  const history = getHistory();
  tbody.innerHTML = '';
  if (history.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell(0);
    cell.colSpan = 3;
    cell.textContent = 'Noch keine Suchen durchgeführt';
    cell.style.textAlign = 'center';
    cell.style.fontStyle = 'italic';
    cell.style.color = '#666';
    return;
  }
  history.forEach(entry => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = entry.from;
    row.insertCell(1).textContent = entry.to;
    row.insertCell(2).textContent = entry.count;
  });
}

async function loadSavedRoutesDropdown() {
  try {
    const res = await fetch('/api/routes?limit=50');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const routes = data.items || [];

    const dropdown = document.getElementById('saved-routes-dropdown');
    dropdown.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '– Gespeicherte Route auswählen –';
    dropdown.appendChild(defaultOpt);

    routes.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.from_label} → ${r.to_label}`;
      opt.dataset.from = JSON.stringify({label: r.from_label, lon: r.from_lon, lat: r.from_lat});
      opt.dataset.to   = JSON.stringify({label: r.to_label,   lon: r.to_lon,   lat: r.to_lat});
      dropdown.appendChild(opt);
    });
  } catch (e) {
    console.error('Fehler beim Laden der gespeicherten Routen:', e);
  }
}

function setupSavedRoutesDropdown() {
  const dropdown = document.getElementById('saved-routes-dropdown');
  if (!dropdown) return;

  dropdown.addEventListener('change', async () => {
    const selected = dropdown.options[dropdown.selectedIndex];
    if (!selected || !selected.dataset.from) return;

    const from = JSON.parse(selected.dataset.from);
    const to   = JSON.parse(selected.dataset.to);

    // Route sofort berechnen
    await calculateRoute(
        [from.lon, from.lat],
        [to.lon, to.lat],
        from.label,
        to.label
    );
  });
}

// ==== Formular-Logik ====
let fromSelection = null, toSelection = null;
let lastRoute = null;
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  displayHistory();
  loadSavedRoutesDropdown();
  setupSavedRoutesDropdown();

  setupAutocomplete('from-input', 'from-suggestions', s => { fromSelection = s; });
  setupAutocomplete('to-input', 'to-suggestions', s => { toSelection = s; });

  document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromInput = document.getElementById('from-input');
    const toInput = document.getElementById('to-input');
    const from = fromInput.value.trim();
    const to = toInput.value.trim();

    // FROM absichern
    if (!fromSelection || fromSelection.label !== from) {
      let suggestions = await fetchAddressSuggestions(from);
      if (!suggestions.length) {
        suggestions = await fetchAddressBySearch(from); // <-- neu
      }
      fromSelection = suggestions.length ? suggestions[0] : null;
    }

    // TO absichern
    if (!toSelection || toSelection.label !== to) {
      let suggestions = await fetchAddressSuggestions(to);
      if (!suggestions.length) {
        suggestions = await fetchAddressBySearch(to); // <-- neu
      }
      toSelection = suggestions.length ? suggestions[0] : null;
    }

    if (!fromSelection || !toSelection) {
      showRouteError(from || '—', to || '—', "Adresse nicht gefunden");
      return;
    }

    await calculateRoute(fromSelection.coords, toSelection.coords, fromSelection.label, toSelection.label);

    // Felder leeren & Auswahl zurücksetzen
    fromInput.value = '';
    toInput.value = '';
    fromSelection = null;
    toSelection = null;
  });

  // Route Speichern-Button
  document.getElementById('save-route-btn').addEventListener('click', async (e) => {
    if (!lastRoute) return;

    // 1) Clientseitiger Duplikatcheck: existiert Route schon im Dropdown?
    const dd = document.getElementById('saved-routes-dropdown');
    if (dd) {
      const fromLabel = String(lastRoute.from.label).trim();
      const toLabel   = String(lastRoute.to.label).trim();
      const exists = Array.from(dd.options).some(opt => {
        // Optionen haben Text "FROM → TO"
        const txt = (opt.textContent || '').trim();
        return txt === `${fromLabel} → ${toLabel}`;
      });
      if (exists) {
        return;
      }
    }

    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastRoute),
      });

      // Serverseitiger Check greift auch: 204 = schon vorhanden → nichts tun
      if (res.status === 204) {
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error('Speichern fehlgeschlagen:', res.status, txt);
        alert('Route konnte nicht gespeichert werden');
      } else {
        const saved = await res.json();
        console.log('Route gespeichert, id:', saved.id);
        loadSavedRoutesDropdown(); // Dropdown aktualisieren
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
    } finally {
      btn.disabled = false;
    }
  });
});
