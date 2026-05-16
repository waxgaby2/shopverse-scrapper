const express = require("express");
const { chromium } = require("playwright");

const app = express();

let browser = null;
let browserReady = false;

// -------------------
// HEALTH CHECK (IMPORTANT)
// -------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    browserReady
  });
});

// -------------------
// INIT BROWSER SAFELY (NO RACE CONDITION)
// -------------------
async function startBrowser() {
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    browserReady = true;
    console.log("Browser READY");
  } catch (err) {
    console.error("Browser failed:", err);
    browserReady = false;
  }
}

startBrowser();

// -------------------
// SCRAPER
// -------------------
async function scrape(query) {
  const page = await browser.newPage();

  try {
    await page.goto(
      `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 15000
      }
    );

    await page.waitForSelector(".prd", { timeout: 8000 }).catch(() => {});

    const results = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".prd")).map(item => ({
        title: item.querySelector(".name")?.textContent?.trim() || "",
        price: item.querySelector(".prc")?.textContent?.trim() || "",
        image: item.querySelector("img")?.src || "",
        link: item.querySelector("a")?.href || ""
      }));
    });

    return results;
  } finally {
    await page.close().catch(() => {});
  }
}

// -------------------
// API ROUTE
// -------------------
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  if (!browserReady) {
    return res.status(503).json({
      error: "Browser still starting, retry in a few seconds"
    });
  }

  try {
    const results = await scrape(query);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraping failed" });
  }
});

// -------------------
// START SERVER (CRITICAL FOR RAILWAY)
// -------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});