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
// Two mobile appointments a day, every day. A Full Detail takes about 3–4 hours.
export const bookingTimes = ["8:00 AM", "1:00 PM"] as const;
// Start time in 24h form, used for calendar invites and reminders.
export const slotStart = { "8:00 AM": "08:00", "1:00 PM": "13:00" } as const;
export const slotHours = 4;
// Booked online; everything else is quoted by Cam first.
export const bookablePackages = ["full", "premium", "maintenance"] as const;
export const quoteServices = {
  ceramic: "Ceramic coating",
  correction: "Paint correction",
  other: "Something else",
} as const;
export const depositPercent = 10;
// Furthest date that can be requested online.
export const bookingWindowDays = 90;
