import { Trophy } from 'lucide-react';
import { useState } from 'react';
import type { Champion } from './champion';
import { ChampionSources, DefenseFacts, Metric } from './DefenseFacts';

const IMAGE_FRAME = 'h-[4.5rem] w-[4.5rem] shrink-0';

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  return value;
}

function TrophyFallback() {
  return (
    <div className={`flex ${IMAGE_FRAME} items-center justify-center bg-[linear-gradient(145deg,#202024,#111113)]`}>
      <Trophy className="h-7 w-7 text-arena-muted" aria-hidden="true" />
    </div>
  );
}

function ChampionImage({ imageUrl, championName }: { imageUrl: string | null; championName: string }) {
  const [failed, setFailed] = useState(!imageUrl);

  if (failed) return <TrophyFallback />;

  return (
    <img
      src={imageUrl ?? undefined}
      alt={`${championName} official WWE profile headshot`}
      width={72}
      height={72}
      className={`${IMAGE_FRAME} object-cover object-top saturate-[.95]`}
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
  // A vacant title has no holder: it keeps its card, but shows no portrait and no reign facts.
  const holder = champion.vacant ? null : champion.championName;

  return (
    <article className="overflow-hidden rounded-[4px] border border-white/[0.08] bg-arena-card px-[0.9rem] pb-[0.55rem] pt-[0.85rem]">
      <div className="flex min-w-0 gap-[0.7rem] pb-[0.45rem]">
        {holder === null ? (
          <TrophyFallback />
        ) : (
          <ChampionImage key={champion.imageUrl} imageUrl={champion.imageUrl} championName={holder} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[0.5625rem] font-semibold uppercase leading-relaxed tracking-[0.12em] text-arena-muted">
            {champion.titleName}
          </h2>
          <p className="mt-[0.1rem] break-words text-pretty text-[1.0625rem] font-bold leading-tight tracking-[-0.01em] text-white">
            {holder ?? 'Vacant'}
          </p>
          <ChampionSources champion={champion} />
        </div>
      </div>

      {/* DOM order matches the visual order: reign length, champion since, last defended, since defense. */}
      {holder !== null && (
        <dl className="mt-[0.4rem] grid grid-cols-2 gap-x-4 border-t border-white/[0.08]">
          <Metric label="Reign length" variant="hero">
            {formatValue(formatDays(champion.daysAsChampion))}
          </Metric>
          <Metric label="Champion since">{formatValue(champion.championshipDate)}</Metric>
          <DefenseFacts champion={champion} />
        </dl>
      )}
    </article>
  );
}

export default ChampionCard;
