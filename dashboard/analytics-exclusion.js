const cookie = 'myself_internal_traffic';

export function browserTrafficExcluded() {
  return document.cookie.split(';').some((value) => value.trim() === `${cookie}=1`);
}

/** This local preference excludes this browser, including signed-out visits.
 * @param {boolean} excluded */
export function setBrowserTrafficExcluded(excluded) {
  document.cookie = `${cookie}=${excluded ? '1' : ''}; Path=/; Max-Age=${excluded ? 31536000 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  if (browserTrafficExcluded() !== excluded)
    throw new Error('Could not save this browser’s traffic preference. Check cookie settings.');
}
