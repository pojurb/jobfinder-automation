import { z } from 'zod';

// ─── Remotive ───────────────────────────────────────────────────────────────────

const RemotiveJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  company_name: z.string(),
  url: z.string(),
  candidate_required_location: z.string().optional().default(''),
  salary: z.string().optional().default(''),
  description: z.string().optional().default(''),
  publication_date: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
});

export const RemotiveResponseSchema = z.object({
  jobs: z.array(RemotiveJobSchema),
});

export type RemotiveJob = z.infer<typeof RemotiveJobSchema>;

// ─── RemoteOK ───────────────────────────────────────────────────────────────────

export const RemoteOKJobSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  company: z.string().optional().default('Unknown'),
  position: z.string().optional().default(''),
  url: z.string().optional().default(''),
  location: z.string().optional().default(''),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  description: z.string().optional().default(''),
  date: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
});

// RemoteOK returns an array where index 0 is metadata; real jobs start at index 1
export const RemoteOKResponseSchema = z.array(z.unknown());

export type RemoteOKJob = z.infer<typeof RemoteOKJobSchema>;

// ─── Greenhouse ─────────────────────────────────────────────────────────────────

const GreenhouseLocationSchema = z.object({
  name: z.string().optional().default(''),
});

const GreenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  location: GreenhouseLocationSchema.optional(),
  absolute_url: z.string(),
  content: z.string().optional().default(''),
  updated_at: z.string().optional().default(''),
});

export const GreenhouseResponseSchema = z.object({
  jobs: z.array(GreenhouseJobSchema),
});

export type GreenhouseJob = z.infer<typeof GreenhouseJobSchema>;

// ─── Lever ──────────────────────────────────────────────────────────────────────

const LeverCategoriesSchema = z.object({
  location: z.string().optional().default(''),
  team: z.string().optional().default(''),
  commitment: z.string().optional().default(''),
});

const LeverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  categories: LeverCategoriesSchema.optional(),
  descriptionPlain: z.string().optional().default(''),
  createdAt: z.number().optional(),
  additionalPlain: z.string().optional().default(''),
});

export const LeverResponseSchema = z.array(LeverPostingSchema);

export type LeverPosting = z.infer<typeof LeverPostingSchema>;

// ─── Ashby ──────────────────────────────────────────────────────────────────────

const AshbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().optional().default(''),
  employmentType: z.string().optional().default(''),
  publishedDate: z.string().optional().default(''),
  descriptionHtml: z.string().optional().default(''),
  descriptionPlain: z.string().optional().default(''),
  jobUrl: z.string().optional().default(''),
});

export const AshbyResponseSchema = z.object({
  jobs: z.array(AshbyJobSchema),
});

export type AshbyJob = z.infer<typeof AshbyJobSchema>;
