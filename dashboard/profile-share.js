import { profileFromLink, profileLink } from '../core/profiles.js';
import { domains } from '../core/data.js';

const name = document.getElementById('profile-name');
const summary = document.getElementById('profile-summary');
const open = document.getElementById('profile-open');
const copy = document.getElementById('profile-copy');
const status = document.getElementById('profile-status');
function reviewProfile() {
  if (
    !(open instanceof HTMLAnchorElement) ||
    !(copy instanceof HTMLButtonElement) ||
    !name ||
    !summary ||
    !status
  )
    throw new Error('Profile review controls are missing.');
  open.hidden = true;
  open.removeAttribute('href');
  copy.hidden = true;
  status.textContent =
    'If the app does not open, use Copy profile link and paste it into New profile in myself.md.';
  try {
    const profile = profileFromLink(location.href);
    name.textContent = profile.name;
    summary.textContent = `${domains.reduce((count, domain) => count + profile.selection[domain].length, 0)} selected data types · ${profile.export.formats.join(' + ').toUpperCase()}`;
    open.href = profileLink(profile);
    open.hidden = false;
    copy.hidden = false;
  } catch {
    name.textContent = 'This profile link is invalid';
    summary.textContent = 'Ask the person helping you to share the profile again.';
    status.textContent = 'Use the complete shared link, including its profile settings.';
  }
}
reviewProfile();
window.addEventListener('hashchange', reviewProfile);
if (copy instanceof HTMLButtonElement && status) {
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent =
        'Copied. In myself.md, choose New profile and paste this link to review it.';
    } catch {
      status.textContent =
        'Copy the link from your browser’s address bar, then paste it into New profile in myself.md.';
    }
  });
}
