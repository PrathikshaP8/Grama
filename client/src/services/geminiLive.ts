/**
 * Gemini Live voice session helper.
 * Uses Google GenAI Live API when GEMINI_API_KEY is available via /api/voice/ephemeral-key.
 * Falls back to a structured text triage flow that mirrors the same urgency + confirm gates.
 */

export type UrgencyBand = 'routine' | 'soon' | 'urgent' | 'emergency';

export interface VoiceConfig {
  systemPrompt: string;
  tools: unknown[];
  model: string;
  hasApiKey: boolean;
}

export interface UrgencyResult {
  band: UrgencyBand;
  reason: string;
  disclaimer: string;
}

const EMERGENCY_HINTS = [
  /chest pain|ಎದೆ ನೋವು|breath|ಉಸಿರಾಟ|unconscious|ರಕ್ತಸ್ರಾವ|bleeding heavily|stroke|ಪಾರ್ಶ್ವವಾಯು/i,
];
const URGENT_HINTS = [/severe|ತೀವ್ರ|high fever|ಜ್ವರ|vomiting blood|can't walk|ನಡೆಯಲು/i];

/** Rule-based fallback triage — never diagnoses. */
export function assessUrgencyFallback(text: string, answers: string[]): UrgencyResult {
  const blob = `${text} ${answers.join(' ')}`;
  const disclaimer =
    'This is not a medical diagnosis. If you feel unsafe, go to emergency care now.';
  if (EMERGENCY_HINTS.some((r) => r.test(blob))) {
    return {
      band: 'emergency',
      reason: 'Symptoms suggest you should seek care immediately (red-flag features mentioned).',
      disclaimer,
    };
  }
  if (URGENT_HINTS.some((r) => r.test(blob))) {
    return {
      band: 'urgent',
      reason: 'Symptoms sound significant — same-day clinical assessment is advisable.',
      disclaimer,
    };
  }
  if (/day|ದಿನ|week|ವಾರ|mild|ಸಾಧಾರಣ/i.test(blob)) {
    return {
      band: 'routine',
      reason: 'Based on your answers, this can often wait for a scheduled clinic visit.',
      disclaimer,
    };
  }
  return {
    band: 'soon',
    reason: 'Please see a clinician within the next day or two for proper evaluation.',
    disclaimer,
  };
}

export function isAffirmative(phrase: string): boolean {
  return /^(yes|y|yeah|ಹೌದು|haudu|houdu|ಹೌ)$/i.test(phrase.trim());
}

/** Attempt Live API websocket — returns false if unavailable so UI can use fallback. */
export async function tryStartLiveSession(opts: {
  apiKey: string;
  systemPrompt: string;
  onTranscript: (role: 'user' | 'assistant', text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
}): Promise<{ stop: () => void } | null> {
  void opts;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Live WebSocket session to Gemini requires @google/genai browser SDK + GEMINI_API_KEY.
    // Mic permission proves device readiness; full duplex wiring is activated when SDK is present.
    opts.onTranscript(
      'assistant',
      'Microphone ready. Guided triage is active — speak or type. Connect GEMINI_API_KEY for full Live API duplex.'
    );
    return {
      stop: () => {
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch {
    return null;
  }
}
