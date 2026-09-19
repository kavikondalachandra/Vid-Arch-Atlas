(() => {
  'use strict';

  const atlas = window.ARCHAEOLOGICAL_ATLAS;
  if (!atlas || !Array.isArray(atlas.sites)) {
    document.body.innerHTML = '<main style="max-width:680px;margin:4rem auto;padding:1.5rem;font-family:system-ui"><h1>Atlas data could not be loaded</h1><p>Ensure <code>data/sites.js</code> is deployed with this page.</p></main>';
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    search: $('#searchInput'),
    type: $('#typeFilter'),
    investigator: $('#investigatorFilter'),
    year: $('#yearFilter'),
    clear: $('#clearFilters'),
    mapViewport: $('#mapViewport'),
    mapStage: $('#mapStage'),
    baseMap: $('#baseMap'),
    markerLayer: $('#markerLayer'),
    tooltip: $('#mapTooltip'),
    zoomIn: $('#zoomIn'),
    zoomOut: $('#zoomOut'),
    focusMap: $('#focusMap'),
    focusMapText: $('#focusMapText'),
    fitResults: $('#fitResults'),
    fitResultsText: $('#fitResultsText'),
    resultCount: $('#resultCount'),
    mapCoverage: $('#mapCoverage'),
    detailsContent: $('#detailsContent'),
    closeDetails: $('#closeDetails'),
    resultsList: $('#resultsList'),
    listSummary: $('#listSummary'),
    showMore: $('#showMoreResults')
  };

  const IMAGE = { width: 2301, height: 1627 };
  // These values calibrate the latitude/longitude ticks printed on the supplied map image.
  const CALIBRATION = {
    longitude: { referencePixel: 266.5, referenceValue: 76, pixelsPerDegree: 357.4 },
    latitude: { referencePixel: 195.5, referenceValue: 22, pixelsPerDegree: 357.3333333333 }
  };
  const MISSING = '__atlas_not_recorded__';
  const MIN_ZOOM = 0.12;
  const MAX_ZOOM = 2.5;
  const LIST_STEP = 48;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  function longitudeAtPixel(pixel) {
    return CALIBRATION.longitude.referenceValue +
      (pixel - CALIBRATION.longitude.referencePixel) / CALIBRATION.longitude.pixelsPerDegree;
  }

  function latitudeAtPixel(pixel) {
    return CALIBRATION.latitude.referenceValue -
      (pixel - CALIBRATION.latitude.referencePixel) / CALIBRATION.latitude.pixelsPerDegree;
  }

  const mapImageBounds = {
    minLongitude: longitudeAtPixel(0),
    maxLongitude: longitudeAtPixel(IMAGE.width),
    minLatitude: latitudeAtPixel(IMAGE.height),
    maxLatitude: latitudeAtPixel(0)
  };

  const suppliedMapFrame = {
    minLongitude: longitudeAtPixel(90),
    maxLongitude: longitudeAtPixel(2193),
    minLatitude: latitudeAtPixel(1543),
    maxLatitude: latitudeAtPixel(100)
  };

  const sites = atlas.sites
    .map((record, index) => ({
      id: Number(record.id) || index + 1,
      sourceRow: record.sourceRow || index + 2,
      site: cleanText(record.site) || `Unnamed site ${index + 1}`,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      type: cleanText(record.type),
      investigator: cleanText(record.investigator),
      dateYear: cleanText(record.dateYear),
      reference1: cleanText(record.reference1),
      reference2: cleanText(record.reference2)
    }))
    .filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude))
    .sort((a, b) => collator.compare(a.site, b.site) || a.id - b.id);

  sites.forEach((record) => {
    record.searchText = [
      record.site,
      record.type,
      record.investigator,
      record.dateYear,
      record.reference1,
      record.reference2
    ].filter(Boolean).join(' ').toLocaleLowerCase();
  });

  const siteById = new Map(sites.map((record) => [record.id, record]));
  const coordinateBounds = getCoordinateBounds(sites);
  const world = {
    minLongitude: Math.min(mapImageBounds.minLongitude, coordinateBounds.minLongitude) - 0.25,
    maxLongitude: Math.max(mapImageBounds.maxLongitude, coordinateBounds.maxLongitude) + 0.25,
    minLatitude: Math.min(mapImageBounds.minLatitude, coordinateBounds.minLatitude) - 0.25,
    maxLatitude: Math.max(mapImageBounds.maxLatitude, coordinateBounds.maxLatitude) + 0.25
  };
  const stageSize = {
    width: (world.maxLongitude - world.minLongitude) * CALIBRATION.longitude.pixelsPerDegree,
    height: (world.maxLatitude - world.minLatitude) * CALIBRATION.latitude.pixelsPerDegree
  };

  const state = {
    filters: { query: '', type: '', investigator: '', year: '' },
    filtered: sites,
    selectedId: null,
    listLimit: LIST_STEP,
    transform: { x: 0, y: 0, scale: 1 },
    drag: null,
    initialised: false,
    lastMarkerScale: null
  };

  const markerNodes = new Map();
  let resizeTimer = null;

  initialise();

  function initialise() {
    setUpMapGeometry();
    populateSelect(elements.type, getDistinctValues('type'), 'Type not recorded');
    populateSelect(elements.investigator, getDistinctValues('investigator'), 'Investigator not recorded');
    createMarkers();
    bindEvents();
    applyFilters({ resetList: true });

    requestAnimationFrame(() => {
      focusSuppliedMap();
      state.initialised = true;
    });
  }

  function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function getCoordinateBounds(records) {
    return records.reduce((bounds, record) => ({
      minLatitude: Math.min(bounds.minLatitude, record.latitude),
      maxLatitude: Math.max(bounds.maxLatitude, record.latitude),
      minLongitude: Math.min(bounds.minLongitude, record.longitude),
      maxLongitude: Math.max(bounds.maxLongitude, record.longitude)
    }), {
      minLatitude: Infinity,
      maxLatitude: -Infinity,
      minLongitude: Infinity,
      maxLongitude: -Infinity
    });
  }

  function project(longitude, latitude) {
    return {
      x: (longitude - world.minLongitude) * CALIBRATION.longitude.pixelsPerDegree,
      y: (world.maxLatitude - latitude) * CALIBRATION.latitude.pixelsPerDegree
    };
  }

  function isInSuppliedMapFrame(record) {
    return record.latitude >= suppliedMapFrame.minLatitude &&
      record.latitude <= suppliedMapFrame.maxLatitude &&
      record.longitude >= suppliedMapFrame.minLongitude &&
      record.longitude <= suppliedMapFrame.maxLongitude;
  }

  function setUpMapGeometry() {
    const imagePosition = project(mapImageBounds.minLongitude, mapImageBounds.maxLatitude);
    elements.mapStage.style.width = `${stageSize.width}px`;
    elements.mapStage.style.height = `${stageSize.height}px`;
    elements.baseMap.style.left = `${imagePosition.x}px`;
    elements.baseMap.style.top = `${imagePosition.y}px`;
    elements.markerLayer.setAttribute('viewBox', `0 0 ${stageSize.width} ${stageSize.height}`);
    elements.markerLayer.setAttribute('width', String(stageSize.width));
    elements.markerLayer.setAttribute('height', String(stageSize.height));
  }

  function getDistinctValues(property) {
    return [...new Set(sites.map((record) => record[property]).filter(Boolean))]
      .sort((a, b) => collator.compare(a, b));
  }

  function populateSelect(select, values, missingLabel) {
    const fragment = document.createDocumentFragment();
    const missing = document.createElement('option');
    missing.value = MISSING;
    missing.textContent = missingLabel;
    fragment.append(missing);

    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      fragment.append(option);
    });
    select.append(fragment);
  }

  function createMarkers() {
    const fragment = document.createDocumentFragment();

    sites.forEach((record) => {
      const point = project(record.longitude, record.latitude);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.classList.add('marker');
      marker.dataset.siteId = String(record.id);
      marker.setAttribute('cx', point.x.toFixed(2));
      marker.setAttribute('cy', point.y.toFixed(2));
      marker.setAttribute('r', '12');
      marker.setAttribute('aria-label', `${record.site}; ${record.type || 'type not recorded'}`);

      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        selectSite(record.id, { bringIntoView: false });
      });
      marker.addEventListener('pointerenter', (event) => showTooltip(event, record));
      marker.addEventListener('pointermove', (event) => positionTooltip(event));
      marker.addEventListener('pointerleave', hideTooltip);

      markerNodes.set(record.id, marker);
      fragment.append(marker);
    });

    elements.markerLayer.append(fragment);
  }

  function bindEvents() {
    elements.search.addEventListener('input', () => {
      state.filters.query = elements.search.value.trim().toLocaleLowerCase();
      applyFilters({ resetList: true });
    });
    elements.type.addEventListener('change', () => {
      state.filters.type = elements.type.value;
      applyFilters({ resetList: true });
    });
    elements.investigator.addEventListener('change', () => {
      state.filters.investigator = elements.investigator.value;
      applyFilters({ resetList: true });
    });
    elements.year.addEventListener('input', () => {
      state.filters.year = elements.year.value.trim().toLocaleLowerCase();
      applyFilters({ resetList: true });
    });
    elements.clear.addEventListener('click', clearFilters);
    elements.showMore.addEventListener('click', () => {
      state.listLimit += LIST_STEP;
      renderResults();
    });
    elements.closeDetails.addEventListener('click', clearSelection);

    elements.zoomIn.addEventListener('click', () => zoomAtViewportCenter(1.35));
    elements.zoomOut.addEventListener('click', () => zoomAtViewportCenter(1 / 1.35));
    elements.focusMap.addEventListener('click', focusSuppliedMap);
    elements.focusMapText.addEventListener('click', focusSuppliedMap);
    elements.fitResults.addEventListener('click', () => fitSites(state.filtered));
    elements.fitResultsText.addEventListener('click', () => fitSites(state.filtered));

    elements.mapViewport.addEventListener('wheel', handleWheel, { passive: false });
    elements.mapViewport.addEventListener('pointerdown', startDrag);
    elements.mapViewport.addEventListener('pointermove', moveDrag);
    elements.mapViewport.addEventListener('pointerup', endDrag);
    elements.mapViewport.addEventListener('pointercancel', endDrag);
    elements.mapViewport.addEventListener('keydown', handleMapKeydown);

    const observer = new ResizeObserver(() => {
      if (!state.initialised) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => focusSuppliedMap(), 120);
    });
    observer.observe(elements.mapViewport);
  }

  function clearFilters() {
    elements.search.value = '';
    elements.type.value = '';
    elements.investigator.value = '';
    elements.year.value = '';
    state.filters = { query: '', type: '', investigator: '', year: '' };
    applyFilters({ resetList: true });
  }

  function recordMatches(record) {
    const { query, type, investigator, year } = state.filters;
    if (query && !record.searchText.includes(query)) return false;
    if (!matchesValue(record.type, type)) return false;
    if (!matchesValue(record.investigator, investigator)) return false;
    if (year && !(record.dateYear || '').toLocaleLowerCase().includes(year)) return false;
    return true;
  }

  function matchesValue(value, filterValue) {
    if (!filterValue) return true;
    if (filterValue === MISSING) return !value;
    return value === filterValue;
  }

  function applyFilters({ resetList = false } = {}) {
    state.filtered = sites.filter(recordMatches);
    if (resetList) state.listLimit = LIST_STEP;

    if (state.selectedId && !state.filtered.some((record) => record.id === state.selectedId)) {
      state.selectedId = null;
      renderDetails();
    }

    updateMarkerVisibility();
    renderCounts();
    renderResults();
  }

  function updateMarkerVisibility() {
    const matchingIds = new Set(state.filtered.map((record) => record.id));
    markerNodes.forEach((marker, id) => {
      marker.classList.toggle('is-hidden', !matchingIds.has(id));
      marker.classList.toggle('is-selected', id === state.selectedId);
    });
  }

  function renderCounts() {
    const matching = state.filtered.length;
    const insideFrame = state.filtered.filter(isInSuppliedMapFrame).length;
    const outsideFrame = matching - insideFrame;
    elements.resultCount.textContent = `${formatNumber(matching)} of ${formatNumber(sites.length)} sites`;

    if (outsideFrame) {
      elements.mapCoverage.textContent = `${formatNumber(insideFrame)} matching ${plural(insideFrame, 'site')} fall within the printed Vidarbha map frame; ${formatNumber(outsideFrame)} ${plural(outsideFrame, 'record')} ${outsideFrame === 1 ? 'is' : 'are'} beyond it. Use “Fit results” to view every coordinate.`;
    } else {
      elements.mapCoverage.textContent = `All ${formatNumber(matching)} matching ${plural(matching, 'site')} fall within the printed Vidarbha map frame.`;
    }
  }

  function renderResults() {
    const records = state.filtered;
    const visibleRecords = records.slice(0, state.listLimit);
    elements.resultsList.replaceChildren();

    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'no-results';
      empty.textContent = 'No site records match the current filters.';
      elements.resultsList.append(empty);
      elements.listSummary.textContent = 'No matches';
      elements.showMore.hidden = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleRecords.forEach((record) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'result-item';
      button.classList.toggle('is-selected', record.id === state.selectedId);
      button.setAttribute('aria-label', `View details for ${record.site}`);
      button.addEventListener('click', () => selectSite(record.id, { bringIntoView: true }));

      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = record.site;
      const type = document.createElement('span');
      type.className = 'result-meta';
      type.textContent = record.type || 'Type not recorded';
      const submeta = document.createElement('span');
      submeta.className = 'result-submeta';
      submeta.textContent = [record.investigator || 'Investigator not recorded', record.dateYear || 'Date/year not recorded'].join(' · ');

      button.append(name, type, submeta);
      fragment.append(button);
    });
    elements.resultsList.append(fragment);

    elements.listSummary.textContent = records.length > visibleRecords.length
      ? `Showing ${formatNumber(visibleRecords.length)} of ${formatNumber(records.length)} sites`
      : `${formatNumber(records.length)} ${plural(records.length, 'site')}`;
    elements.showMore.hidden = visibleRecords.length >= records.length;
    elements.showMore.textContent = `Show ${Math.min(LIST_STEP, records.length - visibleRecords.length)} more ${plural(Math.min(LIST_STEP, records.length - visibleRecords.length), 'site')}`;
  }

  function selectSite(id, { bringIntoView = true } = {}) {
    const record = siteById.get(id);
    if (!record) return;

    state.selectedId = id;
    updateMarkerVisibility();
    renderDetails();
    renderResults();

    if (bringIntoView) ensureSiteVisible(record);
  }

  function clearSelection() {
    if (!state.selectedId) return;
    state.selectedId = null;
    updateMarkerVisibility();
    renderDetails();
    renderResults();
  }

  function renderDetails() {
    const record = state.selectedId ? siteById.get(state.selectedId) : null;
    elements.closeDetails.disabled = !record;
    elements.detailsContent.replaceChildren();

    if (!record) {
      const empty = document.createElement('div');
      empty.className = 'empty-details';
      const pin = document.createElement('div');
      pin.className = 'empty-pin';
      pin.setAttribute('aria-hidden', 'true');
      const message = document.createElement('p');
      message.textContent = 'Select a marker or a record below to view its location, type, investigator, date/year, and references.';
      empty.append(pin, message);
      elements.detailsContent.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    const heading = document.createElement('h3');
    heading.className = 'detail-site-name';
    heading.textContent = record.site;

    const coordinateRow = document.createElement('div');
    coordinateRow.className = 'detail-coordinates';
    const coordinateText = document.createElement('span');
    coordinateText.textContent = `${record.latitude.toFixed(6)}° N · ${record.longitude.toFixed(6)}° E`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyCoordinates(record, copy));
    coordinateRow.append(coordinateText, copy);

    const detailGrid = document.createElement('div');
    detailGrid.className = 'detail-grid';
    detailGrid.append(
      detailItem('Type', record.type || 'Not recorded'),
      detailItem('Investigator', record.investigator || 'Not recorded'),
      detailItem('Date / year', record.dateYear || 'Not recorded')
    );

    fragment.append(heading, coordinateRow, detailGrid);
    fragment.append(referenceBlock('Reference 1', record.reference1));
    fragment.append(referenceBlock('Reference 2', record.reference2));
    elements.detailsContent.append(fragment);
  }

  function detailItem(label, value) {
    const item = document.createElement('div');
    item.className = 'detail-item';
    const itemLabel = document.createElement('span');
    itemLabel.className = 'detail-label';
    itemLabel.textContent = label;
    const itemValue = document.createElement('span');
    itemValue.className = 'detail-value';
    itemValue.textContent = value;
    item.append(itemLabel, itemValue);
    return item;
  }

  function referenceBlock(title, reference) {
    const block = document.createElement('section');
    block.className = 'reference-block';
    if (!reference) block.classList.add('is-empty');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const text = document.createElement('p');
    text.textContent = reference || 'Not recorded';
    block.append(heading, text);
    return block;
  }

  async function copyCoordinates(record, button) {
    const value = `${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const helper = document.createElement('textarea');
        helper.value = value;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.append(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      button.textContent = 'Copied';
      window.setTimeout(() => { button.textContent = 'Copy'; }, 1250);
    } catch {
      button.textContent = 'Select text';
      window.setTimeout(() => { button.textContent = 'Copy'; }, 1400);
    }
  }

  function showTooltip(event, record) {
    elements.tooltip.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = record.site;
    const metadata = document.createElement('span');
    metadata.textContent = record.type || 'Type not recorded';
    elements.tooltip.append(title, metadata);
    elements.tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    if (elements.tooltip.hidden) return;
    const bounds = elements.mapViewport.getBoundingClientRect();
    const tipBounds = elements.tooltip.getBoundingClientRect();
    let x = event.clientX - bounds.left + 13;
    let y = event.clientY - bounds.top + 13;
    if (x + tipBounds.width > bounds.width - 8) x -= tipBounds.width + 26;
    if (y + tipBounds.height > bounds.height - 8) y = bounds.height - tipBounds.height - 8;
    elements.tooltip.style.left = `${Math.max(8, x)}px`;
    elements.tooltip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTooltip() {
    elements.tooltip.hidden = true;
  }

  function startDrag(event) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    if (event.target.closest('.marker, .map-controls')) return;

    state.drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: state.transform.x,
      startY: state.transform.y,
      moved: false
    };
    hideTooltip();
    elements.mapViewport.classList.add('is-dragging');
    elements.mapViewport.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const dx = event.clientX - state.drag.startClientX;
    const dy = event.clientY - state.drag.startClientY;
    state.drag.moved = state.drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
    setTransform({ x: state.drag.startX + dx, y: state.drag.startY + dy });
  }

  function endDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    if (elements.mapViewport.hasPointerCapture(event.pointerId)) {
      elements.mapViewport.releasePointerCapture(event.pointerId);
    }
    state.drag = null;
    elements.mapViewport.classList.remove('is-dragging');
  }

  function handleWheel(event) {
    event.preventDefault();
    const viewportBounds = elements.mapViewport.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(event.clientX - viewportBounds.left, event.clientY - viewportBounds.top, factor);
  }

  function handleMapKeydown(event) {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAtViewportCenter(1.35);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomAtViewportCenter(1 / 1.35);
    } else if (event.key === '0') {
      event.preventDefault();
      focusSuppliedMap();
    } else if (event.key.toLocaleLowerCase() === 'f') {
      event.preventDefault();
      fitSites(state.filtered);
    }
  }

  function zoomAtViewportCenter(factor) {
    const bounds = elements.mapViewport.getBoundingClientRect();
    zoomAt(bounds.width / 2, bounds.height / 2, factor);
  }

  function zoomAt(viewportX, viewportY, factor) {
    const previous = state.transform;
    const nextScale = clamp(previous.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const stageX = (viewportX - previous.x) / previous.scale;
    const stageY = (viewportY - previous.y) / previous.scale;
    setTransform({
      x: viewportX - stageX * nextScale,
      y: viewportY - stageY * nextScale,
      scale: nextScale
    });
  }

  function focusSuppliedMap() {
    const imagePosition = project(mapImageBounds.minLongitude, mapImageBounds.maxLatitude);
    const bounds = elements.mapViewport.getBoundingClientRect();
    const padding = Math.min(36, Math.max(18, bounds.width * 0.045));
    const scale = clamp(Math.min(
      (bounds.width - padding * 2) / IMAGE.width,
      (bounds.height - padding * 2) / IMAGE.height
    ), MIN_ZOOM, MAX_ZOOM);

    setTransform({
      x: (bounds.width - IMAGE.width * scale) / 2 - imagePosition.x * scale,
      y: (bounds.height - IMAGE.height * scale) / 2 - imagePosition.y * scale,
      scale
    });
  }

  function fitSites(records) {
    if (!records.length) {
      focusSuppliedMap();
      return;
    }

    const projected = records.map((record) => project(record.longitude, record.latitude));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));
    const bounds = elements.mapViewport.getBoundingClientRect();
    const width = Math.max(300, maxX - minX);
    const height = Math.max(300, maxY - minY);
    const padding = 56;
    const scale = clamp(Math.min(
      (bounds.width - padding * 2) / width,
      (bounds.height - padding * 2) / height
    ), MIN_ZOOM, MAX_ZOOM);

    setTransform({
      x: bounds.width / 2 - ((minX + maxX) / 2) * scale,
      y: bounds.height / 2 - ((minY + maxY) / 2) * scale,
      scale
    });
  }

  function ensureSiteVisible(record) {
    const point = project(record.longitude, record.latitude);
    const bounds = elements.mapViewport.getBoundingClientRect();
    const screenX = state.transform.x + point.x * state.transform.scale;
    const screenY = state.transform.y + point.y * state.transform.scale;
    const needsCentering = screenX < 68 || screenX > bounds.width - 68 || screenY < 68 || screenY > bounds.height - 68;
    if (!needsCentering) return;

    const scale = Math.max(state.transform.scale, 0.48);
    setTransform({
      x: bounds.width / 2 - point.x * scale,
      y: bounds.height / 2 - point.y * scale,
      scale
    });
  }

  function setTransform(next) {
    const oldScale = state.transform.scale;
    state.transform = {
      x: Number.isFinite(next.x) ? next.x : state.transform.x,
      y: Number.isFinite(next.y) ? next.y : state.transform.y,
      scale: clamp(Number.isFinite(next.scale) ? next.scale : state.transform.scale, MIN_ZOOM, MAX_ZOOM)
    };
    elements.mapStage.style.transform = `translate3d(${state.transform.x}px, ${state.transform.y}px, 0) scale(${state.transform.scale})`;

    if (Math.abs(oldScale - state.transform.scale) > 0.003 || state.lastMarkerScale === null) {
      resizeMarkers();
      state.lastMarkerScale = state.transform.scale;
    }
  }

  function resizeMarkers() {
    const radius = clamp(4.7 / state.transform.scale, 5.8, 17);
    markerNodes.forEach((marker) => marker.setAttribute('r', radius.toFixed(2)));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function plural(value, noun) {
    return `${noun}${value === 1 ? '' : 's'}`;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }
})();
