export const prices = {
  full: { name: "Full Detail", small: 200, medium: 250, large: 300 },
  premium: { name: "Premium Detail", small: 325, medium: 375, large: 425 },
  maintenance: { name: "Maintenance Detail", small: 125, medium: 150, large: 175 },
  ceramic3: { name: "3-Year Ceramic Coating", small: 750, medium: 900, large: 1050 },
  ceramic5: { name: "5-Year Ceramic Coating", small: 1000, medium: 1150, large: 1300 },
  enhancement: { name: "Paint Enhancement (Gloss Polish)", small: 300, medium: 350, large: 400 },
} as const;
export const extras = {
  windshield: ["Windshield glass coating", 125], glass: ["All exterior glass coating", 225],
  headlight: ["Headlight restoration (pair)", 100], engine: ["Engine bay cleaning", 75],
} as const;
// Add-ons a package already includes, so they aren't offered or charged again.
export const includedAddOns: Partial<Record<string, readonly string[]>> = { premium: ["engine"] };
// Three appointment windows a day, every day (Central time): 8–11 AM, 12–3 PM
// and 4–8 PM. We arrive at the start of the window. `time` is the start time.
export const bookingTimes = ["8:00 AM", "12:00 PM", "4:00 PM"] as const;
// Start and end in 24h form, used for calendar invites, Google Calendar and busy
// checks. "1:00 PM" is the earlier schedule's afternoon slot, kept so bookings
// made then still show and sync correctly; it can't be booked any more.
export const slotStart: Record<string, string> = { "8:00 AM": "08:00", "12:00 PM": "12:00", "4:00 PM": "16:00", "1:00 PM": "13:00" };
export const slotEnd: Record<string, string> = { "8:00 AM": "11:00", "12:00 PM": "15:00", "4:00 PM": "20:00", "1:00 PM": "17:00" };
export const slotLabel: Record<string, string> = { "8:00 AM": "8–11 AM", "12:00 PM": "12–3 PM", "4:00 PM": "4–8 PM", "1:00 PM": "1–5 PM" };
export const slotPart: Record<string, string> = { "8:00 AM": "Morning", "12:00 PM": "Midday", "4:00 PM": "Evening", "1:00 PM": "Afternoon" };
// Booked online; everything else is quoted first.
export const bookablePackages = ["full", "premium", "maintenance"] as const;
export const quoteServices = {
  ceramic: "Ceramic coating",
  enhancement: "Paint enhancement",
  correction: "Paint correction",
  extraction: "Shampoo & extraction",
  other: "Something else",
} as const;
// Paid online when booking. It goes toward the total and is kept if the customer
// cancels; it's refunded if Camotive has to cancel.
export const depositDollars = 50;
// Taken off the total of a customer's first online booking (see lib/first-visit.ts),
// for a Full or Premium Detail only. The deposit stays the same, so the balance
// paid on the day is lower.
export const firstVisitDiscount = 25;
export const firstVisitPackages: readonly string[] = ["full", "premium"];
// How long a slot is held while the customer pays (Stripe's minimum is 30 minutes).
export const holdMinutes = 30;
// Furthest date that can be requested online.
export const bookingWindowDays = 90;
