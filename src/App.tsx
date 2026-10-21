import { AlertCircle, CalendarDays, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { statusMessage, type FreshnessState } from './statusMessage';

type Champion = {
  titleName: string;
  championName: string;
  imageUrl: string;
  championshipDate: string | null;
  daysAsChampion: number | null;
  lastDefenseDate: string | null;
  daysSinceLastDefense: number | null;
  source?: {
    wweUrl?: string;
    cagematchUrl?: string;
  };
};

type CacheMetadata = {
  generatedAt: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; champions: Champion[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };


const NO_DEFENSE = 'No Title Defenses Yet';

function isChampion(value: unknown): value is Champion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.titleName === 'string' && typeof item.championName === 'string';
}

function isCacheMetadata(value: unknown): value is CacheMetadata {
  if (!value || typeof value !== 'object') return false;
  const generatedAt = (value as Record<string, unknown>).generatedAt;
  return typeof generatedAt === 'string' && !Number.isNaN(Date.parse(generatedAt));
}

function formatValue(value: string | number | null | undefined, fallback = 'Unavailable') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

function ChampionImage({ champion }: { champion: Champion }) {
  const [failed, setFailed] = useState(!champion.imageUrl);

  if (failed) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_50%_18%,rgba(216,167,47,0.28),transparent_34%),linear-gradient(145deg,#202024,#111113)]">
        <Trophy className="h-14 w-14 text-gold-300/80" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={champion.imageUrl}
      alt={`${champion.championName} official WWE profile headshot`}
      className="aspect-[4/3] w-full object-cover object-top"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-white/8 py-3 text-sm">
      <dt className="font-semibold text-zinc-200">{label}</dt>
      <dd className="max-w-[12rem] truncate text-right text-zinc-400" title={String(formatValue(value))}>
        {formatValue(value)}
      </dd>
    </div>
  );
}

function ChampionCard({ champion }: { champion: Champion }) {
  const lastDefense = champion.lastDefenseDate || NO_DEFENSE;
  const daysSinceDefense =
    lastDefense === NO_DEFENSE ? NO_DEFENSE : formatValue(champion.daysSinceLastDefense);

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-ink-850 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-white/20">
      <ChampionImage champion={champion} />
      <div className="space-y-5 p-4">
        <div className="space-y-3">
          <h2 className="min-h-6 text-pretty text-base font-semibold leading-6 text-zinc-100">
            {champion.titleName}
          </h2>
          <p className="text-balance text-2xl font-semibold leading-tight text-white">
            {champion.championName}
          </p>
        </div>

        <dl>
          <StatRow label="Championship Date" value={champion.championshipDate} />
          <StatRow label="Days as Champion" value={champion.daysAsChampion} />
          <StatRow label="Last Defense Date" value={lastDefense} />
          <StatRow label="Days Since Last Defense" value={daysSinceDefense} />
        </dl>
      </div>
    </article>
  );
}

function StatusPanel({ state }: { state: Exclude<LoadState, { status: 'ready' }> }) {
  const copy = {
    loading: {
      title: 'Loading champions',
      message: 'Loading the latest available champion snapshot.',
    },
    empty: {
      title: 'No champions found',
      message: 'The available snapshot contains no champion records. Use Reload snapshot to check again.',
    },
    error: {
      title: 'Could not load champions',
      message: state.status === 'error' ? state.message : 'The champion snapshot could not be loaded.',
    },
  }[state.status];

  return (
    <div className="rounded-lg border border-white/10 bg-ink-850 p-6 text-zinc-300">
      <div className="mb-3 flex items-center gap-3 text-white">
        <AlertCircle className="h-5 w-5 text-gold-300" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{copy.title}</h2>
      </div>
      <p>{copy.message}</p>
    </div>
  );
}

