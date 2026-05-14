import type { MovieSnapshot } from './store.js';

export interface RatingDelta {
  id: number;
  title: string;
  before: { rating: number | null; ratingCount: number | null } | null;
  after: { rating: number | null; ratingCount: number | null };
}

export interface ScrapeError {
  id: number;
  message: string;
}

export interface DailyDiff {
  date: string;
  generatedAt: string;
  changed: RatingDelta[];
  added: RatingDelta[];
  unchanged: number[];
  errors: ScrapeError[];
}

export function detectChange(
  previous: MovieSnapshot | null,
  current: MovieSnapshot
): { kind: 'added' | 'changed' | 'unchanged'; delta?: RatingDelta } {
  const after = { rating: current.rating, ratingCount: current.ratingCount };

  if (!previous) {
    return {
      kind: 'added',
      delta: { id: current.id, title: current.title, before: null, after }
    };
  }

  const ratingChanged = previous.rating !== current.rating;
  const countChanged = previous.ratingCount !== current.ratingCount;

  if (!ratingChanged && !countChanged) {
    return { kind: 'unchanged' };
  }

  return {
    kind: 'changed',
    delta: {
      id: current.id,
      title: current.title,
      before: { rating: previous.rating, ratingCount: previous.ratingCount },
      after
    }
  };
}
