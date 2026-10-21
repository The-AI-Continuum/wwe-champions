import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Champion } from './champion';

type Family = 'main' | 'nxt' | 'evolve';
type FamilyFilter = Family | 'all';

const FAMILY_LABELS: Record<Family, string> = {
  main: 'Main roster',
  nxt: 'NXT',
  evolve: 'Evolve',
};
const FAMILY_ORDER: Family[] = ['main', 'nxt', 'evolve'];

const FIELD_LABEL = 'text-xs font-medium text-zinc-400';
const FIELD_CONTROL =
  'h-10 w-full rounded-md border border-white/20 bg-ink-900 px-3 text-base text-white placeholder:text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300';

// Titles are classified only from the title name: NXT and Evolve titles say so, anything else is Main roster.
// The snapshot carries no Raw/SmackDown data, so no finer split is attempted.
function familyOf(titleName: string): Family {
  if (/\bnxt\b/i.test(titleName)) return 'nxt';
  if (/\bevolve\b/i.test(titleName)) return 'evolve';
  return 'main';
}

// The snapshot mixes straight and curly apostrophes ("Women's" / "Women’s"); treat them as one character.
function normalize(value: string) {
  return value.replace(/[‘’]/g, "'").toLowerCase();
}

function describeCount(shown: number, total: number) {
  if (shown === 0) return 'No champions match the current search and roster.';
  if (shown === total) return `${total} ${total === 1 ? 'champion' : 'champions'}`;
  return `${shown} of ${total} ${total === 1 ? 'champion' : 'champions'}`;
}

export function ChampionDirectory({
  champions,
  renderChampion,
}: {
  champions: Champion[];
  renderChampion: (champion: Champion) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<FamilyFilter>('all');
  // Empty until the visitor changes a filter, so the initial render never announces a count.
  const [announcement, setAnnouncement] = useState('');
  const queryRef = useRef<HTMLInputElement>(null);

  // App announces snapshot reloads; discard filter counts from the previous snapshot.
  useEffect(() => {
    setAnnouncement('');
  }, [champions]);

  const entries = useMemo(
    () =>
      champions.map((champion) => ({
        champion,
        family: familyOf(champion.titleName),
        haystack: normalize(`${champion.championName}\n${champion.titleName}`),
      })),
    [champions],
  );

  const familyCounts = useMemo(() => {
    const counts: Record<Family, number> = { main: 0, nxt: 0, evolve: 0 };
    for (const entry of entries) counts[entry.family] += 1;
    return counts;
  }, [entries]);

  // A refreshed snapshot may drop the selected roster; fall back to all rather than show an unreachable filter.
  const family: FamilyFilter =
    selectedFamily !== 'all' && familyCounts[selectedFamily] === 0 ? 'all' : selectedFamily;

  const filter = (nextQuery: string, nextFamily: FamilyFilter) => {
    const needle = normalize(nextQuery.trim());
    return entries.filter(
      (entry) =>
        (nextFamily === 'all' || entry.family === nextFamily) &&
        (needle === '' || entry.haystack.includes(needle)),
    );
  };

  const visible = filter(query, family);
  const total = entries.length;
  const trimmedQuery = query.trim();
  const isFiltered = trimmedQuery !== '' || family !== 'all';

  if (total === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-ink-850 p-6 text-sm text-zinc-300">
        No champion records are available in this snapshot.
      </p>
    );
  }

  const changeQuery = (value: string) => {
    setQuery(value);
    setAnnouncement(describeCount(filter(value, family).length, total));
  };

  const changeFamily = (value: FamilyFilter) => {
    setSelectedFamily(value);
    setAnnouncement(describeCount(filter(query, value).length, total));
  };

  const reset = () => {
    setQuery('');
    setSelectedFamily('all');
    setAnnouncement(`Filters reset. ${describeCount(total, total)}.`);
    queryRef.current?.focus();
  };

  const familyLabel = family === 'all' ? 'all rosters' : FAMILY_LABELS[family];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor="champion-search" className={FIELD_LABEL}>
            Search champion or title
          </label>
          <input
            ref={queryRef}
            id="champion-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="e.g. Intercontinental or Zayn"
            className={FIELD_CONTROL}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="champion-roster" className={FIELD_LABEL}>
            Roster
          </label>
          <select
            id="champion-roster"
            value={family}
            onChange={(event) => changeFamily(event.target.value as FamilyFilter)}
            className={FIELD_CONTROL}
          >
            <option value="all">All rosters ({total})</option>
            {FAMILY_ORDER.filter((key) => familyCounts[key] > 0).map((key) => (
              <option key={key} value={key}>
                {FAMILY_LABELS[key]} ({familyCounts[key]})
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm text-zinc-400">
        {visible.length > 0
          ? `Showing ${describeCount(visible.length, total)}${isFiltered ? ` · ${familyLabel}` : ''}`
          : 'Showing 0 champions'}
      </p>

      {/* Persistent polite region: only filter changes write to it, never the initial render. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {visible.length > 0 ? (
        <section
          aria-label="Current champions"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map(({ champion }) => (
            <Fragment key={`${champion.titleName}-${champion.championName}`}>
              {renderChampion(champion)}
            </Fragment>
          ))}
        </section>
      ) : (
        <div className="rounded-lg border border-white/10 bg-ink-850 p-6">
          <p className="break-words text-sm text-zinc-200">
            No champions match
            {trimmedQuery !== '' && <> “{trimmedQuery}”</>}
            {family !== 'all' && <> in {FAMILY_LABELS[family]}</>}.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
          >
            Reset search and roster
          </button>
        </div>
      )}
    </div>
  );
}
