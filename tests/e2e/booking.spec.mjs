// A customer books a detail and is confirmed instantly, with a calendar invite;
// the booking lands on Cam's Google Calendar, and Cam can cancel it from his
// email link. Also: busy calendar time blocks slots, and quote requests.
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
const calendarEvent = async (request, code) =>
  (await (await request.get(`${fakes}/__calendar`)).json()).find(e => e.id === `camotive${code.slice(4).toLowerCase()}`);
const chicagoDay = offset => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + offset * 86400000));

test("busy time on Cam's calendar can't be booked", async ({ page, request }) => {
  const busy = chicagoDay(2);
  const result = await (await request.get(`/api/availability?from=${busy}&days=1`)).json();
  expect(result.days[0].slots.map(s => s.state)).toEqual(["taken", "taken"]);
  await page.goto("/book");
  await page.getByRole("button", { name: "Choose a time" }).click();
  const label = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${busy}T12:00:00Z`));
  const day = page.locator(`.calendar-days button[aria-label^="${label}:"]`);
  if (await day.count()) await expect(day).toHaveAttribute("data-state", "full");
});

test("book a detail, confirmed instantly, Cam can cancel", async ({ page, request }, testInfo) => {
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
  await page.getByRole("button", { name: "Review booking" }).click();

  await expect(page.locator(".review-notes")).toContainText("10% deposit");
  const send = page.getByRole("button", { name: "Book this time" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("heading", { name: "You're booked." })).toBeVisible();
  const code = (await page.locator(".done-summary dd").first().textContent())?.trim();
  expect(code).toMatch(/^CAM-[A-F0-9]{12}$/);

  // Customer: confirmation with an invite, a link to the appointment, and a branded HTML version.
  const [booked] = await emailsTo(request, email, /^Booked:/);
  expect(booked.text).toContain(when);
  expect(booked.html).toContain("You&#39;re booked, Test.");
  expect(booked.html).toContain("/brand/camotive-email-logo.png");
  expect(booked.attachments?.[0]?.filename).toMatch(/\.ics$/);
  expect(Buffer.from(booked.attachments[0].content, "base64").toString()).toContain("STATUS:CONFIRMED");
  expect(booked.text).toMatch(/\/appointment#access=[a-f0-9]{64}/);

  // Cam: notification with the invite and a private view/cancel link; event on his calendar.
  const [camEmail] = (await emailsTo(request, "cam@example.com", /^New booking:/)).filter(e => e.text.includes(code));
  expect(camEmail.html).toContain("2022 Porsche 911");
  await expect.poll(async () => Boolean(await calendarEvent(request, code)), { timeout: 15000 }).toBe(true);
  const event = await calendarEvent(request, code);
  expect(event.location).toBe("123 Main Street, San Antonio, TX");
  expect(event.description).toContain("(210) 555-0123".replace(/\D/g, "").slice(-4));

  // The slot now shows as taken to everyone else.
  await page.goto("/book");
  await page.getByRole("button", { name: "Choose a time" }).click();
  const sameDay = page.locator(`.calendar-days button[aria-label^="${dayName}:"]`);
  await expect(sameDay).not.toHaveAttribute("data-state", "open");
  if (await sameDay.isEnabled()) {
    await sameDay.click();
    await expect(page.locator(".slot-list button", { hasText: when })).toBeDisabled();
  }

  // Cam cancels: confirm step, customer email with a cancelled invite, event removed.
  const link = /http:\/\/127\.0\.0\.1:\d+(\/manage#booking=[^\s]+)/.exec(camEmail.text)?.[1];
  expect(link).toBeTruthy();
  await page.goto(link);
  await expect(page.locator(".status-pill")).toHaveText("Confirmed");
  await expect(page).toHaveURL(/\/manage$/); // the token leaves the address bar
  await expect(page.locator(".manage-card")).toContainText("2022 Porsche 911");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Keep booking" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Confirmed");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Cancelled");
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

  const [cancelled] = await emailsTo(request, email, /^Cancelled:/);
  expect(Buffer.from(cancelled.attachments[0].content, "base64").toString()).toContain("METHOD:CANCEL");
  await expect.poll(async () => Boolean(await calendarEvent(request, code)), { timeout: 15000 }).toBe(false);
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
