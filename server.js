const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

let browser;

// -------------------------
// INIT BROWSER SAFELY
// -------------------------
async function initBrowser() {
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    console.log("Browser launched");
  } catch (err) {
    console.error("Browser failed to launch:", err);
  }
}

initBrowser();

// -------------------------
// SAFE SCRAPER FUNCTION
// -------------------------
async function scrapeJumia(query) {
  const page = await browser.newPage();

  try {
    await page.goto(
      `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`,
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );

    // safer: don't hard-block forever
    await page.waitForSelector(".prd", { timeout: 8000 }).catch(() => {});

    const products = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".prd")).map((item) => ({
        title: item.querySelector(".name")?.textContent?.trim() || "",
        price: item.querySelector(".prc")?.textContent?.trim() || "",
        image: item.querySelector("img")?.src || "",
        link: item.querySelector("a")?.href || ""
      }));
    });

    return products;
  } finally {
    await page.close().catch(() => {});
  }
}

// -------------------------
// API ROUTE (PROTECTED)
// -------------------------
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    if (!browser) {
      return res.status(503).json({
        error: "Browser still starting, retry in a few seconds"
      });
    }

    // global timeout safety (VERY IMPORTANT for Railway)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 15000)
    );

    const result = await Promise.race([
      scrapeJumia(query),
      timeout
    ]);

    res.json(result);
  } catch (error) {
    console.error("Scrape error:", error.message);

    res.status(500).json({
      error: "Scraping failed"
    });
  }
});

// -------------------------
// START SERVER
// -------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});