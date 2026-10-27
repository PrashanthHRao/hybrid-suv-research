const { chromium } = require('playwright');
const fs = require('fs');

const BUDGET_MAX = 28000;
const MILEAGE_MAX = 70000;
const YEAR_MIN = 2021;

const MODELS = [
  { make: 'Kia', model: 'Sportage' },
  { make: 'Hyundai', model: 'Tucson' },
  { make: 'Toyota', model: 'Corolla Cross' },
  { make: 'Toyota', model: 'C-HR' },
  { make: 'Nissan', model: 'Qashqai' },
  { make: 'Hyundai', model: 'Kona' },
  { make: 'Toyota', model: 'RAV4' },
];

function extractListings(page) {
  return page.evaluate(() => {
    const results = [];
    const links = Array.from(document.querySelectorAll('a'));
    const seen = new Set();
    links.forEach(link => {
      const href = link.href || '';
      let text = link.textContent?.trim().replace(/\s+/g, ' ') || '';
      if (text.length < 30) return;
      const key = text.substring(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      const priceM = text.match(/€\s*([\d,]+(?:\.\d{2})?)/);
      const kmM = text.match(/([\d,]+)\s*km/i);
      const yearM = text.match(/\b(20\d{2})\b/);
      if (priceM) {
        results.push({
          text: text.substring(0, 300),
          price: priceM[0],
          priceRaw: parseFloat(priceM[1].replace(/,/g, '')),
          km: kmM ? kmM[1] + ' km' : '',
          kmRaw: kmM ? parseFloat(kmM[1].replace(/,/g, '')) : 999999,
          year: yearM ? yearM[1] : '',
          link: href,
        });
      }
    });
    return results;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'en-IE',
  });
  await context.route('**/didomi**', route => route.abort());
  const page = await context.newPage();

  const allResults = [];

  for (const m of MODELS) {
    const url = `https://www.carsireland.ie/used-cars/${m.make.toLowerCase()}/${m.model.toLowerCase()}`;
    console.log(`\n[${m.make} ${m.model}]`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Click Apply/Search if present
      const applyBtn = await page.$('button:has-text("Apply"), button:has-text("Search"), button:has-text("Show")');
      if (applyBtn) {
        await applyBtn.click();
        await page.waitForTimeout(3000);
      }

      const listings = await extractListings(page);
      const filtered = listings.filter(l =>
        l.priceRaw >= 18000 && l.priceRaw <= BUDGET_MAX
        && l.kmRaw <= MILEAGE_MAX
        && (!l.year || parseInt(l.year) >= YEAR_MIN)
      );

      console.log(`  Total: ${listings.length} | In range: ${filtered.length}`);
      filtered.forEach((l, i) => {
        if (i < 3) console.log(`    ${l.price} ${l.km} ${l.year} ${l.text.substring(0, 80)}`);
      });
      allResults.push(...filtered.map(l => ({ ...l, make: m.make, model: m.model })));
    } catch (e) {
      console.log(`  Error: ${e.message.substring(0, 80)}`);
    }
  }

  await browser.close();

  // Deduplicate
  const seen = new Set();
  const unique = allResults.filter(r => {
    const k = r.text.substring(0, 30) + r.priceRaw;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => a.priceRaw - b.priceRaw);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Total unique: ${unique.length}`);
  console.log(`${'='.repeat(60)}`);
  unique.forEach((c, i) => {
    const loc = (c.text.match(/Dublin|Cork|Galway|Meath|Kildare|Wexford|Limerick|Wicklow/i)?.[0] || 'ROI') || 'ROI';
    console.log(`  ${(i+1).toString().padStart(3)}. ${c.price.padEnd(10)} ${c.km.padEnd(12)} ${c.year.padEnd(5)} ${c.make} ${c.model} [${loc}]`);
    console.log(`       ${c.text.substring(0, 120)}`);
    if (c.link) console.log(`       ${c.link}`);
  });

  fs.writeFileSync('hybrid_suv_listings.json', JSON.stringify(unique, null, 2));
  console.log(`\nSaved ${unique.length} listings to hybrid_suv_listings.json`);
})();
