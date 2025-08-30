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

function setupAutocomplete(inputId, suggestionsId, onSelect) {
  const input = document.getElementById(inputId);
  const suggestionsBox = document.getElementById(suggestionsId);

  input.addEventListener('input', async () => {
    const value = input.value.trim();
    if (value.length < 3) { suggestionsBox.style.display = 'none'; return; }
    const suggestions = await fetchAddressSuggestions(value);
    suggestionsBox.innerHTML = '';
    suggestions.forEach(s => {
      const div = document.createElement('div');
      div.className = 'autocomplete-suggestion';
      div.textContent = s.label;
      div.onclick = () => {
        input.value = s.label;
        suggestionsBox.style.display = 'none';
        onSelect && onSelect(s);
      };
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = suggestions.length ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!suggestionsBox.contains(e.target) && e.target !== input) {
      suggestionsBox.style.display = 'none';
    }
  });
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

async function calculateRoute(fromCoords, toCoords, fromLabel, toLabel) {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const requestBody = {
    coordinates: [fromCoords, toCoords], // [ [lon,lat], [lon,lat] ]
    instructions: false
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errTxt = await res.text();
      try {
        const j = JSON.parse(errTxt);
        if (res.status === 404 && j?.error?.code === 2010) {
          showRouteError(fromLabel, toLabel,
              "Kein routenfähiger Punkt in der Nähe gefunden. Bitte eine genauere Adresse oder Straße auswählen.");
          return;
        }
      } catch {}
      showRouteError(fromLabel, toLabel, `HTTP ${res.status}: ${errTxt}`);
      return;
    }

    const data = await res.json();

    // ORS /geojson returns a FeatureCollection with one LineString feature
    const feature = data && Array.isArray(data.features) ? data.features[0] : null;

    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
      showRouteError(fromLabel, toLabel, "Keine Route gefunden");
      return;
    }

    const summary = (feature.properties && feature.properties.summary) ? feature.properties.summary : {};
    const distanceKm = summary.distance != null ? (summary.distance / 1000).toFixed(2) : '—';
    const durationMin = summary.duration != null ? Math.round(summary.duration / 60) : '—';

    document.getElementById('results').innerHTML =
      `<h3>Route von "${fromLabel}" nach "${toLabel}"</h3>
       <p><strong>Entfernung:</strong> ${distanceKm} km</p>
       <p><strong>Fahrzeit:</strong> ${durationMin} Minuten</p>`;

    // --- Save route to backend
    try {
      const distance_m = Math.round(Number(summary.distance ?? 0));
      const duration_s = Math.round(Number(summary.duration ?? 0));

      const body = {
        from: {
          label: fromLabel,
          lon: Number(fromCoords[0]),
          lat: Number(fromCoords[1]),
        },
        to: {
          label: toLabel,
          lon: Number(toCoords[0]),
          lat: Number(toCoords[1]),
        },
        distance_m,
        duration_s,
      };

      const saveRes = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!saveRes.ok) {
        const txt = await saveRes.text();
        console.error('Autosave fehlgeschlagen:', saveRes.status, txt);
      } else {
        const saved = await saveRes.json();
        console.log('Autosave OK, id:', saved.id);
      }
    } catch (e) {
      console.warn('Speichern der Route: Netzwerkfehler', e);
    }

    if (routeLayer) map.removeLayer(routeLayer);
    // coordinates: [ [lon,lat], ... ]
    const latLngs = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    routeLayer = L.polyline(latLngs, { weight: 5 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

  } catch (error) {
    console.error('Routing Error:', error);
    showRouteError(fromLabel, toLabel, "Netzwerk-Fehler");
  }
}

function showRouteError(from, to, msg) {
  document.getElementById('results').innerHTML =
    `<h3>Fehler bei der Routenberechnung</h3>
     <p>Die Route von "${from}" nach "${to}" konnte nicht berechnet werden.</p>
     <p>Fehler: ${msg}</p>`;
}

// ==== Suchhistorie ====
function getHistory() {
  const raw = localStorage.getItem('routeHistory');
  return raw ? JSON.parse(raw) : [];
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

// ==== Formular-Logik ====
let fromSelection = null, toSelection = null;
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  displayHistory();

  setupAutocomplete('from-input', 'from-suggestions', s => { fromSelection = s; });
  setupAutocomplete('to-input', 'to-suggestions', s => { toSelection = s; });

  document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromInput = document.getElementById('from-input');
    const toInput = document.getElementById('to-input');
    const from = fromInput.value.trim();
    const to = toInput.value.trim();

    if (!fromSelection || fromSelection.label !== from) {
      const suggestions = await fetchAddressSuggestions(from);
      fromSelection = suggestions.length ? suggestions[0] : null;
    }
    if (!toSelection || toSelection.label !== to) {
      const suggestions = await fetchAddressSuggestions(to);
      toSelection = suggestions.length ? suggestions[0] : null;
    }
    if (!fromSelection || !toSelection) {
      showRouteError(from || '—', to || '—', "Adresse nicht gefunden");
      return;
    }

    addToHistory(fromSelection.label, toSelection.label);
    await calculateRoute(fromSelection.coords, toSelection.coords, fromSelection.label, toSelection.label);

    // Felder leeren & Auswahl zurücksetzen
    fromInput.value = '';
    toInput.value = '';
    fromSelection = null;
    toSelection = null;
  });
});
