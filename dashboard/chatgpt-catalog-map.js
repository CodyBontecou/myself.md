/** Raster basemap for loaded observations; tile delivery never receives point or health records.
 * @param {HTMLElement} field
 * @param {boolean} [fictional] */
export function mountLocationMap(field, fictional = true) {
  field.dataset.mapReady = 'true';
  field.classList.add('catalog-map');
  field.removeAttribute('role');
  field.setAttribute(
    'aria-label',
    `OpenStreetMap with ${fictional ? 'fictional ' : ''}recorded locations`,
  );
  const section = field.parentElement;
  section?.classList.add('catalog-map-section');
  const heading = section?.querySelector('h2');
  if (heading)
    heading.textContent = heading.textContent?.startsWith('Heart')
      ? 'Heart rate on the map'
      : 'Recorded locations on the map';
  /** @type {NodeListOf<HTMLElement>} */
  const dots = field.querySelectorAll('.dot');
  const points = [...dots].map((dot) => {
    const latitude = Number(dot.dataset.latitude),
      longitude = Number(dot.dataset.longitude);
    const radians = (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180;
    return {
      dot,
      x: (longitude + 180) / 360,
      y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2,
    };
  });
  if (!points.length) return;
  const west = Math.min(...points.map((p) => p.x)),
    east = Math.max(...points.map((p) => p.x));
  const north = Math.min(...points.map((p) => p.y)),
    south = Math.max(...points.map((p) => p.y));
  const centerX = (west + east) / 2,
    centerY = (north + south) / 2;
  let zoomOffset = 0;
  const tiles = document.createElement('div');
  tiles.className = 'map-tiles';
  tiles.setAttribute('aria-hidden', 'true');
  const controls = document.createElement('div');
  controls.className = 'map-controls';
  const attribution = document.createElement('a');
  attribution.className = 'map-attribution';
  attribution.textContent = '© OpenStreetMap contributors';
  attribution.href = 'https://www.openstreetmap.org/copyright';
  attribution.target = '_blank';
  attribution.rel = 'noopener';
  const note = document.createElement('p');
  note.className = 'map-note';
  const description = `${fictional ? 'Fictional points' : 'Recorded points'} · north is up · select a marker for details. Gaps do not imply a route.`;
  note.textContent = description;
  field.after(note);
  function draw() {
    const width = field.clientWidth,
      height = field.clientHeight;
    if (width < 1 || height < 1) return;
    const fit = Math.floor(
      Math.log2(
        Math.min(
          Math.max(64, width - 48) / Math.max(east - west, 0.00001),
          (height - 48) / Math.max(south - north, 0.00001),
        ) / 256,
      ),
    );
    const zoom = Math.max(fictional ? 8 : 0, Math.min(17, fit + zoomOffset)),
      scale = 256 * 2 ** zoom;
    const left = centerX * scale - width / 2,
      top = centerY * scale - height / 2;
    field.dataset.mapZoom = String(zoom);
    tiles.replaceChildren();
    for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
      for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
        if (y < 0 || y >= 2 ** zoom) continue;
        const tileX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
        const image = document.createElement('img');
        image.alt = '';
        image.referrerPolicy = 'origin';
        image.draggable = false;
        image.src = `https://myself.md/apps/chatgpt/${fictional ? 'tiles' : 'map-tiles'}/${zoom}/${tileX}/${y}.png`;
        image.style.left = `${x * 256 - left}px`;
        image.style.top = `${y * 256 - top}px`;
        image.addEventListener('error', () => {
          note.textContent =
            'Map tiles unavailable. Recorded point markers and the exact details below remain available.';
        });
        tiles.append(image);
      }
    }
    for (const p of points) {
      p.dot.style.left = `${p.x * scale - left}px`;
      p.dot.style.top = `${p.y * scale - top}px`;
    }
  }
  for (const [label, change] of /** @type {const} */ ([
    ['Zoom in', 1],
    ['Zoom out', -1],
    ['Fit points', 0],
  ])) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label === 'Zoom in' ? '+' : label === 'Zoom out' ? '−' : label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      zoomOffset = change === 0 ? 0 : Math.max(-2, Math.min(3, zoomOffset + change));
      draw();
    });
    controls.append(button);
  }
  field.append(tiles, controls, attribution);
  const resize = new ResizeObserver(() => {
    if (field.isConnected) draw();
    else resize.disconnect();
  });
  resize.observe(field);
  draw();
  return () => resize.disconnect();
}
