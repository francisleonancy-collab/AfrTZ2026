
import { test, expect } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';

let server;
const port = 3000;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const filePath = path.join(process.cwd(), 'Index.html');
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  });
  server.listen(port);
});

test.afterAll(async () => {
  server.close();
});

test('verify AI Center Admin UI', async ({ page }) => {
  await page.goto(`http://localhost:${port}`);

  // Mock API calls
  await page.route('**/api/ai/analytics', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        analytics: { requests: 150, latency: 450, quality: 0.92, cost: 0.0123 }
      })
    });
  });

  await page.route('**/api/ai/costs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        costs: [
          { module_name: 'campaign', tokens: 5000, cost: 0.01 },
          { module_name: 'review', tokens: 1000, cost: 0.002 }
        ]
      })
    });
  });

  await page.route('**/api/ai/prompts', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        prompts: [
          { module_name: 'campaign', prompt_name: 'Strategist', version_number: 1, prompt_content: 'You are a hospitality strategist...' }
        ]
      })
    });
  });

  // Login as Admin
  await page.click('text=Access Tool');
  await page.fill('#code-input', 'ADMIN000');
  await page.click('text=Unlock Toolkit');

  // Navigate to Admin tab
  await page.click('#admin-tab');

  // Click AI Center sub-tab
  await page.click('text=AI Center');

  // Handle Authentication if needed (though we can inject it into localStorage)
  const isAuthVisible = await page.isVisible('#ai-admin-auth');
  if (isAuthVisible) {
    await page.fill('#admin-token-input', 'test-token');
    await page.click('text=Authenticate');
  }

  // Verify elements
  await expect(page.locator('#ai-total-reqs')).toHaveText('150');
  await expect(page.locator('#ai-avg-latency')).toHaveText('450ms');
  await expect(page.locator('#ai-avg-quality')).toHaveText('92%');
  await expect(page.locator('#ai-total-cost')).toHaveText('$0.0123');

  // Take screenshot
  await page.screenshot({ path: 'ai-center-verification.png', fullPage: true });
});