function formatLastUpdated(state: FreshnessState) {
  if (state.status !== 'known') {
    return state.status === 'pending' ? 'Checking update time' : 'Update time unavailable';
  }

  const date = new Date(state.updatedAt);
  if (Number.isNaN(date.getTime())) return 'Update time unavailable';
  return `Last updated ${date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [freshness, setFreshness] = useState<FreshnessState>({ status: 'pending' });
  const [isLoading, setIsLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [championError, setChampionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const currentRequest = useRef(0);
  const hasLoadedChampions = useRef(false);

  const loadSnapshot = useCallback(async (isRetry = false) => {
    const requestId = ++currentRequest.current;
    const metadataController = new AbortController();

    setIsLoading(true);
    setRetrying(isRetry);
    setChampionError(null);
    setAnnouncement('');
    setFreshness({ status: 'pending' });
    if (!hasLoadedChampions.current) setState({ status: 'loading' });

    const loadChampions = async (): Promise<Exclude<LoadState, { status: 'loading' }> | null> => {
      try {
        const response = await fetch('/champions.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Champion snapshot request failed with HTTP ${response.status}.`);

        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isChampion)) {
          throw new Error('The champion snapshot is not a valid champion list.');
        }

        if (requestId !== currentRequest.current) return null;
        hasLoadedChampions.current = true;
        const result: LoadState = data.length > 0 ? { status: 'ready', champions: data } : { status: 'empty' };
        setState(result);
        return result;
      } catch {
        if (requestId !== currentRequest.current) return null;
        const message = hasLoadedChampions.current
          ? 'The snapshot could not be reloaded. The previous snapshot remains visible. Use Reload snapshot to try again.'
          : 'Champion data could not be loaded. Use Reload snapshot to try again.';
        setChampionError(message);
        setFreshness({ status: 'unavailable' });
        setAnnouncement(message);
        setState((previous) =>
          previous.status === 'ready' || previous.status === 'empty'
            ? previous
            : { status: 'error', message },
        );
        return { status: 'error', message };
      } finally {
        if (requestId === currentRequest.current) setIsLoading(false);
      }
    };

    const loadMetadata = async (): Promise<string | null> => {
      let metadataTimeout: number | undefined;
      try {
        const metadata = await Promise.race([
          (async () => {
            const response = await fetch('/metadata.json', {
              cache: 'no-store',
              signal: metadataController.signal,
            });
            if (!response.ok) throw new Error('Metadata request failed.');
            return response.json() as Promise<unknown>;
          })(),
          new Promise<never>((_, reject) => {
            metadataTimeout = window.setTimeout(() => {
              metadataController.abort();
              reject(new Error('Metadata request timed out.'));
            }, 10_000);
          }),
        ]);
        return isCacheMetadata(metadata) ? metadata.generatedAt : null;
      } catch {
        return null;
      } finally {
        if (metadataTimeout !== undefined) window.clearTimeout(metadataTimeout);
      }
    };

    const [result, updatedAt] = await Promise.all([loadChampions(), loadMetadata()]);
    if (requestId === currentRequest.current && result) {
      const nextFreshness: FreshnessState = result.status !== 'error' && updatedAt
        ? { status: 'known', updatedAt }
        : { status: 'unavailable' };
      setFreshness(nextFreshness);
      setAnnouncement(statusMessage(result, nextFreshness));
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(false);
    return () => {
      currentRequest.current += 1;
    };
  }, [loadSnapshot]);

  const championCount = state.status === 'ready' ? state.champions.length : 0;
  const subtitle = useMemo(() => {
    if (state.status !== 'ready') return 'Local cache driven champion intelligence';
    return `${championCount} active championship ${championCount === 1 ? 'record' : 'records'}`;
  }, [championCount, state.status]);

  return (
    <main className="min-h-screen bg-ink-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-zinc-400">
              <CalendarDays className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
              {formatLastUpdated(freshness)}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                WWE Champions
              </h1>
              <p className="mt-2 text-sm text-zinc-400 sm:text-base">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isLoading && !retrying) void loadSnapshot(true);
            }}
            aria-disabled={isLoading || retrying}
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            {retrying ? 'Reloading snapshot…' : isLoading ? 'Loading snapshot…' : 'Reload snapshot'}
          </button>
        </header>
        <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>

        {championError && state.status !== 'error' && (
          <p className="text-sm text-amber-200">{championError}</p>
        )}

        {state.status === 'ready' ? (
          <section
            aria-label="Current champions"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {state.champions.map((champion) => (
              <ChampionCard key={`${champion.titleName}-${champion.championName}`} champion={champion} />
            ))}
          </section>
        ) : (
          <StatusPanel state={state} />
        )}
      </div>
    </main>
  );
}
