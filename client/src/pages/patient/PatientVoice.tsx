import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { UrgencyBanner } from '../../components/UrgencyBanner';
import { ConfirmGate } from '../../components/ConfirmGate';
import { api } from '../../services/api';
import {
  assessUrgencyFallback,
  isAffirmative,
  tryStartLiveSession,
  type UrgencyResult,
  type VoiceConfig,
} from '../../services/geminiLive';

type Msg = { role: 'user' | 'assistant'; text: string };

const FOLLOWUPS_KN = [
  'ಎಷ್ಟು ಸಮಯದಿಂದ ಈ ಲಕ್ಷಣ ಇದೆ?',
  'ಉಸಿರಾಟದ ತೊಂದರೆ ಅಥವಾ ತೀವ್ರ ನೋವು ಇದೆಯೇ?',
];
const FOLLOWUPS_EN = [
  'How long have you had this symptom?',
  'Any breathing difficulty or severe pain?',
];

export function PatientVoice() {
  const { t, i18n } = useTranslation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'complaint' | 'q1' | 'q2' | 'urgency' | 'book'>('complaint');
  const [complaint, setComplaint] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<UrgencyResult | null>(null);
  const [listening, setListening] = useState(false);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [liveNote, setLiveNote] = useState('');
  const stopRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    void api<VoiceConfig>('/voice/config').then((cfg) => {
      setMsgs([
        {
          role: 'assistant',
          text:
            i18n.language === 'kn'
              ? 'ನಮಸ್ಕಾರ. ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ಹೇಳಿ. ನಾನು ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ — ತುರ್ತು ಮಟ್ಟವನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಕೆಲವು ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳುತ್ತೇನೆ.'
              : 'Hello. Tell me your symptoms. I will not diagnose — I will ask a few questions to gauge urgency.',
        },
      ]);
      if (cfg.hasApiKey) {
        void api<{ apiKey: string }>('/voice/ephemeral-key')
          .then(async (k) => {
            const session = await tryStartLiveSession({
              apiKey: k.apiKey,
              systemPrompt: cfg.systemPrompt,
              onTranscript: (role, text) => setMsgs((m) => [...m, { role, text }]),
              onToolCall: (name, args) => {
                if (name === 'setUrgency') {
                  setUrgency({
                    band: args.band as UrgencyResult['band'],
                    reason: String(args.reason),
                    disclaimer: String(args.disclaimer),
                  });
                  setPhase('urgency');
                }
                if (name === 'confirmAction' && isAffirmative(String(args.affirmativePhrase))) {
                  setPhase('book');
                }
              },
            });
            if (session) {
              stopRef.current = session.stop;
              setLiveNote('Gemini Live connected');
            } else {
              setLiveNote('Live API unavailable — using guided voice/text triage');
            }
          })
          .catch(() => setLiveNote('Using guided triage (set GEMINI_API_KEY for Live API)'));
      } else {
        setLiveNote('Using guided triage (set GEMINI_API_KEY for Live API)');
      }
    });
    return () => stopRef.current?.();
  }, [i18n.language]);

  function push(role: 'user' | 'assistant', text: string) {
    setMsgs((m) => [...m, { role, text }]);
  }

  function handleUserText(text: string) {
    push('user', text);

    // Prefer Gemini when configured
    void (async () => {
      try {
        const turn = await api<{
          text?: string;
          functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
          useLocalFallback?: boolean;
        }>('/voice/turn', {
          method: 'POST',
          body: JSON.stringify({
            language: i18n.language === 'kn' ? 'kn' : 'en',
            messages: [...msgs, { role: 'user', text }],
          }),
        });
        if (turn.text) push('assistant', turn.text);
        for (const fc of turn.functionCalls ?? []) {
          if (fc.name === 'setUrgency') {
            setUrgency({
              band: fc.args.band as UrgencyResult['band'],
              reason: String(fc.args.reason ?? ''),
              disclaimer: String(fc.args.disclaimer ?? ''),
            });
            setPhase('urgency');
          }
          if (fc.name === 'confirmAction' && isAffirmative(String(fc.args.affirmativePhrase ?? ''))) {
            setPhase('book');
            void api<{ facilities: Array<{ id: string }> }>('/facilities').then((r) => {
              if (r.facilities[0]) setFacilityId(r.facilities[0].id);
            });
          }
          if (fc.name === 'bookAppointment' && fc.args.facilityId) {
            setFacilityId(String(fc.args.facilityId));
            void confirmBook();
          }
        }
        if (turn.text || (turn.functionCalls && turn.functionCalls.length)) return;
      } catch {
        /* local fallback below */
      }

      const kn = i18n.language === 'kn';
      const qs = kn ? FOLLOWUPS_KN : FOLLOWUPS_EN;

      if (phase === 'complaint') {
        setComplaint(text);
        setPhase('q1');
        push('assistant', qs[0]);
        return;
      }
      if (phase === 'q1') {
        setAnswers([text]);
        setPhase('q2');
        push('assistant', qs[1]);
        return;
      }
      if (phase === 'q2') {
        const all = [...answers, text];
        setAnswers(all);
        const result = assessUrgencyFallback(complaint, all);
        setUrgency(result);
        setPhase('urgency');
        push(
          'assistant',
          kn
            ? `ತುರ್ತು ಮಟ್ಟ: ${result.band}. ${result.reason} ${result.disclaimer}`
            : `Urgency: ${result.band}. ${result.reason} ${result.disclaimer}`
        );
        push(
          'assistant',
          kn
            ? 'ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡೋಣವೇ? ಹೌದು ಎಂದು ಹೇಳಿ.'
            : 'Shall I book an appointment at a nearby facility? Say yes / ಹೌದು.'
        );
        void api<{ facilities: Array<{ id: string }> }>('/facilities').then((r) => {
          if (r.facilities[0]) setFacilityId(r.facilities[0].id);
        });
        setPhase('book');
        return;
      }
      if (phase === 'book' && isAffirmative(text)) {
        void confirmBook();
      }
    })();
  }

  async function confirmBook() {
    if (!facilityId || !urgency) return;
    await api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        facilityId,
        specialty: 'General Physician',
        urgency: urgency.band,
        symptoms: complaint,
        bookedVia: 'voice',
        confirmed: true,
      }),
    });
    setBooked(true);
    push(
      'assistant',
      i18n.language === 'kn' ? 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ದೃಢಪಟ್ಟಿದೆ.' : 'Appointment confirmed.'
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    handleUserText(input.trim());
    setInput('');
  }

  function startSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setLiveNote(t('voice.fallback'));
      return;
    }
    const rec = new SR();
    rec.lang = i18n.language === 'kn' ? 'kn-IN' : 'en-IN';
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0][0].transcript;
      handleUserText(text);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/voice', label: t('nav.voice') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('voice.title')}</h1>
      {liveNote && <p className="mt-2 text-sm text-leaf-100/60">{liveNote}</p>}

      <div className="bg-panel mt-6 max-h-[50vh] space-y-3 overflow-y-auto rounded-2xl p-4 text-ink">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-forest-800 text-leaf-50' : 'bg-white'}`}
          >
            {m.text}
          </div>
        ))}
      </div>

      {urgency && (
        <div className="mt-4">
          <UrgencyBanner band={urgency.band} reason={urgency.reason} disclaimer={urgency.disclaimer} />
        </div>
      )}

      {phase === 'book' && !booked && facilityId && (
        <ConfirmGate onConfirm={() => void confirmBook()} />
      )}
      {booked && <p className="mt-3 text-leaf-100">✓ Booked</p>}

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-md border-0 bg-white/95 px-3 py-2 text-ink"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('voice.fallback')}
        />
        <button type="submit" className="rounded-md bg-leaf-100 px-4 py-2 font-medium text-forest-900">
          {t('voice.send')}
        </button>
        <button
          type="button"
          onClick={startSpeech}
          className={`rounded-md px-4 py-2 font-medium ${listening ? 'bg-clay-600 text-white' : 'bg-white/15 text-leaf-50'}`}
        >
          {listening ? t('voice.listening') : t('voice.start')}
        </button>
      </form>
    </Shell>
  );
}
