const express = require("express");
const { chromium } = require("playwright");

const app = express();

// -------------------------
// STATE
// -------------------------
let browser = null;
let browserReady = false;

// -------------------------
// HEALTH CHECK (REQUIRED FOR RAILWAY)
// -------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    browserReady
  });
});

// -------------------------
// START BROWSER (SAFE)
// -------------------------
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
    browserReady = false;
    console.error("Browser launch failed:", err);
  }
}

startBrowser();

// -------------------------
// SCRAPER FUNCTION (SAFE + TIMEOUT PROTECTED)
// -------------------------
async function scrapeJumia(query) {
  const page = await browser.newPage();

  try {
    await page.goto(
      `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 15000
      }
    );

    // DO NOT HARD BLOCK
    await page.waitForSelector(".prd", { timeout: 6000 }).catch(() => {});

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

// -------------------------
// API ROUTE (NO HANGS, NO 502)
// -------------------------
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  if (!browserReady) {
    return res.status(503).json({
      error: "Browser still starting, try again"
    });
  }

  try {
    // HARD SAFETY TIMEOUT (prevents Railway 502)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 12000)
    );

    const scrape = scrapeJumia(query);

    const result = await Promise.race([scrape, timeout]);

    res.json(result);

  } catch (err) {
    console.error("Scrape error:", err.message);

    // NEVER crash Railway
    res.status(200).json({
      error: "scrape_failed",
      message: err.message,
      data: []
    });
  }
});

// -------------------------
// START SERVER (IMPORTANT)
// -------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});