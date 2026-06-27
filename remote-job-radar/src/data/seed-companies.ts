/**
 * Seed list of known remote-friendly tech companies for bootstrapping the first run.
 * These are loaded into discovered_companies when the table is empty.
 */
export const seedCompanies: Array<{
  slug: string;
  name: string;
  atsType: 'greenhouse' | 'lever' | 'ashby' | 'workday';
}> = [
  // ── Greenhouse ──────────────────────────────────
  { slug: 'stripe', name: 'Stripe', atsType: 'greenhouse' },
  { slug: 'airbnb', name: 'Airbnb', atsType: 'greenhouse' },
  { slug: 'netlify', name: 'Netlify', atsType: 'greenhouse' },
  { slug: 'figma', name: 'Figma', atsType: 'greenhouse' },
  { slug: 'coinbase', name: 'Coinbase', atsType: 'greenhouse' },
  { slug: 'discord', name: 'Discord', atsType: 'greenhouse' },
  { slug: 'notion', name: 'Notion', atsType: 'greenhouse' },
  { slug: 'canva', name: 'Canva', atsType: 'greenhouse' },
  { slug: 'hashicorp', name: 'HashiCorp', atsType: 'greenhouse' },
  { slug: 'cloudflare', name: 'Cloudflare', atsType: 'greenhouse' },
  { slug: 'gusto', name: 'Gusto', atsType: 'greenhouse' },
  { slug: 'datadog', name: 'Datadog', atsType: 'greenhouse' },
  { slug: 'ramp', name: 'Ramp', atsType: 'greenhouse' },
  { slug: 'squarespace', name: 'Squarespace', atsType: 'greenhouse' },
  { slug: 'plaid', name: 'Plaid', atsType: 'greenhouse' },
  { slug: 'airtable', name: 'Airtable', atsType: 'greenhouse' },
  { slug: 'duolingo', name: 'Duolingo', atsType: 'greenhouse' },
  { slug: 'snyk', name: 'Snyk', atsType: 'greenhouse' },
  { slug: 'doordash', name: 'DoorDash', atsType: 'greenhouse' },
  { slug: 'cockroachlabs', name: 'Cockroach Labs', atsType: 'greenhouse' },

  // ── Lever ───────────────────────────────────────
  { slug: 'netflix', name: 'Netflix', atsType: 'lever' },
  { slug: 'twitch', name: 'Twitch', atsType: 'lever' },
  { slug: 'Shopify', name: 'Shopify', atsType: 'lever' },
  { slug: 'postman', name: 'Postman', atsType: 'lever' },
  { slug: 'anduril', name: 'Anduril', atsType: 'lever' },
  { slug: 'openai', name: 'OpenAI', atsType: 'lever' },
  { slug: 'vercel', name: 'Vercel', atsType: 'lever' },
  { slug: 'supabase', name: 'Supabase', atsType: 'lever' },
  { slug: 'loom', name: 'Loom', atsType: 'lever' },
  { slug: 'webflow', name: 'Webflow', atsType: 'lever' },
  { slug: 'replit', name: 'Replit', atsType: 'lever' },
  { slug: 'retool', name: 'Retool', atsType: 'lever' },
  { slug: 'brex', name: 'Brex', atsType: 'lever' },
  { slug: 'deel', name: 'Deel', atsType: 'lever' },
  { slug: 'miro', name: 'Miro', atsType: 'lever' },
  { slug: 'navan', name: 'Navan', atsType: 'lever' },
  { slug: 'sourcegraph', name: 'Sourcegraph', atsType: 'lever' },
  { slug: 'render', name: 'Render', atsType: 'lever' },

  // ── Ashby ───────────────────────────────────────
  { slug: 'linear', name: 'Linear', atsType: 'ashby' },
  { slug: 'ramp', name: 'Ramp', atsType: 'ashby' },
  { slug: 'notion', name: 'Notion', atsType: 'ashby' },
  { slug: 'vercel', name: 'Vercel', atsType: 'ashby' },
  { slug: 'resend', name: 'Resend', atsType: 'ashby' },
  { slug: 'cal', name: 'Cal.com', atsType: 'ashby' },
  { slug: 'dbt-labs', name: 'dbt Labs', atsType: 'ashby' },
  { slug: 'stytch', name: 'Stytch', atsType: 'ashby' },
  { slug: 'turso', name: 'Turso', atsType: 'ashby' },
  { slug: 'tinybird', name: 'Tinybird', atsType: 'ashby' },

  // ── AI companies ────────────────────────────────
  { slug: 'anthropic', name: 'Anthropic', atsType: 'lever' },
  { slug: 'cohereai', name: 'Cohere', atsType: 'greenhouse' },
  { slug: 'huggingface', name: 'Hugging Face', atsType: 'greenhouse' },
  { slug: 'replicate', name: 'Replicate', atsType: 'lever' },
  { slug: 'modal', name: 'Modal', atsType: 'greenhouse' },
  { slug: 'mistralai', name: 'Mistral AI', atsType: 'ashby' },
  { slug: 'runwayml', name: 'Runway ML', atsType: 'greenhouse' },
  { slug: 'synthesia', name: 'Synthesia', atsType: 'greenhouse' },
  { slug: 'characterai', name: 'Character.AI', atsType: 'lever' },
  { slug: 'inflection', name: 'Inflection AI', atsType: 'greenhouse' },

  // ── Dev tools ───────────────────────────────────
  { slug: 'gitlab', name: 'GitLab', atsType: 'greenhouse' },
  { slug: 'docker', name: 'Docker', atsType: 'greenhouse' },
  { slug: 'grafana', name: 'Grafana', atsType: 'greenhouse' },
  { slug: 'getsentry', name: 'Sentry', atsType: 'greenhouse' },
  { slug: 'posthog', name: 'PostHog', atsType: 'greenhouse' },
  { slug: 'amplitude', name: 'Amplitude', atsType: 'lever' },
  { slug: 'clickup', name: 'ClickUp', atsType: 'greenhouse' },
  { slug: 'asana', name: 'Asana', atsType: 'greenhouse' },
  { slug: 'mondaydotcom', name: 'Monday.com', atsType: 'greenhouse' },
  { slug: 'coda', name: 'Coda', atsType: 'greenhouse' },

  // ── Fintech ─────────────────────────────────────
  { slug: 'mercury', name: 'Mercury', atsType: 'greenhouse' },
  { slug: 'wisecompany', name: 'Wise', atsType: 'lever' },
  { slug: 'klarna', name: 'Klarna', atsType: 'greenhouse' },
  { slug: 'affirm', name: 'Affirm', atsType: 'greenhouse' },
  { slug: 'sofi', name: 'SoFi', atsType: 'greenhouse' },
  { slug: 'chime', name: 'Chime', atsType: 'greenhouse' },

  // ── Data / Infra ────────────────────────────────
  { slug: 'planetscale', name: 'PlanetScale', atsType: 'greenhouse' },
  { slug: 'neondatabase', name: 'Neon', atsType: 'greenhouse' },
  { slug: 'clerk', name: 'Clerk', atsType: 'greenhouse' },
  { slug: 'pinecone', name: 'Pinecone', atsType: 'greenhouse' },

  // ── Workday ─────────────────────────────────────
  { slug: 'salesforce', name: 'Salesforce', atsType: 'workday' },
];
