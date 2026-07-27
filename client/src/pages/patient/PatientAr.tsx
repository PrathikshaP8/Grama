import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';

/** Lightweight AR-style framing guide for symptom photos — extension point for future AI vision. */
export function PatientAr() {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blurry, setBlurry] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => setError('Camera permission needed'));

    return () => stream?.getTracks().forEach((tr) => tr.stop());
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    // Simple Laplacian-ish blur heuristic via downscale variance
    const sample = ctx.getImageData(0, 0, Math.min(80, canvas.width), Math.min(60, canvas.height));
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < sample.data.length; i += 4) {
      const g = (sample.data[i] + sample.data[i + 1] + sample.data[i + 2]) / 3;
      sum += g;
      sumSq += g * g;
    }
    const n = sample.data.length / 4;
    const variance = sumSq / n - (sum / n) ** 2;
    const isBlur = variance < 200;
    setBlurry(isBlur);
    if (!isBlur) {
      setShot(canvas.toDataURL('image/jpeg', 0.85));
    }
  }, []);

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/ar', label: t('nav.ar') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('nav.ar')}</h1>
      <p className="mt-2 max-w-lg text-sm text-leaf-100/70">
        Align the symptom area inside the guide. Blurry frames are rejected. Images are stored locally
        for this demo — ready for future AI image analysis.
      </p>

      <div className="relative mx-auto mt-6 max-w-md overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-dashed border-leaf-100/80" />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {blurry && <p className="mt-3 text-sm text-amber-200">Too blurry — hold steady and try again.</p>}

      <button
        type="button"
        onClick={capture}
        className="mt-4 rounded-md bg-leaf-100 px-5 py-2.5 font-semibold text-forest-900"
      >
        Capture
      </button>

      {shot && (
        <div className="mt-4">
          <img src={shot} alt="Symptom capture" className="max-w-xs rounded-lg" />
          <p className="mt-2 text-xs text-leaf-100/60">Saved to session (extension point for object storage).</p>
        </div>
      )}
    </Shell>
  );
}
