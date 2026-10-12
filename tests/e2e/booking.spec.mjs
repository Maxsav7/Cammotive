// A customer books a detail, Cam approves it from his email link, and the
// customer gets a confirmation with a calendar invite. Also: quote requests.
import { test, expect } from "@playwright/test";

const fakes = "http://127.0.0.1:4186";

// Turnstile's widget, replaced by one that passes immediately for the action asked.
test.beforeEach(async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", route => route.fulfill({
    contentType: "text/javascript",
    body: `window.turnstile = { render(el, o) { el.textContent = "Security check passed"; setTimeout(() => o.callback("test-" + o.action), 50); return "w"; }, remove() {} };`,
  }));
});

async function emailsTo(request, to, subject) {
  let found = [];
  await expect.poll(async () => {
    const all = await (await request.get(`${fakes}/__emails`)).json();
    found = all.filter(e => e.to.includes(to) && subject.test(e.subject));
    return found.length;
  }, { timeout: 15000 }).toBeGreaterThan(0);
  return found;
}

test("book a detail, Cam approves, customer is confirmed", async ({ page, request }, testInfo) => {
  const email = `${testInfo.project.name}@example.com`;
  await page.goto("/book?service=premium&size=medium");
  await expect(page.getByRole("radio", { name: /Premium Detail/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /medium/i })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Choose a time" }).click();

  const day = page.locator('.calendar-days button[data-state="open"]:not(:disabled)').first();
  const dayName = (await day.getAttribute("aria-label"))?.split(":")[0];
  await day.click();
  const slot = page.locator(".slot-list button:not(:disabled)").first();
  const when = (await slot.locator("strong").textContent()) ?? "";
  await slot.click();
  await page.getByRole("button", { name: "Add your details" }).click();

  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Mobile number").fill("(210) 555-0123");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Vehicle").fill("2022 Porsche 911");
  await page.getByLabel("Service address").fill("123 Main Street, San Antonio, TX");
  await page.getByRole("button", { name: "Review request" }).click();

  await expect(page.locator(".review-notes")).toContainText("10% deposit");
  const send = page.getByRole("button", { name: "Request this time" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("heading", { name: /Your time is held/ })).toBeVisible();
  const code = (await page.locator(".done-summary dd").first().textContent())?.trim();
  expect(code).toMatch(/^CAM-[A-F0-9]{12}$/);

  const [received] = await emailsTo(request, email, /request/i);
  expect(received.text).toContain("not a confirmation");
  const [camEmail] = (await emailsTo(request, "cam@example.com", /request/i)).filter(e => e.text.includes(code));
  const link = /http:\/\/127\.0\.0\.1:\d+(\/manage#booking=[^\s]+)/.exec(camEmail.text)?.[1];
  expect(link).toBeTruthy();

  await page.goto(link);
  await expect(page.locator(".status-pill")).toHaveText("Waiting for your decision");
  await expect(page).toHaveURL(/\/manage$/); // the token leaves the address bar
  await expect(page.locator(".manage-card")).toContainText("2022 Porsche 911");
  await page.getByRole("button", { name: "Confirm this booking" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Confirmed");

  const [confirmed] = await emailsTo(request, email, /confirmed/i);
  expect(confirmed.attachments?.[0]?.filename).toMatch(/\.ics$/);
  expect(Buffer.from(confirmed.attachments[0].content, "base64").toString()).toContain("BEGIN:VEVENT");
  expect(confirmed.text).toContain(when);

  // The slot now shows as taken to everyone else.
  await page.goto("/book");
  await page.getByRole("button", { name: "Choose a time" }).click();
  const sameDay = page.locator(`.calendar-days button[aria-label^="${dayName}:"]`);
  await expect(sameDay).not.toHaveAttribute("data-state", "open");
  if (await sameDay.isEnabled()) {
    await sameDay.click();
    await expect(page.locator(".slot-list button", { hasText: when })).toBeDisabled();
  }
});

test("request a ceramic coating quote", async ({ page, request }, testInfo) => {
  const email = `quote-${testInfo.project.name}@example.com`;
  await page.goto("/quote?service=ceramic");
  await expect(page.getByRole("radio", { name: "Ceramic coating" })).toBeChecked();
  await page.getByLabel("Vehicle").fill("2023 Tesla Model Y, white");
  await page.getByLabel("Full name").fill("Quote Customer");
  await page.getByLabel("Mobile number").fill("(210) 555-0199");
  await page.getByLabel("Email").fill(email);
  const send = page.getByRole("button", { name: "Request a quote" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("heading", { name: /reply within one business day/ })).toBeVisible();
  await emailsTo(request, email, /quote/i);
  const cam = await emailsTo(request, "cam@example.com", /quote/i);
  expect(cam.some(e => e.text.includes("2023 Tesla Model Y"))).toBe(true);
});

test("the homepage shows the next open time and links to it", async ({ page }) => {
  await page.goto("/");
  const next = page.locator("a.next-opening");
  await expect(next).toBeVisible();
  await next.click();
  await expect(page).toHaveURL(/\/book\?date=\d{4}-\d{2}-\d{2}&time=/);
  await page.getByRole("button", { name: "Choose a time" }).click();
  await expect(page.locator(".slot-list button.selected")).toHaveCount(1);
});
