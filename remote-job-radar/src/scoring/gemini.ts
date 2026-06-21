import { GoogleGenAI, Type } from '@google/genai';
import { loadProfileConfig } from './pre-filter';
import { logger } from '../utils/logger';

export interface ScoreBreakdown {
  roleScore: number;
  remoteScore: number;
  seniorityScore: number;
  domainScore: number;
  aiProductScore: number;
  matchReasons: string[];
  rejectionReasons: string[];
  shortExplanation: string;
}

export async function evaluateJobWithGemini(job: {
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
}): Promise<ScoreBreakdown | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in the environment variables.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = loadProfileConfig();

  const prompt = `
You are an expert technical recruiter evaluating a job posting for a candidate.
Candidate Profile:
- Role: ${config.role}
- Location Requirement: ${config.location}
- Preferred Domains: ${config.preferences.domains.join(', ')}

Job Details:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location || 'Not specified'}
- Description: ${job.description || 'No description provided'}

Evaluate the job and assign scores based strictly on the following criteria:
1. roleMatch (0 to ${config.scoring_weights.roleMatch} points): Is this a true Product Manager role matching the candidate's focus?
2. remoteEligibilityForIndonesia (0 to ${config.scoring_weights.remoteEligibilityForIndonesia} points): Does this allow working remotely from Indonesia (APAC/Worldwide)? Score 0 if it strictly requires US/EU timezone overlap or work authorization.
3. seniorityMatch (0 to ${config.scoring_weights.seniorityMatch} points): Is it a Senior level role? 
4. domainMatch (0 to ${config.scoring_weights.domainMatch} points): Does the company operate in the preferred domains (SaaS, FinTech)?
5. aiOrTechnicalProductRelevance (0 to ${config.scoring_weights.aiOrTechnicalProductRelevance} points): Does the role involve AI, technical products, or complex systems?

Provide brief reasons for matches and rejections, and a short overall explanation.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            roleScore: { type: Type.INTEGER, description: 'Score for role match' },
            remoteScore: { type: Type.INTEGER, description: 'Score for remote eligibility' },
            seniorityScore: { type: Type.INTEGER, description: 'Score for seniority match' },
            domainScore: { type: Type.INTEGER, description: 'Score for domain match' },
            aiProductScore: { type: Type.INTEGER, description: 'Score for AI/Technical relevance' },
            matchReasons: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: 'List of reasons why this is a good match' 
            },
            rejectionReasons: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: 'List of reasons why this might be a bad match or have low scores' 
            },
            shortExplanation: { type: Type.STRING, description: 'A short 1-2 sentence overall verdict' },
          },
          required: [
            'roleScore',
            'remoteScore',
            'seniorityScore',
            'domainScore',
            'aiProductScore',
            'matchReasons',
            'rejectionReasons',
            'shortExplanation'
          ],
        },
      },
    });

    if (!response.text) return null;

    const parsed = JSON.parse(response.text) as ScoreBreakdown;
    return parsed;

  } catch (error) {
    logger.error(`Gemini API Error: ${(error as Error).message}`);
    return null;
  }
}
