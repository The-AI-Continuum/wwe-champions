import { Trophy } from 'lucide-react';
import { useState } from 'react';
import type { Champion } from './champion';
import { ChampionSources, DefenseFacts } from './DefenseFacts';

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  return value;
}

function ChampionImage({ champion }: { champion: Champion }) {
  const [failed, setFailed] = useState(!champion.imageUrl);

  if (failed) {
    return (
      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-[radial-gradient(circle_at_50%_18%,rgba(216,167,47,0.28),transparent_34%),linear-gradient(145deg,#202024,#111113)] sm:h-24 sm:w-20">
        <Trophy className="h-7 w-7 text-gold-300/80" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={champion.imageUrl}
      alt={`${champion.championName} official WWE profile headshot`}
      width={80}
      height={96}
      className="h-20 w-16 shrink-0 rounded-md object-cover object-top sm:h-24 sm:w-20"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function formatDays(days: number | null | undefined) {
  if (days === null || days === undefined) return null;
  return `${days.toLocaleString()} ${days === 1 ? 'day' : 'days'}`;
}

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid min-w-0 content-start border-t border-white/[0.08] py-2">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="break-words text-sm font-semibold tabular-nums text-zinc-100">{formatValue(value)}</dd>
    </div>
  );
}

export function ChampionCard({ champion }: { champion: Champion }) {
  return (
    <article className="row-span-3 grid grid-cols-2 grid-rows-subgrid gap-x-4 gap-y-0 overflow-hidden rounded-lg border border-white/10 bg-ink-850 px-3 pb-2 pt-3 shadow-card">
      <div className="col-span-2 flex min-w-0 gap-3 pb-3">
        <ChampionImage key={champion.imageUrl} champion={champion} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-pretty text-xs font-semibold leading-4 text-zinc-300">{champion.titleName}</h2>
          <p className="text-balance text-lg font-semibold leading-6 text-white">{champion.championName}</p>
          <ChampionSources champion={champion} />
        </div>
      </div>

      <dl className="contents">
        <Metric label="Champion since" value={champion.championshipDate} />
        <Metric label="Reign length" value={formatDays(champion.daysAsChampion)} />
        <DefenseFacts champion={champion} />
      </dl>
    </article>
  );
}

export default ChampionCard;
