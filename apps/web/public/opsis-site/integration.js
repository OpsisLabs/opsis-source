import './app.js?v=data-18';
// Only named destinations and a validated public identity cross this boundary.
// Preview credentials, private labels and amounts never enter the landing frame.
const send = (tool, entity) => document.dispatchEvent(new CustomEvent('opsis:navigate', {detail:{type:'opsis:open-tool',tool,entity}}));
document.querySelectorAll('[data-workspace]').forEach(button => button.addEventListener('click', () => send(button.dataset.workspace)));
document.querySelector('#lock-preview').addEventListener('click', () => document.dispatchEvent(new CustomEvent('opsis:navigate', {detail:{type:'opsis:lock'}})));
document.querySelector('#public-search').addEventListener('submit', event => {
  event.preventDefault();
  const entity = document.querySelector('#public-entity').value.trim();
  if (!/^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(entity)) {
    document.querySelector('#search-error').textContent = 'Enter a complete public address or transaction hash.';
    return;
  }
  document.querySelector('#search-error').textContent = '';
  send('research', entity);
});

document.addEventListener('opsis:host-ready', () => document.querySelectorAll('[data-workspace], #terminal-shortcut, #public-search button').forEach(button => { button.disabled = false; }), {once:true});
document.documentElement.dataset.integrated = 'true';
