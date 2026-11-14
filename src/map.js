import L from 'leaflet';
import * as d3 from 'd3';
import { PALETTES } from './charts.js';

/** Fast canvas layer that paints 0.25° cells */
const CellLayer = L.Layer.extend({
  initialize(opts) { this._cells = null; this._vals = null; this._mask = null; this._pal = PALETTES.inferno; this._max = 1; this._opts = opts || {}; },
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
    this._canvas.style.pointerEvents = 'none';
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend resize', this._reset, this);
    map.on('zoomanim', this._animateZoom, this);
    this._reset();
  },
  onRemove(map) { this._canvas.remove(); map.off('moveend zoomend resize', this._reset, this); map.off('zoomanim', this._animateZoom, this); },
  _animateZoom(e) {
    const scale = this._map.getZoomScale(e.zoom);
    const offset = this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min;
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },
  setData(region, vals, max, mask) { this._region = region; this._vals = vals; this._max = max || 1; this._mask = mask; this._cats = null; this.redraw(); },
  setCategories(region, cats, colors, mask) { this._region = region; this._cats = cats; this._colors = colors; this._mask = mask; this.redraw(); },
  setPalette(p) { this._pal = PALETTES[p] || PALETTES.inferno; this.redraw(); },
  _reset() {
    const size = this._map.getSize();
    const tl = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, tl);
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = size.x * dpr; this._canvas.height = size.y * dpr;
    this._canvas.style.width = size.x + 'px'; this._canvas.style.height = size.y + 'px';
    this.redraw();
  },
  redraw() {
    if (!this._map || !this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const R = this._region; if (!R || (!this._vals && !this._cats)) return;
    const res = R.res, map = this._map;
    const scale = d3.scaleSqrt().domain([0, this._max]).range([0, 1]).clamp(true);
    const b = map.getBounds().pad(0.1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < R.nc; i++) {
      const cat = this._cats ? this._cats[i] : -1;
      const v = this._cats ? (cat >= 0 ? 1 : 0) : this._vals[i]; if (!v) continue;
      const lat = R.cellLat[i], lon = R.cellLon[i];
      if (lat > b.getNorth() || lat + res < b.getSouth() || lon > b.getEast() || lon + res < b.getWest()) continue;
      const p1 = map.latLngToContainerPoint([lat + res, lon]);
      const p2 = map.latLngToContainerPoint([lat, lon + res]);
      const t = scale(v);
      ctx.globalAlpha = this._mask && !this._mask[i] ? 0.18 : 0.35 + 0.65 * t;
      ctx.fillStyle = this._cats ? this._colors[cat] : this._pal(t);
      if (this._cats) ctx.globalAlpha = this._mask && !this._mask[i] ? 0.25 : 0.85;
      ctx.fillRect(p1.x, p1.y, Math.max(1, p2.x - p1.x - 0.4), Math.max(1, p2.y - p1.y - 0.4));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
});

export function createMap(el, { onAoi }) {
  const map = L.map(el, { zoomControl: true, worldCopyJump: true, minZoom: 2, preferCanvas: true, attributionControl: true }).setView([22, 79], 4);
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors · Fire data: NASA FIRMS', maxZoom: 12,
  }).addTo(map);
  map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
  L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 12, pane: 'labels', opacity: 0.8 }).addTo(map);
  const cells = new CellLayer(); cells.addTo(map);
  const aoiLayer = L.layerGroup().addTo(map);
  const draftLayer = L.layerGroup().addTo(map);
  const liveLayer = L.layerGroup().addTo(map);

  let tool = 'region', pts = [];
  const hint = document.getElementById('drawHint');
  const setHint = (html) => { if (!html) { hint.classList.add('hidden'); return; } hint.innerHTML = html; hint.classList.remove('hidden'); };

  function setTool(t) {
    tool = t; pts = []; draftLayer.clearLayers();
    el.style.cursor = t === 'rect' || t === 'poly' ? 'crosshair' : '';
    if (t === 'rect') setHint('Tap the <b>first corner</b> of your box');
    else if (t === 'poly') setHint('Tap to add vertices · <button class="chip" id="polyDone">Finish</button> <button class="chip" id="polyUndo">Undo</button>');
    else setHint(null);
    if (t === 'poly') {
      document.getElementById('polyDone').onclick = (e) => { e.stopPropagation(); finishPoly(); };
      document.getElementById('polyUndo').onclick = (e) => { e.stopPropagation(); pts.pop(); drawDraft(); };
    }
  }
  function drawDraft() {
    draftLayer.clearLayers();
    pts.forEach((p) => L.circleMarker(p, { radius: 4, color: '#ffd166', weight: 2, fillOpacity: 1 }).addTo(draftLayer));
    if (pts.length > 1) L.polyline(pts, { color: '#ffd166', weight: 2, dashArray: '5 4' }).addTo(draftLayer);
  }
  function finishPoly() {
    if (pts.length < 3) { setHint('Add at least <b>3 points</b>, then Finish'); return; }
    const coords = pts.map((p) => [p.lng, p.lat]);
    commit({ type: 'polygon', coords, label: `Polygon · ${pts.length} vertices` });
  }
  function commit(aoi) {
    draftLayer.clearLayers(); setTool('region-done');
    showAoi(aoi);
    onAoi(aoi);
  }
  function showAoi(aoi) {
    aoiLayer.clearLayers();
    if (!aoi) return;
    const style = { color: '#ffb347', weight: 2, fillOpacity: 0.05, dashArray: '6 4' };
    let lyr;
    if (aoi.type === 'bbox') { const [w, s, e, n] = aoi.bbox; lyr = L.rectangle([[s, w], [n, e]], style); }
    else if (aoi.type === 'polygon') lyr = L.polygon(aoi.coords.map(([x, y]) => [y, x]), style);
    if (aoi.circle) L.circle([aoi.circle.lat, aoi.circle.lon], { radius: aoi.circle.km * 1000, color: '#ffb347', weight: 2, fillOpacity: 0.05 }).addTo(aoiLayer);
    else if (lyr) lyr.addTo(aoiLayer);
  }
  map.on('click', (e) => {
    if (tool === 'rect') {
      pts.push(e.latlng); drawDraft();
      if (pts.length === 1) setHint('Now tap the <b>opposite corner</b>');
      else {
        const [a, b] = pts;
        const bbox = [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];
        commit({ type: 'bbox', bbox, label: `Box ${bbox.map((v) => v.toFixed(2)).join(', ')}` });
      }
    } else if (tool === 'poly') { pts.push(e.latlng); drawDraft(); }
  });
  map.on('dblclick', (e) => { if (tool === 'poly') { L.DomEvent.stop(e); finishPoly(); } });
  map.doubleClickZoom.disable();

  // ---------- live hotspots ----------
  function showLive(hotspots) {
    liveLayer.clearLayers();
    hotspots.forEach((h) => {
      L.circleMarker([h.lat, h.lon], { radius: 3 + Math.min(5, Math.sqrt(h.frp) / 3), color: '#ff3b5c', weight: 1, fillColor: h.dn === 'N' ? '#ff8fa3' : '#ff3b5c', fillOpacity: 0.85, className: 'live-hs' })
        .bindTooltip(`<b>${h.date} ${h.time.slice(0, 2)}:${h.time.slice(2)} UTC</b><br>FRP ${h.frp} MW · ${h.dn === 'N' ? 'night' : 'day'} · conf ${h.conf}`)
        .addTo(liveLayer);
    });
  }

  return {
    map, cells, setTool, showAoi, showLive,
    clearLive: () => liveLayer.clearLayers(),
    fit: (bbox) => map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [20, 20] }),
  };
}
