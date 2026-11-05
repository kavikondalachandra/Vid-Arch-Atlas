(() => {
  'use strict';

  const atlas = window.ARCHAEOLOGICAL_ATLAS;
  const vidarbhaDistrictsData = window.VIDARBHA_DISTRICTS;
  const vidarbhaTopoData = window.VIDARBHA_TOPO;

  if (!atlas || !Array.isArray(atlas.sites)) {
    console.error('Atlas data could not be loaded. Ensure data/sites.js is loaded.');
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  let elements = {};

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const MISSING = '__atlas_not_recorded__';
  const LIST_STEP = 48;

  // Vidarbha general bounding box: [minLat, minLng], [maxLat, maxLng]
  const VIDARBHA_BOUNDS = [
    [18.60, 75.80],
    [21.80, 81.10]
  ];

  // Normalise site records
  const sites = atlas.sites
    .map((record, index) => ({
      id: Number(record.id) || index + 1,
      sourceRow: record.sourceRow || index + 2,
      site: cleanText(record.site) || `Unnamed site ${index + 1}`,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      district: cleanText(record.district) || 'Vidarbha',
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
      record.district,
      record.type,
      record.investigator,
      record.dateYear,
      record.reference1,
      record.reference2
    ].filter(Boolean).join(' ').toLocaleLowerCase();
  });

  const siteById = new Map(sites.map((record) => [record.id, record]));

  // App State
  const state = {
    filters: { query: '', district: '', type: '', investigator: '', year: '' },
    filtered: sites,
    selectedId: null,
    selectedFeature: null,
    listLimit: LIST_STEP,
    activeBasemap: 'topo'
  };

  // Leaflet map & layer groups
  let map = null;
  let baseLayers = {};
  let districtsLayer = null;
  let riversLayer = null;
  let topoRangesLayer = null;
  let landmarksLayer = null;
  let sitesLayerGroup = null;
  const siteMarkerMap = new Map();

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }

  function initialise() {
    elements = {
      search: $('#searchInput'),
      district: $('#districtFilter'),
      type: $('#typeFilter'),
      investigator: $('#investigatorFilter'),
      year: $('#yearFilter'),
      clear: $('#clearFilters'),

      toggleDistricts: $('#toggleDistricts'),
      toggleRivers: $('#toggleRivers'),
      toggleTopo: $('#toggleTopo'),
      toggleLandmarks: $('#toggleLandmarks'),
      toggleSites: $('#toggleSites'),

      mapViewport: $('#mapViewport'),
      zoomIn: $('#zoomIn'),
      zoomOut: $('#zoomOut'),
      focusVidarbha: $('#focusVidarbha'),
      focusVidarbhaText: $('#focusVidarbhaText'),
      fitResults: $('#fitResults'),
      fitResultsText: $('#fitResultsText'),
      resultCount: $('#resultCount'),
      mapCoverage: $('#mapCoverage'),
      mapCoordinates: $('#mapCoordinates'),

      detailsEyebrow: $('#detailsEyebrow'),
      detailsHeading: $('#detailsHeading'),
      detailsContent: $('#detailsContent'),
      closeDetails: $('#closeDetails'),

      resultsList: $('#resultsList'),
      listSummary: $('#listSummary'),
      showMore: $('#showMoreResults')
    };

    initLeafletMap();
    populateDistrictFilter();
    populateSelect(elements.type, getDistinctValues('type'), 'Type not recorded');
    populateSelect(elements.investigator, getDistinctValues('investigator'), 'Investigator not recorded');
    createSitesMarkers();
    bindEvents();
    applyFilters({ resetList: true });

    // Focus on Vidarbha bounds initially
    setTimeout(() => {
      if (map) {
        map.fitBounds(VIDARBHA_BOUNDS, { padding: [24, 24] });
        map.invalidateSize();
      }
    }, 250);
  }

  function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  /* ==========================================================================
     LEAFLET MAP INITIALIZATION
     ========================================================================== */
  function initLeafletMap() {
    if (!elements.mapViewport) return;

    map = L.map(elements.mapViewport, {
      center: [20.70, 78.80],
      zoom: 7,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true
    });

    // Basemaps definition
    baseLayers = {
      topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: '&copy; Esri, USGS, FAO, NPS'
      }),
      relief: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 13,
        attribution: '&copy; Esri Shaded Relief'
      }),
      streets: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri, USGS, DeLorme'
      }),
      osm: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri, USGS, DeLorme'
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
      })
    };

    // Add default basemap
    baseLayers.topo.addTo(map);

    // Initialize layers
    initDistrictsLayer();
    initTopographyLayers();
    sitesLayerGroup = L.layerGroup().addTo(map);

    // Basemap switch buttons
    document.querySelectorAll('.base-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.basemap;
        if (target && baseLayers[target] && target !== state.activeBasemap) {
          map.removeLayer(baseLayers[state.activeBasemap]);
          baseLayers[target].addTo(map);
          state.activeBasemap = target;
          document.querySelectorAll('.base-btn').forEach((b) => b.classList.remove('is-active'));
          e.currentTarget.classList.add('is-active');
        }
      });
    });

    // Cursor coordinates readout
    map.on('mousemove', (e) => {
      if (elements.mapCoordinates) {
        elements.mapCoordinates.textContent = `Lat: ${e.latlng.lat.toFixed(3)}° N · Lng: ${e.latlng.lng.toFixed(3)}° E · Zoom: ${map.getZoom()}`;
      }
    });

    // Map click clears selection
    map.on('click', (e) => {
      if (!e.originalEvent._markerClicked) {
        clearSelection();
      }
    });

    // Resize map whenever window size changes
    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });
  }

  /* ==========================================================================
     DISTRICTS LAYER (11 VIDARBHA DISTRICTS)
     ========================================================================== */
  function initDistrictsLayer() {
    if (!vidarbhaDistrictsData) return;

    districtsLayer = L.geoJSON(vidarbhaDistrictsData, {
      style: (feature) => {
        const color = feature.properties.color || '#2a9d8f';
        return {
          fillColor: color,
          fillOpacity: 0.13,
          color: color,
          weight: 2.2,
          opacity: 0.85,
          dashArray: '3, 3'
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const dName = props.district;
        const siteCount = props.siteCount || 0;

        // Tooltip
        layer.bindTooltip(`<strong>${dName} District</strong><br><span style="font-size:0.7rem;color:#d6e4d8;">${props.division || 'Vidarbha'} &middot; ${siteCount} sites</span>`, {
          className: 'site-tooltip',
          sticky: true
        });

        // Hover effect
        layer.on('mouseover', () => {
          layer.setStyle({
            fillOpacity: 0.28,
            weight: 3.5,
            opacity: 1
          });
        });
        layer.on('mouseout', () => {
          if (districtsLayer) districtsLayer.resetStyle(layer);
        });

        // Click on district polygon
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          // Set district filter
          if (elements.district) {
            elements.district.value = dName;
            state.filters.district = dName;
            applyFilters({ resetList: true });
          }
          // Zoom to district bounds
          map.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 10 });

          // Show district details
          showDistrictDetails(props);
        });
      }
    }).addTo(map);

    // Add district center labels safely AFTER districtsLayer is created
    if (vidarbhaDistrictsData.features) {
      vidarbhaDistrictsData.features.forEach((feat) => {
        const props = feat.properties;
        if (props && props.centroid) {
          const labelIcon = L.divIcon({
            className: 'district-label',
            html: `<span>${props.district}</span>`,
            iconSize: [80, 20],
            iconAnchor: [40, 10]
          });
          L.marker([props.centroid[1], props.centroid[0]], { icon: labelIcon, interactive: false }).addTo(districtsLayer);
        }
      });
    }
  }

  /* ==========================================================================
     TOPOGRAPHY LAYERS (RIVERS, RANGES, LANDMARKS, RESERVOIRS)
     ========================================================================== */
  function initTopographyLayers() {
    if (!vidarbhaTopoData || !Array.isArray(vidarbhaTopoData.features)) return;

    const riverFeatures = vidarbhaTopoData.features.filter((f) => f.properties.category === 'river');
    const topoFeatures = vidarbhaTopoData.features.filter((f) => f.properties.category === 'topography' || f.properties.category === 'reservoir');
    const landmarkFeatures = vidarbhaTopoData.features.filter((f) => f.properties.category === 'landmark');

    // 1. Rivers
    riversLayer = L.geoJSON(riverFeatures, {
      style: (feature) => feature.properties.style || { color: '#1d70a2', weight: 3 },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindTooltip(`<strong>🌊 ${props.name}</strong><br><span style="font-size:0.7rem;color:#bfe0fa">${props.marathi || ''} &middot; Length: ${props.length_km} km</span>`, {
          className: 'river-tooltip',
          sticky: true
        });
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showTopographicDetails(props);
        });
      }
    }).addTo(map);

    // 2. Mountain Ranges & Reservoirs
    topoRangesLayer = L.geoJSON(topoFeatures, {
      style: (feature) => feature.properties.style || { color: '#8b5a2b', weight: 2 },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindTooltip(`<strong>⛰️ ${props.name}</strong><br><span style="font-size:0.7rem;color:#fef08a">${props.elevation ? 'Elev: ' + props.elevation : 'Water Reservoir'}</span>`, {
          className: 'topo-tooltip',
          sticky: true
        });
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showTopographicDetails(props);
        });
      }
    }).addTo(map);

    // 3. Landmarks & Peaks
    landmarksLayer = L.geoJSON(landmarkFeatures, {
      pointToLayer: (feature, latlng) => {
        const props = feature.properties;
        const iconSvg = getLandmarkSvg(props.icon);
        const icon = L.divIcon({
          className: 'landmark-marker-wrapper',
          html: `<div class="landmark-pin" title="${props.name} (${props.elevation || ''})">${iconSvg}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        return L.marker(latlng, { icon: icon });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindTooltip(`<strong>${props.name}</strong><br><span style="font-size:0.7rem;color:#fef08a">${props.type} &middot; ${props.elevation || ''}</span>`, {
          className: 'topo-tooltip',
          offset: [0, -10]
        });
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showTopographicDetails(props);
        });
      }
    }).addTo(map);
  }

  function getLandmarkSvg(iconType) {
    if (iconType === 'mountain') {
      return '<svg viewBox="0 0 24 24"><path d="m14 6 5.5 11h-15L9 8.5l2.5 3.5L14 6z"/></svg>';
    } else if (iconType === 'crater') {
      return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="3"/></svg>';
    } else if (iconType === 'fort') {
      return '<svg viewBox="0 0 24 24"><path d="M4 21V9l3-4 3 4v12M14 21V9l3-4 3 4v12M9 14h6M9 18h6"/></svg>';
    } else if (iconType === 'archaeology' || iconType === 'temple') {
      return '<svg viewBox="0 0 24 24"><path d="M12 2 3 9v2h18V9L12 2zm-7 9v8h2v-8H5zm5 0v8h2v-8h-2zm5 0v8h2v-8h-2zm-9 9h16v2H2v-2h2z"/></svg>';
    } else if (iconType === 'waterfall' || iconType === 'confluence') {
      return '<svg viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>';
  }

  /* ==========================================================================
     ARCHAEOLOGICAL SITES MARKERS
     ========================================================================== */
  function createSitesMarkers() {
    sites.forEach((record) => {
      const marker = L.circleMarker([record.latitude, record.longitude], {
        radius: 5.5,
        fillColor: '#176d5b',
        color: '#ffffff',
        weight: 1.6,
        opacity: 0.95,
        fillOpacity: 0.90
      });

      marker.bindTooltip(`<strong>${record.site}</strong><span>${record.district} &middot; ${record.type || 'Type not recorded'}</span>`, {
        className: 'site-tooltip',
        offset: [0, -6]
      });

      marker.on('click', (e) => {
        e.originalEvent._markerClicked = true;
        L.DomEvent.stopPropagation(e);
        selectSite(record.id, { bringIntoView: false });
      });

      siteMarkerMap.set(record.id, marker);
      sitesLayerGroup.addLayer(marker);
    });
  }

  /* ==========================================================================
     FILTER POPULATION & LOGIC
     ========================================================================== */
  function populateDistrictFilter() {
    if (!elements.district) return;
    const vidarbhaDistricts = [
      'Nagpur', 'Amravati', 'Chandrapur', 'Wardha', 'Bhandara',
      'Yavatmal', 'Gadchiroli', 'Buldhana', 'Akola', 'Washim', 'Gondia'
    ];

    const counts = {};
    sites.forEach((s) => {
      const d = s.district || 'Adjacent / Regional';
      counts[d] = (counts[d] || 0) + 1;
    });

    const fragment = document.createDocumentFragment();

    // Group 1: Vidarbha Districts
    const groupV = document.createElement('optgroup');
    groupV.label = 'Vidarbha Districts (11)';
    vidarbhaDistricts.sort().forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `${d} (${counts[d] || 0} sites)`;
      groupV.append(opt);
    });
    fragment.append(groupV);

    // Group 2: Surrounding / Peripheral Sites
    const otherDistricts = [...new Set(sites.map((s) => s.district).filter((d) => d && !vidarbhaDistricts.includes(d)))];
    if (otherDistricts.length) {
      const groupO = document.createElement('optgroup');
      groupO.label = 'Surrounding / Regional Sites';
      otherDistricts.sort().forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} (${counts[d] || 0} sites)`;
        groupO.append(opt);
      });
      fragment.append(groupO);
    }

    elements.district.append(fragment);
  }

  function getDistinctValues(property) {
    return [...new Set(sites.map((record) => record[property]).filter(Boolean))]
      .sort((a, b) => collator.compare(a, b));
  }

  function populateSelect(select, values, missingLabel) {
    if (!select) return;
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

  function bindEvents() {
    elements.search.addEventListener('input', () => {
      state.filters.query = elements.search.value.trim().toLocaleLowerCase();
      applyFilters({ resetList: true });
    });

    if (elements.district) {
      elements.district.addEventListener('change', () => {
        state.filters.district = elements.district.value;
        applyFilters({ resetList: true });
        zoomToDistrict(state.filters.district);
      });
    }

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

    // Zoom controls
    elements.zoomIn.addEventListener('click', () => map.zoomIn());
    elements.zoomOut.addEventListener('click', () => map.zoomOut());
    elements.focusVidarbha.addEventListener('click', () => map.fitBounds(VIDARBHA_BOUNDS, { padding: [24, 24] }));
    elements.focusVidarbhaText.addEventListener('click', () => map.fitBounds(VIDARBHA_BOUNDS, { padding: [24, 24] }));
    elements.fitResults.addEventListener('click', () => fitFilteredSites());
    elements.fitResultsText.addEventListener('click', () => fitFilteredSites());

    // Layer checkboxes
    elements.toggleDistricts.addEventListener('change', (e) => {
      if (districtsLayer) {
        if (e.target.checked) map.addLayer(districtsLayer);
        else map.removeLayer(districtsLayer);
      }
    });

    elements.toggleRivers.addEventListener('change', (e) => {
      if (riversLayer) {
        if (e.target.checked) map.addLayer(riversLayer);
        else map.removeLayer(riversLayer);
      }
    });

    elements.toggleTopo.addEventListener('change', (e) => {
      if (topoRangesLayer) {
        if (e.target.checked) map.addLayer(topoRangesLayer);
        else map.removeLayer(topoRangesLayer);
      }
    });

    elements.toggleLandmarks.addEventListener('change', (e) => {
      if (landmarksLayer) {
        if (e.target.checked) map.addLayer(landmarksLayer);
        else map.removeLayer(landmarksLayer);
      }
    });

    elements.toggleSites.addEventListener('change', (e) => {
      if (sitesLayerGroup) {
        if (e.target.checked) map.addLayer(sitesLayerGroup);
        else map.removeLayer(sitesLayerGroup);
      }
    });
  }

  function clearFilters() {
    elements.search.value = '';
    if (elements.district) elements.district.value = '';
    elements.type.value = '';
    elements.investigator.value = '';
    elements.year.value = '';
    state.filters = { query: '', district: '', type: '', investigator: '', year: '' };
    applyFilters({ resetList: true });
    map.fitBounds(VIDARBHA_BOUNDS, { padding: [24, 24] });
  }

  function recordMatches(record) {
    const { query, district, type, investigator, year } = state.filters;
    if (query && !record.searchText.includes(query)) return false;
    if (district && record.district !== district) return false;
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
    siteMarkerMap.forEach((marker, id) => {
      if (matchingIds.has(id)) {
        if (!sitesLayerGroup.hasLayer(marker)) {
          sitesLayerGroup.addLayer(marker);
        }
        if (id === state.selectedId) {
          marker.setStyle({
            radius: 8.5,
            fillColor: '#d89f34',
            color: '#fff5dc',
            weight: 3.5,
            fillOpacity: 1
          });
          marker.bringToFront();
        } else {
          marker.setStyle({
            radius: 5.5,
            fillColor: '#176d5b',
            color: '#ffffff',
            weight: 1.6,
            fillOpacity: 0.90
          });
        }
      } else {
        if (sitesLayerGroup.hasLayer(marker)) {
          sitesLayerGroup.removeLayer(marker);
        }
      }
    });
  }

  function renderCounts() {
    const matching = state.filtered.length;
    elements.resultCount.textContent = `${formatNumber(matching)} of ${formatNumber(sites.length)} sites`;

    const distinctDistricts = new Set(state.filtered.map((s) => s.district).filter(Boolean));
    if (state.filters.district) {
      elements.mapCoverage.textContent = `Showing ${formatNumber(matching)} matching ${plural(matching, 'site')} in ${state.filters.district} District.`;
    } else {
      elements.mapCoverage.textContent = `Displaying ${formatNumber(matching)} ${plural(matching, 'site')} across ${distinctDistricts.size} districts of Vidarbha and surrounding regions.`;
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

      const districtTag = document.createElement('span');
      districtTag.className = 'result-district-tag';
      districtTag.textContent = record.district;

      const type = document.createElement('span');
      type.className = 'result-meta';
      type.textContent = record.type || 'Type not recorded';

      const submeta = document.createElement('span');
      submeta.className = 'result-submeta';
      submeta.textContent = [record.investigator || 'Investigator not recorded', record.dateYear || 'Date/year not recorded'].join(' · ');

      button.append(name, districtTag, type, submeta);
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
    state.selectedFeature = null;

    updateMarkerVisibility();
    renderDetails();
    renderResults();

    if (bringIntoView && map) {
      map.setView([record.latitude, record.longitude], Math.max(map.getZoom(), 11), {
        animate: true,
        duration: 0.8
      });
      const marker = siteMarkerMap.get(id);
      if (marker) marker.openTooltip();
    }
  }

  function clearSelection() {
    state.selectedId = null;
    state.selectedFeature = null;
    updateMarkerVisibility();
    renderDetails();
    renderResults();
  }

  function zoomToDistrict(districtName) {
    if (!districtName || !vidarbhaDistrictsData) return;
    const feat = vidarbhaDistrictsData.features.find((f) => f.properties.district === districtName);
    if (feat && feat.properties.bbox) {
      const b = feat.properties.bbox; // [minLng, minLat, maxLng, maxLat]
      map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [35, 35] });
    }
  }

  function fitFilteredSites() {
    if (!state.filtered.length) {
      map.fitBounds(VIDARBHA_BOUNDS, { padding: [24, 24] });
      return;
    }
    const lats = state.filtered.map((s) => s.latitude);
    const lngs = state.filtered.map((s) => s.longitude);
    const bounds = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ];
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14 });
  }

  /* ==========================================================================
     DETAILS PANEL RENDERING
     ========================================================================== */
  function renderDetails() {
    const record = state.selectedId ? siteById.get(state.selectedId) : null;
    elements.closeDetails.disabled = !record && !state.selectedFeature;
    elements.detailsContent.replaceChildren();

    if (elements.detailsEyebrow) elements.detailsEyebrow.textContent = 'Selected record';
    if (elements.detailsHeading) elements.detailsHeading.textContent = 'Site details';

    if (!record) {
      const empty = document.createElement('div');
      empty.className = 'empty-details';
      const pin = document.createElement('div');
      pin.className = 'empty-pin';
      pin.setAttribute('aria-hidden', 'true');
      const message = document.createElement('p');
      message.textContent = 'Select an archaeological marker, district, river, or topographic feature on the map to view complete historical and geographical details.';
      empty.append(pin, message);
      elements.detailsContent.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    const heading = document.createElement('h3');
    heading.className = 'detail-site-name';
    heading.textContent = record.site;

    const districtBadge = document.createElement('span');
    districtBadge.className = 'detail-district-badge';
    districtBadge.textContent = `${record.district} District`;

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
      detailItem('District', record.district),
      detailItem('Archaeological Type', record.type || 'Not recorded'),
      detailItem('Investigator', record.investigator || 'Not recorded'),
      detailItem('Date / year', record.dateYear || 'Not recorded')
    );

    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'zoom-to-site-btn';
    zoomBtn.textContent = '🔍 Zoom to site on topographic map';
    zoomBtn.addEventListener('click', () => {
      map.setView([record.latitude, record.longitude], 13, { animate: true });
    });

    fragment.append(heading, districtBadge, coordinateRow, detailGrid, zoomBtn);
    fragment.append(referenceBlock('Reference 1', record.reference1));
    fragment.append(referenceBlock('Reference 2', record.reference2));
    elements.detailsContent.append(fragment);
  }

  function showDistrictDetails(props) {
    state.selectedId = null;
    state.selectedFeature = props;
    updateMarkerVisibility();
    elements.closeDetails.disabled = false;
    elements.detailsContent.replaceChildren();

    if (elements.detailsEyebrow) elements.detailsEyebrow.textContent = 'Administrative division';
    if (elements.detailsHeading) elements.detailsHeading.textContent = `${props.district} District`;

    const fragment = document.createDocumentFragment();

    const heading = document.createElement('h3');
    heading.className = 'detail-site-name';
    heading.textContent = `${props.district} District`;

    const badge = document.createElement('span');
    badge.className = 'detail-district-badge';
    badge.textContent = `${props.division} · Vidarbha`;

    const detailGrid = document.createElement('div');
    detailGrid.className = 'detail-grid';
    detailGrid.append(
      detailItem('Administrative Division', props.division),
      detailItem('District Headquarters', props.hq || props.district),
      detailItem('Recorded Archaeological Sites', `${props.siteCount || 0} sites in database`),
      detailItem('Region', 'Vidarbha, Maharashtra')
    );

    const filterBtn = document.createElement('button');
    filterBtn.type = 'button';
    filterBtn.className = 'zoom-to-site-btn';
    filterBtn.textContent = `Filter atlas to ${props.district} sites (${props.siteCount || 0})`;
    filterBtn.addEventListener('click', () => {
      if (elements.district) {
        elements.district.value = props.district;
        state.filters.district = props.district;
        applyFilters({ resetList: true });
      }
    });

    fragment.append(heading, badge, detailGrid, filterBtn);
    elements.detailsContent.append(fragment);
  }

  function showTopographicDetails(props) {
    state.selectedId = null;
    state.selectedFeature = props;
    updateMarkerVisibility();
    elements.closeDetails.disabled = false;
    elements.detailsContent.replaceChildren();

    if (elements.detailsEyebrow) elements.detailsEyebrow.textContent = 'Topographic feature';
    if (elements.detailsHeading) elements.detailsHeading.textContent = props.name;

    const fragment = document.createDocumentFragment();

    const heading = document.createElement('h3');
    heading.className = 'detail-site-name';
    heading.textContent = props.name;

    const badge = document.createElement('span');
    badge.className = 'detail-district-badge';
    badge.style.background = props.category === 'river' ? '#1d70a2' : '#8b5a2b';
    badge.textContent = `${props.type || props.category} · ${props.marathi || ''}`;

    const detailGrid = document.createElement('div');
    detailGrid.className = 'detail-grid';

    if (props.elevation) {
      detailGrid.append(detailItem('Elevation / Height', props.elevation));
    }
    if (props.length_km) {
      detailGrid.append(detailItem('River Length', `${props.length_km} km`));
    }
    if (props.basin) {
      detailGrid.append(detailItem('Drainage Basin', props.basin));
    }
    if (props.district) {
      detailGrid.append(detailItem('Location District', `${props.district} District`));
    }

    const descBlock = document.createElement('div');
    descBlock.className = 'reference-block';
    const descTitle = document.createElement('h3');
    descTitle.textContent = 'Physical & Archaeological Significance';
    const descText = document.createElement('p');
    descText.textContent = props.description || 'Major geographic feature of Vidarbha.';
    descBlock.append(descTitle, descText);

    fragment.append(heading, badge, detailGrid, descBlock);
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
      setTimeout(() => { button.textContent = 'Copy'; }, 1250);
    } catch {
      button.textContent = 'Select text';
      setTimeout(() => { button.textContent = 'Copy'; }, 1400);
    }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function plural(value, noun) {
    return `${noun}${value === 1 ? '' : 's'}`;
  }
})();
