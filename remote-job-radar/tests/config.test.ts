import { describe, it, expect } from 'vitest';
import { loadProfileConfig } from '../src/scoring/pre-filter';

describe('Config Loader', () => {
  it('should load the profile.yaml successfully', () => {
    const config = loadProfileConfig();
    expect(config).toBeDefined();
    expect(config.role).toBe('Senior Product Manager');
    expect(config.scoring_weights.roleMatch).toBe(30);
    expect(config.hard_rejects.locations_only).toContain('us only');
    expect(config.preferences.domains).toContain('SaaS');
  });
});
