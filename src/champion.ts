export type DefenseStatus = 'known' | 'none' | 'unavailable';

export type Champion = {
  titleName: string;
  championName: string;
  imageUrl: string | null;
  championshipDate: string | null;
  daysAsChampion: number | null;
  lastDefenseDate: string | null;
  daysSinceLastDefense: number | null;
  /** Absent in snapshots written before the status existed; see resolveDefense. */
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

const DEFENSE_STATUSES: readonly unknown[] = ['known', 'none', 'unavailable'] satisfies DefenseStatus[];

const isStringOrNull = (value: unknown) => typeof value === 'string' || value === null;

function isSource(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return (
    (source.wweUrl === undefined || typeof source.wweUrl === 'string') &&
    (source.cagematchUrl === undefined || typeof source.cagematchUrl === 'string')
  );
}

function isChampion(value: unknown): value is Champion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.titleName === 'string' &&
    typeof item.championName === 'string' &&
    isStringOrNull(item.imageUrl) &&
    isStringOrNull(item.championshipDate) &&
    (typeof item.daysAsChampion === 'number' || item.daysAsChampion === null) &&
    isStringOrNull(item.lastDefenseDate) &&
    (typeof item.daysSinceLastDefense === 'number' || item.daysSinceLastDefense === null) &&
    // Absent only in snapshots written before the field existed.
    (item.defenseStatus === undefined || DEFENSE_STATUSES.includes(item.defenseStatus)) &&
    isSource(item.source)
  );
}

/** A snapshot is accepted only when every champion record has the shape the dashboard renders. */
export function isChampionRecords(value: unknown): value is Champion[] {
  return Array.isArray(value) && value.every(isChampion);
}

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
 * Normalize a champion record to one defense state. Never infers "none" from missing,
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
