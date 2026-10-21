const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function formatGeneratedDate(updatedAt: string | null) {
  if (!updatedAt) return null;
  // Date-only values parse as UTC; timestamps are rendered in UTC too, so the
  // displayed day never shifts with the viewer's timezone.
  const date = new Date(DATE_ONLY.test(updatedAt) ? `${updatedAt}T00:00:00Z` : updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return { label: DATE_FORMAT.format(date), iso: date.toISOString() };
}

export function SnapshotNote({ updatedAt }: { updatedAt: string | null }) {
  const generated = formatGeneratedDate(updatedAt);

  return (
    <p className="text-xs text-zinc-400">
      {generated ? (
        <>
          Cached snapshot generated <time dateTime={generated.iso}>{generated.label}</time> (UTC).
        </>
      ) : (
        <>Cached snapshot; generation date unavailable.</>
      )}{' '}
      Day counts are cached at refresh, not live; retained source values may be older.
      {' '}Scheduled weekly refresh. Sourced from WWE.com and Cagematch; coverage is not complete verification.
    </p>
  );
}

export default SnapshotNote;
