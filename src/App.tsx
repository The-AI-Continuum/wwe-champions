import { AlertCircle, CalendarDays } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { statusMessage, type FreshnessState } from './statusMessage';
import { SnapshotNote } from './SnapshotNote';
import type { Champion } from './champion';
import { ChampionCard } from './ChampionCard';
import { ChampionDirectory } from './ChampionDirectory';


type CacheMetadata = {
  generatedAt: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; champions: Champion[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };


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
    timeZone: 'UTC',
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
        if (result.status === 'empty') {
          setFreshness({ status: 'unavailable' });
          setAnnouncement(statusMessage(result, { status: 'unavailable' }));
        }
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
        if (requestId === currentRequest.current) {
          setIsLoading(false);
          setRetrying(false);
        }
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
    if (state.status !== 'ready') return 'Weekly championship snapshots';
    return `${championCount} championship ${championCount === 1 ? 'record' : 'records'} in this snapshot`;
  }, [championCount, state.status]);

  return (
    <main className="min-h-screen bg-ink-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 pb-4">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400">
              <CalendarDays className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
              {formatLastUpdated(freshness)}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
                WWE Champions
              </h1>
              <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
              <p className="mt-1 text-xs text-zinc-400">Weekly snapshot. Some day counts may be from an earlier snapshot.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isLoading && !retrying) void loadSnapshot(true);
            }}
            aria-disabled={isLoading || retrying}
            className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            {retrying ? 'Reloading snapshot…' : isLoading ? 'Loading snapshot…' : 'Reload snapshot'}
          </button>
        </header>
        <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>

        {championError && state.status !== 'error' && (
          <p className="text-sm text-amber-200">{championError}</p>
        )}

        {state.status === 'ready' ? (
          <ChampionDirectory
            champions={state.champions}
            renderChampion={(champion) => <ChampionCard champion={champion} />}
          />
        ) : (
          <StatusPanel state={state} />
        )}
        <footer>
          {freshness.status !== 'pending' && (
            <SnapshotNote updatedAt={freshness.status === 'known' ? freshness.updatedAt : null} />
          )}
        </footer>
      </div>
    </main>
  );
}
