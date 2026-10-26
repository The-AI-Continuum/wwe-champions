import { Trophy } from 'lucide-react';
import { useState } from 'react';
import type { Champion } from './champion';
import { ChampionSources, DefenseFacts, Metric } from './DefenseFacts';

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  return value;
}

function ChampionImage({ champion }: { champion: Champion }) {
  const [failed, setFailed] = useState(!champion.imageUrl);
  const frame = 'h-[4.5rem] w-[4.5rem] shrink-0';

  if (failed) {
    return (
      <div className={`flex ${frame} items-center justify-center bg-[linear-gradient(145deg,#202024,#111113)]`}>
        <Trophy className="h-7 w-7 text-arena-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={champion.imageUrl}
      alt={`${champion.championName} official WWE profile headshot`}
      width={72}
      height={72}
      className={`${frame} object-cover object-top saturate-[.95]`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function formatDays(days: number | null | undefined) {
  if (days === null || days === undefined) return null;
  return `${days.toLocaleString()} ${days === 1 ? 'day' : 'days'}`;
}

export function ChampionCard({ champion }: { champion: Champion }) {
  return (
    <article className="overflow-hidden rounded-[4px] border border-white/[0.08] bg-arena-card px-[0.9rem] pb-[0.55rem] pt-[0.85rem]">
      <div className="flex min-w-0 gap-[0.7rem] pb-[0.45rem]">
        <ChampionImage key={champion.imageUrl} champion={champion} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[0.5625rem] font-semibold uppercase leading-relaxed tracking-[0.12em] text-arena-muted">
            {champion.titleName}
          </h2>
          <p className="mt-[0.1rem] break-words text-pretty text-[1.0625rem] font-bold leading-tight tracking-[-0.01em] text-white">
            {champion.championName}
          </p>
          <ChampionSources champion={champion} />
        </div>
      </div>

      {/* DOM order matches the visual order: reign length, champion since, last defended, since defense. */}
      <dl className="mt-[0.4rem] grid grid-cols-2 gap-x-4 border-t border-white/[0.08]">
        <Metric label="Reign length" variant="hero">
          {formatValue(formatDays(champion.daysAsChampion))}
        </Metric>
        <Metric label="Champion since">{formatValue(champion.championshipDate)}</Metric>
        <DefenseFacts champion={champion} />
      </dl>
    </article>
  );
}

export default ChampionCard;
