(() => {
  const $ = (s) => document.querySelector(s);
  const state = { all: [], filtered: [], markers: new Map(), activeId: null };
  const map = L.map('map', { zoomControl: false, scrollWheelZoom: true }).setView([20.9, 79.1], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const markerIcon = L.divIcon({ className: 'atlas-marker', html: '<span></span>', iconSize: [18,18], iconAnchor: [9,9], popupAnchor: [0,-10] });
  const escape = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const first = (v) => v && String(v).trim() ? String(v).trim() : 'Not recorded';
  function populateFilters() {
    const types = [...new Set(state.all.map(s => s.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const investigators = [...new Set(state.all.map(s => s.investigator).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    types.forEach(v => $('#type-filter').insertAdjacentHTML('beforeend', `<option value="${escape(v)}">${escape(v)}</option>`));
    investigators.forEach(v => $('#investigator-filter').insertAdjacentHTML('beforeend', `<option value="${escape(v)}">${escape(v)}</option>`));
  }
  function searchable(s) { return [s.site,s.type,s.investigator,s.dateYear,s.reference1,s.references2].join(' ').toLowerCase(); }
  function applyFilters() {
    const query = $('#search').value.trim().toLowerCase(), type = $('#type-filter').value, inv = $('#investigator-filter').value, year = $('#year-filter').value.trim().toLowerCase();
    state.filtered = state.all.filter(s => (!query || searchable(s).includes(query)) && (!type || s.type === type) && (!inv || s.investigator === inv) && (!year || String(s.dateYear).toLowerCase().includes(year)));
    render();
  }
  function render() {
    $('#result-count').textContent = `${state.filtered.length.toLocaleString()} of ${state.all.length.toLocaleString()} records visible`;
    $('#visible-count').textContent = state.filtered.length.toLocaleString();
    markerLayer.clearLayers(); state.markers.clear();
    state.filtered.forEach(s => {
      const marker = L.marker([s.latitude,s.longitude], { icon: markerIcon, title: s.site }).bindPopup(`<div class="popup-title">${escape(s.site)}</div><div class="popup-type">${escape(first(s.type))}</div><a class="popup-link" href="#" data-open-site="${s.id}">Open record →</a>`);
      marker.on('popupopen', () => { const link = document.querySelector(`[data-open-site="${s.id}"]`); if(link) link.addEventListener('click', e => { e.preventDefault(); openDialog(s); }); }); marker.addTo(markerLayer); state.markers.set(s.id, marker);
    });
    $('#site-list').innerHTML = state.filtered.length ? state.filtered.map(cardHtml).join('') : '<div class="empty-state"><p>No records match these filters.</p><button class="text-button" type="button" id="empty-clear">Clear filters →</button></div>';
    document.querySelectorAll('[data-site-card]').forEach(card => card.addEventListener('click', () => focusSite(Number(card.dataset.siteCard))));
    $('#empty-clear')?.addEventListener('click', clearFilters);
  }
  function cardHtml(s) { return `<article class="site-card" data-site-card="${s.id}" tabindex="0" role="button" aria-label="Open ${escape(s.site)}"><span class="card-index">${String(s.id).padStart(3,'0')}</span><h3>${escape(s.site)}</h3>${s.type ? `<span class="type">${escape(s.type)}</span>` : ''}<div class="site-meta"><div>Investigator<strong>${escape(first(s.investigator))}</strong></div><div>Date / year<strong>${escape(first(s.dateYear))}</strong></div></div></article>`; }
  function focusSite(id) { const s = state.all.find(x => x.id === id); if (!s) return; state.activeId = id; const marker = state.markers.get(id); if(marker) { map.setView(marker.getLatLng(), Math.max(map.getZoom(), 11), {animate:true}); marker.openPopup(); } openDialog(s); document.querySelectorAll('.site-card').forEach(c => c.classList.toggle('active', Number(c.dataset.siteCard) === id)); }
  function openDialog(s) { $('#dialog-content').innerHTML = `<div class="dialog-eyebrow">Record ${String(s.id).padStart(3,'0')} · coordinate bearing</div><h2 class="dialog-title">${escape(s.site)}</h2><dl class="detail-grid"><div><dt>Type</dt><dd>${escape(first(s.type))}</dd></div><div><dt>Investigator</dt><dd>${escape(first(s.investigator))}</dd></div><div><dt>Date / year</dt><dd>${escape(first(s.dateYear))}</dd></div><div><dt>Latitude</dt><dd>${s.latitude}</dd></div><div><dt>Longitude</dt><dd>${s.longitude}</dd></div><div><dt>Reference 1</dt><dd>${escape(first(s.reference1))}</dd></div><div><dt>References 2</dt><dd>${escape(first(s.references2))}</dd></div></dl>`; const d=$('#site-dialog'); if(!d.open) d.showModal(); }
  function clearFilters() { $('#search').value=''; $('#type-filter').value=''; $('#investigator-filter').value=''; $('#year-filter').value=''; applyFilters(); }
  function fitVisible() { if (!state.filtered.length) return; const bounds = L.latLngBounds(state.filtered.map(s => [s.latitude,s.longitude])); map.fitBounds(bounds.pad(.12), {maxZoom:12}); }
  async function init() { try { const response = await fetch('sites.json'); if(!response.ok) throw new Error('Unable to load sites.json'); state.all = await response.json(); $('#total-sites').textContent = `${state.all.length.toLocaleString()} coordinate records`; populateFilters(); applyFilters(); fitVisible(); } catch (error) { $('#result-count').textContent = 'Unable to load the field register'; $('#site-list').innerHTML = '<div class="empty-state"><p>There was a problem reading sites.json. Check that the atlas is being served over HTTP.</p></div>'; $('#status').classList.add('error'); console.error(error); } }
  $('#search').addEventListener('input', applyFilters); $('#type-filter').addEventListener('change', applyFilters); $('#investigator-filter').addEventListener('change', applyFilters); $('#year-filter').addEventListener('input', applyFilters); $('#clear-filters').addEventListener('click', clearFilters); $('#fit-map').addEventListener('click', fitVisible); $('#reset-view').addEventListener('click', () => { clearFilters(); setTimeout(fitVisible, 0); }); $('#dialog-close').addEventListener('click', () => $('#site-dialog').close()); $('#site-dialog').addEventListener('click', e => { if(e.target === $('#site-dialog')) $('#site-dialog').close(); }); document.addEventListener('keydown', e => { if(e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#search').focus(); } });
  const terrainModal=$('#terrain-modal'); $('.terrain-panel').addEventListener('click', () => terrainModal.hidden=false); $('#terrain-toggle').addEventListener('click', () => terrainModal.hidden=false); $('#terrain-close').addEventListener('click', () => terrainModal.hidden=true); terrainModal.addEventListener('click', e => { if(e.target===terrainModal) terrainModal.hidden=true; });
  init();
})();
