import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Patient } from '../models/Patient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { VOICE_SYSTEM_PROMPT } from './voiceShared.js';
import { rankFacilities } from '../services/recommend.js';
import { resolveRegisteredCoords } from '../services/geo.js';

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
    description: 'Book only after confirmAction succeeded. facilityId/doctorId/slotId MUST come from backend availability data, never invent.',
    parameters: {
      type: 'object',
      properties: {
        facilityId: { type: 'string' },
        doctorId: { type: 'string' },
        slotId: { type: 'string' },
        specialty: { type: 'string' },
        urgency: { type: 'string' },
        symptoms: { type: 'string' },
      },
      required: ['facilityId', 'doctorId', 'slotId', 'urgency'],
    },
  },
];

async function liveAvailabilityContext(patientId: string, specialty = 'General Physician') {
  const patient = await Patient.findById(patientId);
  if (!patient) return { error: 'Patient not found' };
  const geo =
    typeof patient.lat === 'number' && typeof patient.lng === 'number'
      ? { lat: patient.lat, lng: patient.lng }
      : resolveRegisteredCoords(patient.village, patient.city);

  const ranked = await rankFacilities({
    lat: geo.lat,
    lng: geo.lng,
    specialty,
  });

  const facts = ranked.slice(0, 5).map((r) => ({
    facilityId: r.facility.id,
    facilityName: r.facility.name,
    distanceKm: Number(r.distanceKm.toFixed(1)),
    specialtyAvailable: r.specialtyAvailable,
    matchingDoctors: r.matchingDoctors.map((d) => ({
      doctorId: d.id,
      name: d.name,
      status: d.status,
      openSlots: d.openSlots.slice(0, 4),
    })),
  }));

  const best = facts.find((f) => f.specialtyAvailable) ?? facts[0];

  return {
    registeredLocation: {
      village: patient.village,
      city: patient.city,
      address: patient.address,
      lat: geo.lat,
      lng: geo.lng,
    },
    specialty,
    facilities: facts,
    spokenSummary: best
      ? best.specialtyAvailable
        ? `A ${specialty} doctor is currently available at ${best.facilityName}, about ${best.distanceKm} km from the patient's registered village ${patient.village}.`
        : `No ${specialty} doctor is currently available near registered village ${patient.village}. Closest facility is ${best.facilityName} (${best.distanceKm} km) but matching doctor is unavailable.`
      : `No facilities found near registered village ${patient.village}.`,
  };
}

router.get('/config', requireAuth, requireRole('patient'), (_req, res) => {
  res.json({
    systemPrompt: `${VOICE_SYSTEM_PROMPT}

CRITICAL DATA RULE: Never invent hospital names, doctor names, distances, availability, or appointment slots.
Always use only the LIVE_BACKEND_AVAILABILITY JSON provided in the conversation context.`,
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

/** Authoritative availability for voice — Gemini must not invent this. */
router.get('/availability', requireAuth, requireRole('patient'), async (req, res) => {
  const specialty = (req.query.specialty as string) || 'General Physician';
  const data = await liveAvailabilityContext(req.user!.id, specialty);
  res.json(data);
});

const turnSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      text: z.string(),
    })
  ),
  language: z.enum(['kn', 'en']).optional(),
  specialty: z.string().optional(),
});

router.post('/turn', requireAuth, requireRole('patient'), validateBody(turnSchema), async (req, res) => {
  const body = req.body as z.infer<typeof turnSchema>;
  const availability = await liveAvailabilityContext(req.user!.id, body.specialty || 'General Physician');

  if (!env.geminiApiKey) {
    res.json({
      text: (availability as { spokenSummary?: string }).spokenSummary,
      functionCalls: [],
      availability,
      useLocalFallback: true,
    });
    return;
  }

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `LIVE_BACKEND_AVAILABILITY (authoritative — do not invent):\n${JSON.stringify(availability)}`,
        },
      ],
    },
    ...body.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: `${VOICE_SYSTEM_PROMPT}

CRITICAL: Hospital names, doctors, distance, availability and slots MUST come only from LIVE_BACKEND_AVAILABILITY. Never invent them.`,
          },
        ],
      },
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
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    res.status(502).json({
      error: 'Gemini request failed',
      detail: errText.slice(0, 500),
      availability,
      text: (availability as { spokenSummary?: string }).spokenSummary,
    });
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

  res.json({ text, functionCalls, availability });
});

export default router;
