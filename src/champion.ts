export type DefenseStatus = 'known' | 'none' | 'unavailable';

export type Champion = {
  titleName: string;
  championName: string;
  imageUrl: string;
  championshipDate: string | null;
  daysAsChampion: number | null;
  lastDefenseDate: string | null;
  daysSinceLastDefense: number | null;
  /** Absent in caches written before the status existed; see resolveDefense. */
  defenseStatus?: DefenseStatus;
  source?: {
    wweUrl?: string;
    cagematchUrl?: string;
  };
};

export type ResolvedDefense =
  | { status: 'known'; lastDefenseDate: string; daysSinceLastDefense: number | null }
  | { status: 'none' }
  | { status: 'unavailable' };

function usableDate(value: unknown): value is string {
  // Rejects blank text and legacy/free-text markers such as "No Title Defenses Yet".
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !/no\s+title\s+defen[cs]es/i.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function usableDays(value: unknown): number | null {
  // 0 is a real count (defended today); only negative or non-numeric values are unusable.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Normalize a cache record to one defense state. Never infers "none" from missing,
 * contradictory, or legacy data: before `defenseStatus` existed the text
 * "No Title Defenses Yet" was also written for failed and unmatched lookups, so it
 * and any other undated legacy record is unavailable. Only an explicit `none` with no
 * date is a confirmed zero-defense claim.
 */
export function resolveDefense(champion: Champion): ResolvedDefense {
  const { defenseStatus, lastDefenseDate, daysSinceLastDefense } = champion;

  if (defenseStatus === 'none') {
    return lastDefenseDate ? { status: 'unavailable' } : { status: 'none' };
  }

  if ((defenseStatus === 'known' || defenseStatus === undefined) && usableDate(lastDefenseDate)) {
    return {
      status: 'known',
      lastDefenseDate: lastDefenseDate.trim(),
      daysSinceLastDefense: usableDays(daysSinceLastDefense),
    };
  }

  return { status: 'unavailable' };
}
