// @ts-check
import {expect, test} from '@playwright/test';

const url = "http://localhost:3000";

test('get route', async ({ page }) => {
  test.setTimeout(10000); // ms

  const from = "Freiburgstrasse 251, 3018 Bern";
  const to = "Belpstrasse 37, 3008 Bern";

  await page.goto(url);

  await page.getByLabel("Von:").fill(from);
  await page.getByLabel("Nach:").fill(to);

  await page.getByRole('button', { name: "Route berechnen" }).click();

  await expect(page.getByText("Freiburgstrasse")).toBeVisible();
  await expect(page.getByText("Belpstrasse")).toBeVisible();
});