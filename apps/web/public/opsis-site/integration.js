import {navigateTool} from './app.js';
import {c} from './locale.js';
// Public identities only; no private labels or amounts enter the film.
document.querySelector('#lock-preview').addEventListener('click', () => document.dispatchEvent(new CustomEvent('opsis:navigate', {detail:{type:'opsis:lock'}})));
document.querySelector('#lock-preview').disabled=false;
document.querySelector('#public-search').addEventListener('submit', event => {
  event.preventDefault();
  const entity = document.querySelector('#public-entity').value.trim();
  if (!/^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(entity)) {
    document.querySelector('#search-error').textContent = c('Enter a complete public address or transaction hash.','请输入完整的公开地址或交易哈希。');
    return;
  }
  document.querySelector('#search-error').textContent = '';
  navigateTool('research', entity, document.querySelector('#public-search button'));
});
document.addEventListener('opsis:host-ready', () => { document.documentElement.dataset.hostReady = 'true'; });
document.documentElement.dataset.integrated = 'true';
