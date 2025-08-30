// @ts-check
import {expect, test} from '@playwright/test';

const url = "http://localhost:3000";

test.describe('Route Planner Assignment Tests', () => {
  
  test('get route', async ({ page }) => {
    test.setTimeout(15000); // Erhöht für API-Aufrufe

    const from = "Freiburgstrasse 251, 3018 Bern";
    const to = "Belpstrasse 37, 3008 Bern";

    await page.goto(url);

    // Warte bis die Seite vollständig geladen ist
    await expect(page.getByLabel("Von:")).toBeVisible();
    await expect(page.getByLabel("Nach:")).toBeVisible();

    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);

    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf Routenberechnung und Anzeige in der Tabelle
    await page.waitForSelector('#history-table tbody tr', { timeout: 10000 });

    // Überprüfe, dass die Route in der Suchhistorie-Tabelle erscheint
    await expect(page.getByRole('cell', { name: /Freiburgstrasse/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Belpstrasse/ })).toBeVisible();
  });

  test('should display route results', async ({ page }) => {
    test.setTimeout(15000);

    const from = "Bahnhofplatz 1, 3011 Bern";
    const to = "Wankdorfallee 4, 3014 Bern";

    await page.goto(url);
    
    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);
    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf Routenergebnisse
    await page.waitForSelector('#results h3', { timeout: 10000 });

    // Überprüfe, dass Routeninformationen angezeigt werden
    await expect(page.locator('#results')).toContainText('Route von');
    await expect(page.locator('#results')).toContainText('Entfernung:');
    await expect(page.locator('#results')).toContainText('Fahrzeit:');
  });

  test('should show autocomplete suggestions', async ({ page }) => {
    test.setTimeout(10000);

    await page.goto(url);
    
    // Tippe in das Von-Feld
    await page.getByLabel("Von:").fill('Bern');
    
    // Warte auf Autocomplete-Vorschläge
    await page.waitForTimeout(2000);
    
    // Überprüfe, dass Vorschläge angezeigt werden
    const suggestions = page.locator('#from-suggestions .autocomplete-suggestion');
    await expect(suggestions.first()).toBeVisible({ timeout: 5000 });
  });

  test('should update search history', async ({ page }) => {
    test.setTimeout(15000);

    const from = "Kramgasse 49, 3011 Bern";
    const to = "Bundesplatz 3, 3005 Bern";

    await page.goto(url);
    
    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);
    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf Aktualisierung der Suchhistorie
    await page.waitForSelector('#history-table tbody tr', { timeout: 10000 });

    // Überprüfe, dass die Suchhistorie aktualisiert wurde
    const historyTable = page.locator('#history-table tbody');
    await expect(historyTable.locator('tr').first()).toBeVisible();
    await expect(historyTable).toContainText('Kramgasse');
    await expect(historyTable).toContainText('Bundesplatz');
  });

  test('should clear input fields after route calculation', async ({ page }) => {
    test.setTimeout(15000);

    const from = "Spitalgasse 40, 3011 Bern";
    const to = "Thunplatz 4, 3005 Bern";

    await page.goto(url);
    
    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);
    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf erfolgreiche Route-Berechnung
    await page.waitForSelector('#results h3', { timeout: 10000 });

    // Überprüfe, dass die Eingabefelder geleert wurden
    await expect(page.getByLabel("Von:")).toHaveValue('');
    await expect(page.getByLabel("Nach:")).toHaveValue('');
  });

  test('should display map with route', async ({ page }) => {
    test.setTimeout(15000);

    const from = "Kornhausplatz 18, 3011 Bern";
    const to = "Rosengarten, 3006 Bern";

    await page.goto(url);
    
    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);
    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf Route-Berechnung
    await page.waitForSelector('#results h3', { timeout: 10000 });

    // Überprüfe, dass die Karte sichtbar ist
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    
    // Überprüfe, dass eine Route auf der Karte angezeigt wird
    await expect(page.locator('.leaflet-overlay-pane')).toBeVisible();
  });

  test('should handle form validation', async ({ page }) => {
    await page.goto(url);
    
    // Versuche, leeres Formular abzusenden
    await page.getByRole('button', { name: "Route berechnen" }).click();
    
    // Browser sollte Validierung anzeigen (required fields)
    const fromInput = page.getByLabel("Von:");
    await expect(fromInput).toBeFocused();
  });

  test('should save route to backend API', async ({ page }) => {
    test.setTimeout(15000);

    const from = "Münstergasse 2, 3011 Bern";
    const to = "Casinoplatz 1, 3011 Bern";

    await page.goto(url);
    
    await page.getByLabel("Von:").fill(from);
    await page.getByLabel("Nach:").fill(to);
    await page.getByRole('button', { name: "Route berechnen" }).click();

    // Warte auf Route-Berechnung
    await page.waitForSelector('#results h3', { timeout: 10000 });

    // Überprüfe, dass die Route in der API gespeichert wurde
    const response = await page.request.get(`${url}/api/routes`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.total).toBeGreaterThan(0);
    expect(data.items.length).toBeGreaterThan(0);
    
    // Überprüfe, dass mindestens eine Route Bern-Adressen enthält
    const hasMatchingRoute = data.items.some(route => 
      route.from_label.includes('Bern') && route.to_label.includes('Bern')
    );
    expect(hasMatchingRoute).toBeTruthy();
  });
});