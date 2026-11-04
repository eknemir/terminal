// Studio panel (right column): switches between the video preview and presets tabs.
(() => {
  const panel = document.getElementById('p-studio');
  if (!panel) return;
  const tabs = panel.querySelectorAll('.st-tab');
  const panes = { video: document.getElementById('video-mount'), presets: document.getElementById('presets-mount'), skills: document.getElementById('skills-mount') };
  function show(tab) {
    if (!panes[tab]) return;
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    Object.keys(panes).forEach((k) => panes[k] && panes[k].classList.toggle('on', k === tab));
    window.dispatchEvent(new CustomEvent('studio-tab', { detail: tab }));
  }
  tabs.forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('on')) show(b.dataset.tab); }));
  window.studioShowTab = show;
})();