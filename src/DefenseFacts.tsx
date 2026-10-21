import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { resolveDefense, type Champion } from './champion';

const METRIC_CLASS = 'grid min-w-0 content-start border-t border-white/[0.08] py-2';
const LABEL_CLASS = 'text-xs text-zinc-400';
const VALUE_CLASS = 'break-words text-sm font-semibold text-zinc-100';

function Metric({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`${METRIC_CLASS} ${className}`.trim()}>
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className={VALUE_CLASS}>{children}</dd>
    </div>
  );
}

function formatDays(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Renders inside the card's <dl>: two entries for a known defense, otherwise one
 * entry spanning both slots so an absence is stated exactly once.
 */
export function DefenseFacts({ champion }: { champion: Champion }) {
  const defense = resolveDefense(champion);

  if (defense.status === 'known') {
    return (
      <>
        <Metric label="Last defended">{defense.lastDefenseDate}</Metric>
        <Metric label="Since defense">
          {defense.daysSinceLastDefense === null ? 'Unavailable' : formatDays(defense.daysSinceLastDefense)}
        </Metric>
      </>
    );
  }

  return (
    <Metric label="Defense history" className="col-span-full">
      {defense.status === 'none' ? 'Confirmed: no defenses this reign' : 'Defense history unavailable'}
    </Metric>
  );
}

const SOURCE_HOSTS: Record<'wweUrl' | 'cagematchUrl', string> = {
  wweUrl: 'wwe.com',
  cagematchUrl: 'cagematch.net',
};

/** Only https links on the expected source domain are rendered; anything else is dropped. */
function safeSourceUrl(value: string | undefined, host: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const onHost = url.hostname === host || url.hostname.endsWith(`.${host}`);
    return url.protocol === 'https:' && onHost && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function ChampionSources({ champion }: { champion: Champion }) {
  const links = [
    {
      href: safeSourceUrl(champion.source?.wweUrl, SOURCE_HOSTS.wweUrl),
      text: 'WWE profile',
      context: ` for ${champion.championName}`,
    },
    {
      href: safeSourceUrl(champion.source?.cagematchUrl, SOURCE_HOSTS.cagematchUrl),
      text: 'Cagematch history',
      context: ` for ${champion.titleName}`,
    },
  ].filter((link): link is { href: string; text: string; context: string } => link.href !== null);

  if (links.length === 0) return null;

  return (
    <ul aria-label={`Sources for ${champion.championName}, ${champion.titleName}`} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {links.map((link) => (
        <li key={link.href} className="min-w-0">
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 break-words rounded-sm text-zinc-300 underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
          >
            <span>
              {link.text}
              <span className="sr-only">{link.context} (opens in a new tab)</span>
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
