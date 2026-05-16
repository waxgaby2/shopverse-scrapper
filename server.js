const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.get("/health", (req, res) => {
  res.send("ok");
});

let browser;

// START BROWSER ON SERVER START
(async () => {
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    console.log("Browser launched");
  } catch (err) {
    console.error("Browser failed to launch", err);
  }
})();

app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    if (!browser) {
      return res.status(503).json({ error: "Browser not ready yet" });
    }

    const page = await browser.newPage();

    await page.goto(
      `https://www.jumia.com.ng/catalog/?q=${query}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForSelector(".prd", { timeout: 10000 });

    const products = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".prd")).map((item) => ({
        title: item.querySelector(".name")?.textContent || "",
        price: item.querySelector(".prc")?.textContent || "",
        image: item.querySelector("img")?.src || "",
        link: item.querySelector("a")?.href || "",
      }));
    });

    await page.close();

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Scraping failed" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});