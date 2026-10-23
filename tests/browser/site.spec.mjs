// Real-browser checks on desktop and phone: every page loads without errors,
// nothing overflows sideways, key interactions work, and there are no serious
// accessibility problems. Booking runs unconfigured, so its fallback must show.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/mobile-detailing", "/ceramic-coating", "/paint-correction", "/locations", "/stone-oak",
  "/alamo-heights", "/the-dominion", "/leon-springs", "/downtown", "/our-work", "/reviews", "/contact", "/about", "/book", "/appointment", "/quote", "/manage"];

// Collects browser errors and broken same-origin requests for the current page.
function watch(page) {
  const problems = [];
  page.on("pageerror", error => problems.push(`script error: ${error.message}`));
  page.on("console", message => {
    // The stricter CSP is deliberately report-only for now (see SECURITY.md).
    if (message.type() === "error" && !message.text().includes("[Report Only]")) problems.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.url().startsWith("http://127.0.0.1") && response.status() >= 400 && !response.url().includes("not-a-camotive-page"))
      problems.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return problems;
}

for (const path of pages) {
  test(`${path} loads cleanly and fits the screen`, async ({ page }) => {
    const problems = watch(page);
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.title()).toContain("Camotive");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter(v => v.impact === "serious" || v.impact === "critical")
      .map(v => `${v.id} (${v.nodes.length}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`);
    expect(serious).toEqual([]);
  });
}

// Tablet widths sit between the phone and desktop projects, so check the header there directly.
test("the header fits at every tablet width", async ({ page }) => {
  await page.goto("/");
  for (const width of [768, 801, 820, 834, 900, 1024, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test("unconfigured booking shows the call/text fallback, never a form", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByText("Online booking is temporarily unavailable")).toBeVisible();
  await expect(page.locator('.booking-panel a[href^="tel:"]')).toBeVisible();
  await expect(page.locator("form input[type=email]")).toHaveCount(0);
});

test("schedule buttons lead to the booking page", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href="/book"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/book$/);
});

test("navigation works at this screen size", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    const toggle = page.getByRole("button", { name: "Open navigation" });
    await toggle.click();
    await expect(page.locator("#mobile-nav")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
  } else {
    await expect(page.locator(".header-phone")).toBeVisible();
  }
});

test("theme toggle switches between dark and light", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /Switch to (light|dark) mode/ });
  const before = await toggle.getAttribute("aria-label");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("aria-label", before ?? "");
});

test("unknown pages return 404", async ({ page }) => {
  const response = await page.goto("/not-a-camotive-page");
  expect(response?.status()).toBe(404);
});

test("phone menu traps focus, closes on Escape, and returns focus to the menu button", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only menu");
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open navigation" });
  await toggle.click();
  const panel = page.getByRole("dialog", { name: "Site menu" });
  await expect(panel).toBeVisible();
  await expect(page.locator(":focus")).toHaveAttribute("href", "/"); // first link in the panel
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  expect(await panel.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
});

test("phone menu groups expand and links navigate", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only menu");
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByRole("dialog", { name: "Site menu" }).getByRole("link", { name: "Ceramic Coating" }).click();
  await expect(page).toHaveURL(/\/ceramic-coating$/);
});

test("ceramic coating page shows the client coating showcase", async ({ page }) => {
  await page.goto("/ceramic-coating");
  const showcase = page.locator(".coating-showcase");
  await expect(showcase.getByRole("heading", { name: "Depth you can see in daylight." })).toBeVisible();
  await expect(showcase.locator(".showcase-card img")).toHaveCount(4);
  await expect(showcase.locator("video")).toHaveCount(2);
  const feature = showcase.locator(".showcase-video");
  await feature.scrollIntoViewIfNeeded();
  expect(await feature.evaluate(v => v.muted)).toBe(true);
});

test("our work gallery can filter to coating projects", async ({ page }) => {
  await page.goto("/our-work");
  await page.getByRole("button", { name: "Coating" }).click();
  await expect(page.locator(".photo-grid figure")).toHaveCount(4);
});

test("About Us introduces the owner with his photo, and the homepage doesn't", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("section.owner")).toHaveCount(0);
  await expect(page.locator('footer a[href="/about"]')).toHaveText("About Us");
  await page.goto("/about");
  const owner = page.locator("section.owner");
  await expect(owner.getByRole("heading", { name: "Driven by detail." })).toBeVisible();
  await expect(owner).toContainText("Camron Freeman");
  const photo = owner.getByRole("img", { name: /Camron Freeman/ });
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  // The photo scrolls with the page: it keeps its place in the section rather than following the reader.
  const offset = () => photo.evaluate(img => img.getBoundingClientRect().top - img.closest("section").getBoundingClientRect().top);
  const before = await offset();
  await page.mouse.wheel(0, 600); await page.waitForTimeout(300);
  expect(Math.abs(await offset() - before)).toBeLessThan(1);
});
