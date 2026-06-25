import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Load the file
        filepath = "file://" + os.path.abspath("index.html")
        await page.goto(filepath)

        # 1. Verify Landing Page Elements
        print("Checking Landing Page...")
        assert await page.is_visible("text=Mkude")
        assert await page.is_visible("#lang-toggle")

        # 2. Check Swahili Toggle
        print("Testing Language Toggle...")
        await page.click("#lang-toggle")
        # Check for Swahili greeting
        assert await page.is_visible("text=Habari! Mimi ni Mkude")

        # 3. Check for OS-specific tabs (hidden by default, but in DOM)
        print("Checking for OS Tabs in DOM...")
        assert await page.locator("#tab-intel").count() == 1
        assert await page.locator("#admin-tab").count() == 1

        # 4. Check for Intelligence panels
        print("Checking Intelligence panels...")
        assert await page.locator("#intel-panel-executive").count() == 1
        assert await page.locator("#intel-panel-insights").count() == 1

        # 5. Check for AI Center in Admin
        print("Checking Admin AI Center...")
        assert await page.locator("#admin-panel-ai").count() == 1

        print("Verification Successful!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
