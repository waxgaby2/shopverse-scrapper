const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.get("/api/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({
      error: "Missing query",
    });
  }

  try {
    const browser = await chromium.launch({
      headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.goto(
      `https://www.jumia.com.ng/catalog/?q=${query}`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await page.waitForSelector(".prd");

    const products = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll(".prd")
      ).map((item) => ({
        title:
          item.querySelector(".name")
            ?.textContent || "",

        price:
          item.querySelector(".prc")
            ?.textContent || "",

        image:
          item.querySelector("img")
            ?.src || "",

        link:
          item.querySelector("a")
            ?.href || "",
      }));
    });

    await browser.close();

    res.json(products);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Scraping failed",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});