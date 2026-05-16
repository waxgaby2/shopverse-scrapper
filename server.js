const express = require("express");
const { chromium } = require("playwright");

const app = express();

let browser = null;
let browserReady = false;

// -------------------------
// ROOT
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
// HEALTH
// -------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    browserReady
  });
});

// -------------------------
// START BROWSER (UNCHANGED LOGIC STYLE)
// -------------------------
(async () => {
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
    console.error("Browser failed:", err);
  }
})();

// -------------------------
// SAFE SCRAPER (FIXED EMPTY JSON ISSUE)
// -------------------------
async function scrapeJumia(query) {
  const page = await browser.newPage();

  try {
    const url = `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`;

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 20000
    });

    // wait for ANY possible product container
    await page
      .waitForSelector("article, .prd, .core, .sku", { timeout: 10000 })
      .catch(() => {});

    // extra delay to allow JS rendering (important on cloud)
    await page.waitForTimeout(1500);

    const results = await page.evaluate(() => {
      const items = document.querySelectorAll("article, .prd, .core, .sku");

      return Array.from(items).map((item) => {
        const title =
          item.querySelector("h3, .name, .name span")?.textContent?.trim() ||
          "";

        const price =
          item.querySelector(".prc, .price, .amount")?.textContent?.trim() ||
          "";

        const image =
          item.querySelector("img")?.getAttribute("data-src") ||
          item.querySelector("img")?.src ||
          "";

        const link =
          item.querySelector("a")?.href ||
          "";

        return {
          title,
          price,
          image,
          link
        };
      });
    });

    // filter out empty garbage rows
    return results.filter(p => p.title || p.price || p.link);

  } catch (err) {
    console.error("Scrape error:", err.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

// -------------------------
// API
// -------------------------
app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  if (!browserReady) {
    return res.status(503).json({
      error: "Browser still starting"
    });
  }

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), 15000)
    );

    const data = await Promise.race([
      scrapeJumia(query),
      timeout
    ]);

    res.json(data);
  } catch (err) {
    console.error(err.message);

    res.status(200).json({
      error: "scrape_failed",
      data: []
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