// A customer books a detail: service, add-ons, an open time, details, then pays the
// $50 deposit on (fake) Stripe Checkout, which confirms it with a calendar invite
// and puts it on Cam's Google Calendar. They can sign in to My appointments with an
// emailed code and cancel (deposit kept); Cam can cancel (deposit refunded).
// Also: abandoned payments release the slot, busy calendar time blocks slots,
// and quote requests.
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
  await page.getByRole("button", { name: "Next: add-ons" }).click();
  await page.getByRole("button", { name: "Skip: choose a time" }).click();
  const label = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${busy}T12:00:00Z`));
  const day = page.locator(`.calendar-days button[aria-label^="${label}:"]`);
  if (await day.count()) await expect(day).toHaveAttribute("data-state", "full");
});

// Walks the five booking steps and stops on the fake Stripe Checkout page.
async function bookUntilCheckout(page, email, { service = "premium", addOn = true } = {}) {
  await page.goto(`/book?service=${service}&size=medium`);
  await expect(page.getByRole("radio", { name: /Premium Detail|Full Detail/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next: add-ons" }).click();
  if (addOn) await page.getByLabel(/Engine bay cleaning/).check();
  await page.getByRole("button", { name: /choose a time/ }).click();
  const day = page.locator('.calendar-days button[data-state="open"]:not(:disabled)').first();
  const dayName = (await day.getAttribute("aria-label"))?.split(":")[0];
  await day.click();
  const slot = page.locator(".slot-list button:not(:disabled)").first();
  const when = (await slot.locator("strong").textContent()) ?? "";
  await slot.click();
  await page.getByRole("button", { name: "Next: your details" }).click();
  await page.getByLabel("Full name").fill("Test Customer");
  // A different number per booking: the same phone can only book a few times a day.
  await page.getByLabel("Mobile number").fill(`(210) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Vehicle").fill("2022 Porsche 911");
  await page.getByLabel("Service address").fill("123 Main Street, San Antonio, TX");
  await page.getByRole("button", { name: "Next: review and pay" }).click();
  await expect(page.locator(".deposit-summary")).toContainText("$50");
  const pay = page.getByRole("button", { name: "Pay $50 deposit" });
  await expect(pay).toBeDisabled(); // the non-refundable deposit must be acknowledged first
  await page.getByLabel(/non-refundable if I cancel/).check();
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  return { dayName, when };
}
const slotState = async (page, dayName, when) => {
  await page.goto("/book");
  await page.getByRole("button", { name: "Next: add-ons" }).click();
  await page.getByRole("button", { name: "Skip: choose a time" }).click();
  await expect(page.locator(".availability-calendar")).toHaveAttribute("aria-busy", "false"); // days are disabled while loading
  const sameDay = page.locator(`.calendar-days button[aria-label^="${dayName}:"]`);
  await expect(sameDay).toBeVisible();
  if (!await sameDay.isEnabled()) return "taken";
  await sameDay.click();
  return await page.locator(".slot-list button", { hasText: when }).isDisabled() ? "taken" : "open";
};

