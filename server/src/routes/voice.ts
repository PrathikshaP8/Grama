import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { VOICE_SYSTEM_PROMPT } from './voiceShared.js';

const router = Router();

export { VOICE_SYSTEM_PROMPT };

const TOOLS = [
  {
    name: 'setUrgency',
    description: 'Assign urgency band after clarifying questions. Never include a disease diagnosis.',
    parameters: {
      type: 'object',
      properties: {
        band: { type: 'string', enum: ['routine', 'soon', 'urgent', 'emergency'] },
        reason: { type: 'string' },
        disclaimer: { type: 'string' },
        language: { type: 'string', enum: ['kn', 'en'] },
      },
      required: ['band', 'reason', 'disclaimer', 'language'],
    },
  },
  {
    name: 'confirmAction',
    description: 'Call only after clear spoken yes / ಹೌದು confirming the proposed action.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        affirmativePhrase: { type: 'string' },
      },
      required: ['action', 'affirmativePhrase'],
    },
  },
  {
    name: 'bookAppointment',
    description: 'Book only after confirmAction succeeded for this turn.',
    parameters: {
      type: 'object',
      properties: {
        facilityId: { type: 'string' },
        specialty: { type: 'string' },
        urgency: { type: 'string' },
        symptoms: { type: 'string' },
      },
      required: ['facilityId', 'urgency'],
    },
  },
];

router.get('/config', requireAuth, requireRole('patient'), (_req, res) => {
  res.json({
    systemPrompt: VOICE_SYSTEM_PROMPT,
    tools: TOOLS,
    model: 'gemini-2.0-flash',
    liveModel: 'gemini-2.5-flash-native-audio-preview-12-2025',
    hasApiKey: Boolean(env.geminiApiKey),
  });
});

router.get('/ephemeral-key', requireAuth, requireRole('patient'), (_req, res) => {
  if (!env.geminiApiKey) {
    res.status(503).json({ error: 'GEMINI_API_KEY not configured', fallback: 'manual' });
    return;
  }
  res.json({ apiKey: env.geminiApiKey, disclaimer: 'Demo key proxy — rotate for production' });
});

const turnSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      text: z.string(),
    })
  ),
  language: z.enum(['kn', 'en']).optional(),
});

/** Text turn via Gemini when key is set — used by voice UI and as Live API fallback. */
router.post('/turn', requireAuth, requireRole('patient'), validateBody(turnSchema), async (req, res) => {
  const body = req.body as z.infer<typeof turnSchema>;
  if (!env.geminiApiKey) {
    res.status(503).json({ error: 'GEMINI_API_KEY not set', useLocalFallback: true });
    return;
  }

  const contents = body.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: VOICE_SYSTEM_PROMPT }] },
      contents,
      tools: [
        {
          functionDeclarations: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    res.status(502).json({ error: 'Gemini request failed', detail: errText.slice(0, 500) });
    return;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text).filter(Boolean).join('\n');
  const functionCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args }));

  res.json({ text, functionCalls });
});

export default router;
