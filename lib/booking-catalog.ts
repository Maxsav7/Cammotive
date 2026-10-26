export const prices = {
  full: { name: "Full Detail", small: 250, medium: 300, large: 350 },
  premium: { name: "Premium Detail", small: 350, medium: 425, large: 500 },
  maintenance: { name: "Maintenance Detail", small: 125, medium: 150, large: 175 },
  ceramic3: { name: "3-Year Ceramic Coating", small: 900, medium: 1050, large: 1200 },
  ceramic5: { name: "5-Year Ceramic Coating", small: 1300, medium: 1500, large: 1700 },
} as const;
export const extras = {
  windshield: ["Windshield glass coating", 125], glass: ["All exterior glass coating", 225],
  headlight: ["Headlight restoration (pair)", 100], engine: ["Engine bay cleaning", 75],
} as const;
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
  correction: "Paint correction",
  other: "Something else",
} as const;
// Paid online when booking. It goes toward the total and is kept if the customer
// cancels; it's refunded if Camotive has to cancel.
export const depositDollars = 50;
// How long a slot is held while the customer pays (Stripe's minimum is 30 minutes).
export const holdMinutes = 30;
// Furthest date that can be requested online.
export const bookingWindowDays = 90;