test("book with a deposit, view in My appointments, cancel and keep the deposit", async ({ page, request }, testInfo) => {
  const email = `${testInfo.project.name}@example.com`;
  const { dayName, when } = await bookUntilCheckout(page, email);
  await page.getByRole("button", { name: "Pay $50.00" }).click();
  await expect(page.getByRole("heading", { name: "You're booked." })).toBeVisible();
  await expect(page.locator(".booking-done")).toContainText("$50 deposit is paid");
  const code = (await page.locator(".done-summary dd").first().textContent())?.trim();
  expect(code).toMatch(/^CAM-[A-F0-9]{12}$/);
  await expect(page.locator(".done-summary")).toContainText("Engine bay cleaning");

  // Confirmation with an invite and a link to My appointments; Cam notified; calendar event.
  const [booked] = await emailsTo(request, email, /^Booked:/);
  expect(booked.text).toContain(when);
  expect(booked.text).toContain("$50 deposit is paid");
  expect(Buffer.from(booked.attachments[0].content, "base64").toString()).toContain("STATUS:CONFIRMED");
  const access = /(\/appointment#access=[a-f0-9]{64})/.exec(booked.text)?.[1];
  expect(access).toBeTruthy();
  const [camEmail] = (await emailsTo(request, "cam@example.com", /^New booking:/)).filter(e => e.text.includes(code));
  expect(camEmail.text).toContain("deposit is paid");
  await expect.poll(async () => Boolean(await calendarEvent(request, code)), { timeout: 15000 }).toBe(true);
  expect(await slotState(page, dayName, when)).toBe("taken");

  // The email link signs straight in to My appointments.
  await page.goto(access);
  await expect(page).toHaveURL(/\/appointment$/);
  await expect(page.getByRole("heading", { name: "Your appointments" })).toBeVisible();
  await expect(page.locator(".appointment-card", { hasText: code })).toContainText("$50 deposit paid");
  await page.getByRole("button", { name: "Sign out" }).click();

  // Or sign in with an emailed 6-digit code.
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  const [signin] = await emailsTo(request, email, /sign-in code/);
  const otp = /^(\d{6}) is your/.exec(signin.subject)[1];
  if (otp !== "000000") {
    await page.getByRole("button", { name: "View my appointments" }).click();
    await expect(page.locator(".manage-message")).toContainText("isn't right");
  }
  await page.getByLabel("6-digit code").fill(otp);
  await page.getByRole("button", { name: "View my appointments" }).click();
  const card = page.locator(".appointment-card", { hasText: code });
  await expect(card).toContainText("Confirmed");
  await expect(card).toContainText("2022 Porsche 911");

  // Cancel: confirm step warns the deposit is kept.
  await card.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(card.locator(".manage-confirm")).toContainText("non-refundable");
  await card.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.locator(".manage-message")).toContainText("Cancelled");
  await expect(page.locator(".appointment-card", { hasText: code })).toContainText("deposit kept");

  const [cancelled] = await emailsTo(request, email, /^Cancelled:/);
  expect(cancelled.text).toContain("non-refundable");
  await emailsTo(request, "cam@example.com", /^Customer cancelled:/);
  await expect.poll(async () => Boolean(await calendarEvent(request, code)), { timeout: 15000 }).toBe(false);
  const refunds = await (await request.get(`${fakes}/__refunds`)).json();
  expect(refunds.some(r => r["metadata[booking_code]"] === code)).toBe(false);
  expect(await slotState(page, dayName, when)).toBe("open");
});

test("Cam cancels a paid booking and the deposit is refunded", async ({ page, request }, testInfo) => {
  const email = `refund-${testInfo.project.name}@example.com`;
  await bookUntilCheckout(page, email, { service: "full", addOn: false });
  await page.getByRole("button", { name: "Pay $50.00" }).click();
  await expect(page.getByRole("heading", { name: "You're booked." })).toBeVisible();
  const code = (await page.locator(".done-summary dd").first().textContent())?.trim();
  const [camEmail] = (await emailsTo(request, "cam@example.com", /^New booking:/)).filter(e => e.text.includes(code));
  const link = /http:\/\/127\.0\.0\.1:\d+(\/manage#booking=[^\s]+)/.exec(camEmail.text)?.[1];
  await page.goto(link);
  await expect(page.locator(".status-pill")).toHaveText("Confirmed");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.locator(".status-pill")).toHaveText("Cancelled");
  const refunds = await (await request.get(`${fakes}/__refunds`)).json();
  expect(refunds.some(r => r["metadata[booking_code]"] === code && /^pi_test_/.test(r.payment_intent))).toBe(true);
  const [cancelled] = await emailsTo(request, email, /^Cancelled:/);
  expect(cancelled.text).toContain("refunded");
});

test("going back from checkout without paying releases the time", async ({ page }, testInfo) => {
  const { dayName, when } = await bookUntilCheckout(page, `back-${testInfo.project.name}@example.com`, { addOn: false });
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.locator(".booking-notice")).toContainText("nothing was booked or charged");
  await expect(page.getByRole("heading", { name: "Review and pay the deposit" })).toBeVisible(); // details kept
  await expect(page.locator(".review-list")).toContainText("2022 Porsche 911");
  await expect.poll(() => slotState(page, dayName, when), { timeout: 10000 }).toBe("open");
});

test("if Stripe's webhook is late, the return page confirms with Stripe directly", async ({ page, request }, testInfo) => {
  const email = `late-${testInfo.project.name}@example.com`;
  await bookUntilCheckout(page, email, { addOn: false });
  // Submit the fake checkout with the webhook suppressed.
  await page.evaluate(() => { const form = document.querySelector("form"); form.action = `${location.pathname}?webhook=late`; form.submit(); });
  await expect(page.getByRole("heading", { name: "You're booked." })).toBeVisible({ timeout: 20000 });
  await emailsTo(request, email, /^Booked:/);
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
  await page.getByRole("button", { name: "Next: add-ons" }).click();
  await page.getByRole("button", { name: "Skip: choose a time" }).click();
  await expect(page.locator(".slot-list button.selected")).toHaveCount(1);
});
