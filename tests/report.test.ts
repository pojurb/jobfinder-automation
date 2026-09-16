import { describe, it, expect } from 'vitest';
import { categorizeJobs } from '../src/report/index';

describe('Report Generation (Categorization)', () => {
  it('correctly buckets jobs into Top Matches, Manual Review, and Rejected', () => {
    const mockScoredJobs: any[] = [
      {
        id: 1,
        title: "Top PM",
        totalScore: 85,
        rejectionReasons: []
      },
      {
        id: 2,
        title: "Ambiguous PM",
        totalScore: 50,
        rejectionReasons: []
      },
      {
        id: 3,
        title: "Bad PM",
        totalScore: 0,
        rejectionReasons: ["Hard reject: Location contains 'us only'"]
      },
      {
        id: 4,
        title: "Barely Rejected PM",
        totalScore: 25,
        rejectionReasons: ["Low seniority match"]
      }
    ];

    const { topMatches, manualReview, rejected } = categorizeJobs(mockScoredJobs);

    expect(topMatches).toHaveLength(1);
    expect(topMatches[0].title).toBe("Top PM");

    expect(manualReview).toHaveLength(1);
    expect(manualReview[0].title).toBe("Ambiguous PM");

    expect(rejected).toHaveLength(2);
    // Should be sorted by score descending, so 25 comes before 0
    expect(rejected[0].title).toBe("Barely Rejected PM");
    expect(rejected[1].title).toBe("Bad PM");
  });
});
