import { AtsType } from '../discovery/ats-types';

/**
 * Seed list of known remote-friendly tech companies for bootstrapping the first run.
 * Missing seeds are loaded into discovered_companies on each fetch run.
 */
export const seedCompanies: Array<{
  slug: string;
  name: string;
  atsType: AtsType;
}> = [
  // ── Greenhouse ──────────────────────────────────
  { slug: 'stripe', name: 'Stripe', atsType: 'greenhouse' },
  { slug: 'airbnb', name: 'Airbnb', atsType: 'greenhouse' },
  { slug: 'netlify', name: 'Netlify', atsType: 'greenhouse' },
  { slug: 'figma', name: 'Figma', atsType: 'greenhouse' },
  { slug: 'fluxon', name: 'Fluxon', atsType: 'greenhouse' },
  { slug: 'coinbase', name: 'Coinbase', atsType: 'greenhouse' },
  { slug: 'discord', name: 'Discord', atsType: 'greenhouse' },
  { slug: 'cloudflare', name: 'Cloudflare', atsType: 'greenhouse' },
  { slug: 'gusto', name: 'Gusto', atsType: 'greenhouse' },
  { slug: 'datadog', name: 'Datadog', atsType: 'greenhouse' },
  { slug: 'squarespace', name: 'Squarespace', atsType: 'greenhouse' },
  { slug: 'airtable', name: 'Airtable', atsType: 'greenhouse' },
  { slug: 'duolingo', name: 'Duolingo', atsType: 'greenhouse' },
  { slug: 'cockroachlabs', name: 'Cockroach Labs', atsType: 'greenhouse' },
  { slug: 'amplitude', name: 'Amplitude', atsType: 'greenhouse' },
  { slug: 'anthropic', name: 'Anthropic', atsType: 'greenhouse' },
  { slug: 'brex', name: 'Brex', atsType: 'greenhouse' },
  { slug: 'twitch', name: 'Twitch', atsType: 'greenhouse' },
  { slug: 'webflow', name: 'Webflow', atsType: 'greenhouse' },
  // ── Indonesia / Southeast Asia ──────────────────
  { slug: 'xendit', name: 'Xendit', atsType: 'greenhouse' },

  // ── Lever ───────────────────────────────────────
  { slug: 'tinybird', name: 'Tinybird', atsType: 'lever' },

  // ── Workable ───────────────────────────────────
  { slug: 'ripjar', name: 'Ripjar', atsType: 'workable' },
  { slug: 'worthai', name: 'Worth AI', atsType: 'workable' },

  // ── Ashby ───────────────────────────────────────
  { slug: 'linear', name: 'Linear', atsType: 'ashby' },
  { slug: 'ramp', name: 'Ramp', atsType: 'ashby' },
  { slug: 'notion', name: 'Notion', atsType: 'ashby' },
  { slug: 'vercel', name: 'Vercel', atsType: 'ashby' },
  { slug: 'resend', name: 'Resend', atsType: 'ashby' },
  { slug: 'stytch', name: 'Stytch', atsType: 'ashby' },
  { slug: 'clerk', name: 'Clerk', atsType: 'ashby' },
  { slug: 'clickup', name: 'ClickUp', atsType: 'ashby' },
  { slug: 'deel', name: 'Deel', atsType: 'ashby' },
  { slug: 'docker', name: 'Docker', atsType: 'ashby' },
  { slug: 'loom', name: 'Loom', atsType: 'ashby' },
  { slug: 'miro', name: 'Miro', atsType: 'ashby' },
  { slug: 'modal', name: 'Modal', atsType: 'ashby' },
  { slug: 'openai', name: 'OpenAI', atsType: 'ashby' },
  { slug: 'pinecone', name: 'Pinecone', atsType: 'ashby' },
  { slug: 'plaid', name: 'Plaid', atsType: 'ashby' },
  { slug: 'posthog', name: 'PostHog', atsType: 'ashby' },
  { slug: 'render', name: 'Render', atsType: 'ashby' },
  { slug: 'replit', name: 'Replit', atsType: 'ashby' },
  { slug: 'snyk', name: 'Snyk', atsType: 'ashby' },
  { slug: 'supabase', name: 'Supabase', atsType: 'ashby' },
  { slug: 'synthesia', name: 'Synthesia', atsType: 'ashby' },

  // ── AI companies ────────────────────────────────

  // ── Dev tools ───────────────────────────────────
  { slug: 'gitlab', name: 'GitLab', atsType: 'greenhouse' },
  { slug: 'asana', name: 'Asana', atsType: 'greenhouse' },

  // ── Fintech ─────────────────────────────────────
  { slug: 'mercury', name: 'Mercury', atsType: 'greenhouse' },
  { slug: 'affirm', name: 'Affirm', atsType: 'greenhouse' },
  { slug: 'sofi', name: 'SoFi', atsType: 'greenhouse' },
  { slug: 'chime', name: 'Chime', atsType: 'greenhouse' },

  // ── Data / Infra ────────────────────────────────
  { slug: 'planetscale', name: 'PlanetScale', atsType: 'greenhouse' },

  // ── SmartRecruiters ────────────────────────────
  { slug: 'AccurateBackground', name: 'Accurate Background', atsType: 'smartrecruiters' },
  { slug: 'Canva', name: 'Canva', atsType: 'smartrecruiters' },
  { slug: 'Wise', name: 'Wise', atsType: 'smartrecruiters' },
];
