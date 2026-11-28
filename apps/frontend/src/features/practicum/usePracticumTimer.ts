import { createContext, useContext } from 'react';
import type { TimerState } from './practicum.types';

type TimerContextValue = Readonly<{
  state: TimerState | null;
  busy: boolean;
  receivedAt: number;
  error: string | null;
  refresh: () => Promise<void>;
  stopping: boolean;
  stopError: string | null;
  stop: () => Promise<void>;
  stopState: Readonly<{
    entryId: string;
    endedAt: string;
    confirmed: boolean;
  }> | null;
}>;

export const PracticumTimerContext = createContext<TimerContextValue>({
  state: null,
  busy: false,
  receivedAt: 0,
  error: null,
  refresh: async () => {},
  stopping: false,
  stopError: null,
  stop: async () => {},
  stopState: null,
});

export function usePracticumTimer() {
  return useContext(PracticumTimerContext);
}
