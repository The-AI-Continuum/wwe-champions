export type FreshnessState =
  | { status: 'pending' | 'unavailable' }
  | { status: 'known'; updatedAt: string };

type SnapshotResult =
  | { status: 'loading' }
  | { status: 'ready'; champions: readonly unknown[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export function statusMessage(state: SnapshotResult, freshness: FreshnessState): string {
  if (state.status === 'loading') return '';
  if (state.status === 'error') return state.message;
  if (state.status === 'empty') {
    return 'The snapshot contains no champion records. Use Reload snapshot to check again.';
  }
  const count = state.champions.length;
  const update = freshness.status === 'unavailable' ? ' Update time unavailable.' : '';
  return `${count} championship ${count === 1 ? 'record' : 'records'} loaded.${update}`;
}
