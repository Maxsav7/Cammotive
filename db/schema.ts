import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  confirmationCode: text("confirmation_code").notNull().unique(),
  packageId: text("package_id").notNull(),
  packageName: text("package_name").notNull(),
  addOns: text("add_ons"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  total: integer("total").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  vehicle: text("vehicle").notNull(),
  address: text("address").notNull(),
  reminder: text("reminder").notNull(),
  createdAt: text("created_at").notNull(),
});
