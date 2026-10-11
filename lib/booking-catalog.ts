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
export const bookingTimes = ["8:00 AM", "10:30 AM", "1:30 PM", "4:00 PM"] as const;
