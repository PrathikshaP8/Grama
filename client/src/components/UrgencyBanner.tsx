export function UrgencyBanner({
  band,
  reason,
  disclaimer,
}: {
  band: string;
  reason?: string;
  disclaimer?: string;
}) {
  const colors: Record<string, string> = {
    routine: 'bg-forest-700/90',
    soon: 'bg-amber-700/90',
    urgent: 'bg-orange-700/90',
    emergency: 'bg-red-800/90',
  };
  return (
    <div className={`rounded-lg px-4 py-3 text-leaf-50 ${colors[band] ?? 'bg-forest-800'}`}>
      <p className="font-display text-lg capitalize">{band}</p>
      {reason && <p className="mt-1 text-sm opacity-95">{reason}</p>}
      <p className="mt-2 text-xs opacity-80">
        {disclaimer ||
          'This is not a medical diagnosis. Seek emergency care immediately if you feel unsafe.'}
      </p>
    </div>
  );
}
