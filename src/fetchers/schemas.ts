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

// ─── Himalayas ────────────────────────────────────────────────────────────────

const HimalayasLocationRestrictionsSchema = z.union([z.string(), z.array(z.string())]);
const HimalayasDateSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value) =>
    typeof value === 'number' ? new Date(value * 1000).toISOString() : value
  );

export const HimalayasJobSchema = z.object({
  title: z.string(),
  excerpt: z.string().optional().default(''),
  companyName: z.string(),
  companySlug: z.string().optional().default(''),
  companyLogo: z.string().optional().default(''),
  employmentType: z.string().optional().default(''),
  minSalary: z.number().nullable().optional(),
  maxSalary: z.number().nullable().optional(),
  salaryPeriod: z.string().nullable().optional(),
  seniority: z.array(z.string()).optional().default([]),
  currency: z.string().nullable().optional(),
  locationRestrictions: HimalayasLocationRestrictionsSchema.nullable().optional(),
  timezoneRestrictions: z.array(z.number()).optional().default([]),
  categories: z.array(z.string()).optional().default([]),
  parentCategories: z.array(z.string()).optional().default([]),
  description: z.string().optional().default(''),
  pubDate: HimalayasDateSchema,
  expiryDate: HimalayasDateSchema,
  applicationLink: z.string().min(1),
  guid: z.string().min(1),
}).passthrough();

export const HimalayasResponseSchema = z.object({
  comments: z.string().optional(),
  updatedAt: z.number().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  totalCount: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
  jobs: z.array(HimalayasJobSchema),
});

export type HimalayasJob = z.infer<typeof HimalayasJobSchema>;

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

// ─── Workable ──────────────────────────────────────────────────────────────────

const WorkableJobSchema = z.object({
  title: z.string(),
  shortcode: z.string(),
  url: z.string(),
  application_url: z.string().optional().default(''),
  published_on: z.string().optional().default(''),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  telecommuting: z.boolean().optional().default(false),
  employment_type: z.string().optional().default(''),
  department: z.string().nullable().optional(),
});

export const WorkableResponseSchema = z.object({
  name: z.string().optional().default(''),
  description: z.string().optional().default(''),
  jobs: z.array(WorkableJobSchema),
});

export type WorkableJob = z.infer<typeof WorkableJobSchema>;

// ─── SmartRecruiters ───────────────────────────────────────────────────────────

const SmartRecruitersLocationSchema = z.object({
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  remote: z.boolean().optional().default(false),
  hybrid: z.boolean().optional().default(false),
  fullLocation: z.string().nullable().optional(),
});

const SmartRecruitersPostingSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  company: z
    .object({
      identifier: z.string().optional().default(''),
      name: z.string().optional().default(''),
    })
    .optional(),
  releasedDate: z.string().optional().default(''),
  location: SmartRecruitersLocationSchema.optional(),
});

const SmartRecruitersSectionSchema = z.object({
  text: z.string().optional().default(''),
});

export const SmartRecruitersListResponseSchema = z.object({
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(100),
  totalFound: z.number().optional().default(0),
  content: z.array(SmartRecruitersPostingSchema).default([]),
});

export const SmartRecruitersPostingDetailSchema = SmartRecruitersPostingSchema.extend({
  postingUrl: z.string().optional().default(''),
  applyUrl: z.string().optional().default(''),
  jobAd: z
    .object({
      sections: z
        .object({
          companyDescription: SmartRecruitersSectionSchema.optional(),
          jobDescription: SmartRecruitersSectionSchema.optional(),
          qualifications: SmartRecruitersSectionSchema.optional(),
          additionalInformation: SmartRecruitersSectionSchema.optional(),
        })
        .optional(),
    })
    .optional(),
});

export type SmartRecruitersPosting = z.infer<typeof SmartRecruitersPostingSchema>;
export type SmartRecruitersPostingDetail = z.infer<typeof SmartRecruitersPostingDetailSchema>;
