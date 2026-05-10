import { useSyncExternalStore } from 'react';
import { subscribeDialog, getDialogSnapshot } from '../utils/readAloudExclusive';

const _cache = { ref: null, obj: null };

function getSnapshot() {
  const live = getDialogSnapshot();
  const prev = _cache.ref;
  if (
    prev
    && prev.state === live.state
    && prev.source === live.source
    && prev.messageId === live.messageId
    && prev.segmentIndex === live.segmentIndex
    && prev.sessionId === live.sessionId
  ) {
    return _cache.obj;
  }
  _cache.ref = live;
  _cache.obj = live;
  return live;
}

export function useDialogAudioSnapshot() {
  return useSyncExternalStore(subscribeDialog, getSnapshot, getSnapshot);
}
