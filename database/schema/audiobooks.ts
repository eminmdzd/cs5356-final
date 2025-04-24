import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { createSelectSchema, createInsertSchema } from "drizzle-zod"
import { z } from "zod"

import { users } from "./auth"

// Table for uploaded PDF files
export const pdfs = pgTable("pdfs", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  filePath: text("file_path").notNull(),
  originalPath: text("original_path"), // Store the original path of the file (if uploaded from elsewhere)
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

// Table for generated audiobooks
export const audiobooks = pgTable("audiobooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  duration: integer("duration"), // Duration in seconds
  audioPath: text("audio_path"),
  errorDetails: text("error_details"), // Store error details if processing fails
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").notNull().default(0), // Progress percentage (0-100)
  pdfId: uuid("pdf_id")
    .notNull()
    .references(() => pdfs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  pdfs: many(pdfs),
  audiobooks: many(audiobooks),
}))

export const pdfsRelations = relations(pdfs, ({ one, many }) => ({
  user: one(users, {
    fields: [pdfs.userId],
    references: [users.id],
  }),
  audiobooks: many(audiobooks),
}))

export const audiobooksRelations = relations(audiobooks, ({ one }) => ({
  pdf: one(pdfs, {
    fields: [audiobooks.pdfId],
    references: [pdfs.id],
  }),
  user: one(users, {
    fields: [audiobooks.userId],
    references: [users.id],
  }),
}))

// Create Zod schemas for validation
export const selectPdfSchema = createSelectSchema(pdfs)
export type Pdf = z.infer<typeof selectPdfSchema>

export const insertPdfSchema = createInsertSchema(pdfs, {
  fileName: (schema) => schema.nonempty("File name cannot be empty"),
  fileSize: (schema) => schema.positive("File size must be positive"),
  filePath: (schema) => schema.nonempty("File path cannot be empty"),
})
export type NewPdf = z.infer<typeof insertPdfSchema>

export const selectAudiobookSchema = createSelectSchema(audiobooks)
export type Audiobook = z.infer<typeof selectAudiobookSchema>

export const insertAudiobookSchema = createInsertSchema(audiobooks, {
  title: (schema) => schema.nonempty("Title cannot be empty"),
  processingStatus: (schema) => 
    schema.refine(
      (val: string) => ["pending", "processing", "completed", "failed"].includes(val),
      "Invalid processing status"
    ),
})
export type NewAudiobook = z.infer<typeof insertAudiobookSchema>

export default { pdfs, audiobooks }