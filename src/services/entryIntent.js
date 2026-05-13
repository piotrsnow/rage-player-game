let pendingRoute = null;

export function captureEntryIntent(pathname) {
  if (pathname && pathname !== '/' && pathname !== '') {
    pendingRoute = pathname;
  }
}

export function consumeEntryIntent() {
  const r = pendingRoute;
  pendingRoute = null;
  return r;
}

export function peekEntryIntent() {
  return pendingRoute;
}
