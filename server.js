const express = require("express");
const { chromium } = require("playwright");

const app = express();

let browser = null;

// -------------------------
// ROOT (prevents confusion)
// -------------------------
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Shopverse Scraper API is live",
    endpoints: {
      health: "/health",
      search: "/api/search?q=phone"
    }
  });
});

// -------------------------
// HEALTH CHECK
// -------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    browserReady: !!browser
  });
});

// -------------------------
// START BROWSER FIRST, THEN SERVER
// -------------------------
async function startBrowser() {
  console.log("Starting browser...");

  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  console.log("Browser READY");
}

// -------------------------
// SAFE SCRAPER
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
// API ROUTE (NO 503 ANYMORE)
// -------------------------
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  if (!browser) {
    return res.status(500).json({
      error: "Browser not initialized"
    });
  }

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 12000)
    );

    const result = await Promise.race([
      scrapeJumia(query),
      timeout
    ]);

    res.json(result);

  } catch (err) {
    console.error("Scrape error:", err.message);

    res.status(200).json({
      error: "scrape_failed",
      message: err.message,
      data: []
    });
  }
});

// -------------------------
// BOOTSTRAP (IMPORTANT FIX)
// -------------------------
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await startBrowser();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
})();