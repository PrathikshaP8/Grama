import { LocationCode } from '../models/LocationCode.js';

function consonantsOf(name: string): string {
  const consonants = name.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
  if (consonants.length >= 3) return consonants.slice(0, 3);
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  return (letters + 'XXX').slice(0, 3);
}

export async function allocateUniqueId(city: string): Promise<{ uniqueId: string; code: string }> {
  const cityKey = city.trim().toLowerCase();
  let loc = await LocationCode.findOne({ cityName: cityKey });

  if (!loc) {
    const code = consonantsOf(city) || 'RUR';
    try {
      loc = await LocationCode.create({ cityName: cityKey, code, nextSequence: 1 });
    } catch {
      loc = await LocationCode.findOne({ cityName: cityKey });
      if (!loc) {
        loc = await LocationCode.findOneAndUpdate(
          { code: 'RUR' },
          { $setOnInsert: { cityName: 'rural', code: 'RUR', nextSequence: 1 } },
          { upsert: true, new: true }
        );
      }
    }
  }

  if (!loc) throw new Error('Failed to allocate location code');

  const updated = await LocationCode.findOneAndUpdate(
    { _id: loc._id },
    { $inc: { nextSequence: 1 } },
    { new: false }
  );
  if (!updated) throw new Error('Failed to increment sequence');

  const seq = updated.nextSequence;
  const uniqueId = `${updated.code}${String(seq).padStart(2, '0')}`;
  return { uniqueId, code: updated.code };
}
