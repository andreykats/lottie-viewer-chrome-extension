(function () {
  'use strict';

  // --- Phase 1: Detect raw JSON displayed by Chrome ---
  // Chrome displays raw JSON/text in various ways depending on version:
  // - Old: single <pre> child of <body>
  // - New (built-in JSON viewer): may use shadow DOM or different structure
  // - Some versions: <pre> inside a wrapper div
  // We try multiple strategies to extract the raw text.
  let rawText = null;

  // Strategy 1: Classic Chrome — single <pre> in body
  const pre = document.querySelector('body > pre');
  if (pre && document.body.children.length === 1) {
    rawText = pre.textContent;
  }

  // Strategy 2: Chrome JSON viewer wraps content in a <pre> inside
  // a div or the formatter's structure
  if (!rawText) {
    const anyPre = document.querySelector('pre');
    if (anyPre) {
      rawText = anyPre.textContent;
    }
  }

  // Strategy 3: Fallback — try body's full text content (for custom viewers)
  if (!rawText) {
    rawText = document.body.innerText;
  }

  if (!rawText || rawText.length < 10) return;

  // Trim any whitespace and try to parse as JSON
  rawText = rawText.trim();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    return;
  }

  // --- Phase 2: Validate Lottie structure ---
  if (
    data === null ||
    typeof data !== 'object' ||
    typeof data.v !== 'string' ||
    typeof data.fr !== 'number' ||
    typeof data.ip !== 'number' ||
    typeof data.op !== 'number' ||
    !Array.isArray(data.layers)
  ) {
    return;
  }

  // --- Phase 3: Capture metadata before replacing DOM ---
  const fileSize = new Blob([rawText]).size;
  const fr = data.fr;
  const w = data.w || 0;
  const h = data.h || 0;
  const ip = data.ip;
  const op = data.op;
  const totalFrames = op - ip;
  const duration = totalFrames / fr;
  const layersCount = data.layers.length;

  // --- Phase 4: Build player UI ---
  document.body.innerHTML = '';
  document.body.className = 'lottie-viewer';
  document.title = 'Lottie Viewer — ' + (document.title || 'Animation');

  // Icons
  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    loop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10a2.5 2.5 0 0 0 2.5-2.5c0-.61-.23-1.21-.64-1.67a.528.528 0 0 1 .12-.7c.34-.24.73-.37 1.14-.37H17c2.76 0 5-2.24 5-5C22 5.92 17.51 2 12 2zM6.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  };

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'lv-toolbar';

  const btnPlayPause = createButton(ICONS.pause, 'Play / Pause');
  const progress = document.createElement('input');
  progress.type = 'range';
  progress.id = 'lv-progress';
  progress.min = 0;
  progress.max = Math.round(totalFrames);
  progress.value = 0;
  progress.step = 1;

  const timeElapsed = document.createElement('span');
  timeElapsed.className = 'lv-time';
  timeElapsed.textContent = formatTime(0);

  const timeDuration = document.createElement('span');
  timeDuration.className = 'lv-time';
  timeDuration.textContent = formatTime(duration);

  const sep1 = createSeparator();

  const btnLoop = createButton(ICONS.loop, 'Toggle Loop');
  btnLoop.classList.add('active');

  const btnBgColor = createButton(ICONS.palette, 'Background Color');

  var PRESETS = [
    '#6366f1', '#60a5fa', '#2dd4bf', '#f472b6', '#facc15',
    '#f87171', '#818cf8', '#e2e8f0', '#ffffff', '#000000',
  ];
  const colorPicker = document.createElement('div');
  colorPicker.className = 'lv-color-picker';

  // Title
  var cpTitle = document.createElement('h3');
  cpTitle.textContent = 'Background color';
  colorPicker.appendChild(cpTitle);

  // Presets
  var presetsRow = document.createElement('div');
  presetsRow.className = 'lv-presets';
  PRESETS.forEach(function (color) {
    var swatch = document.createElement('div');
    swatch.className = 'lv-color-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    presetsRow.appendChild(swatch);
  });
  colorPicker.appendChild(presetsRow);

  // Saturation/brightness area
  var satArea = document.createElement('div');
  satArea.className = 'lv-sat-area';
  var satWhite = document.createElement('div');
  satWhite.className = 'lv-sat-white';
  var satBlack = document.createElement('div');
  satBlack.className = 'lv-sat-black';
  var satThumb = document.createElement('div');
  satThumb.className = 'lv-sat-thumb';
  satArea.append(satWhite, satBlack, satThumb);
  colorPicker.appendChild(satArea);

  // Hue slider
  var hueSlider = document.createElement('div');
  hueSlider.className = 'lv-hue-slider';
  var hueThumb = document.createElement('div');
  hueThumb.className = 'lv-hue-thumb';
  hueSlider.appendChild(hueThumb);
  colorPicker.appendChild(hueSlider);

  // Hex input
  var hexRow = document.createElement('div');
  hexRow.className = 'lv-hex-row';
  var hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.value = '#1a1a2e';
  hexInput.spellcheck = false;
  hexRow.appendChild(hexInput);
  colorPicker.appendChild(hexRow);

  // Color picker state
  var cpHue = 230, cpSat = 0.4, cpBri = 0.18;

  function hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    var r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hexToHsv(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0,2),16)/255;
    var g = parseInt(hex.substring(2,4),16)/255;
    var b = parseInt(hex.substring(4,6),16)/255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, s, v];
  }

  function updatePickerUI() {
    var rgb = hsvToRgb(cpHue, cpSat, cpBri);
    var hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
    satArea.style.backgroundColor = 'hsl(' + cpHue + ', 100%, 50%)';
    satThumb.style.left = (cpSat * 100) + '%';
    satThumb.style.top = ((1 - cpBri) * 100) + '%';
    satThumb.style.backgroundColor = hex;
    hueThumb.style.left = (cpHue / 360 * 100) + '%';
    hueThumb.style.backgroundColor = 'hsl(' + cpHue + ', 100%, 50%)';
    hexInput.value = hex;
    return hex;
  }

  function applyPickerColor() {
    var hex = updatePickerUI();
    document.body.style.backgroundColor = hex;
    // Clear preset active state
    presetsRow.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
  }

  updatePickerUI();

  // Sat area dragging
  function handleSatMove(e) {
    var rect = satArea.getBoundingClientRect();
    cpSat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    cpBri = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    applyPickerColor();
  }
  satArea.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    handleSatMove(e);
    function onMove(ev) { handleSatMove(ev); }
    function onUp() { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // Hue slider dragging
  function handleHueMove(e) {
    var rect = hueSlider.getBoundingClientRect();
    cpHue = Math.max(0, Math.min(360, (e.clientX - rect.left) / rect.width * 360));
    applyPickerColor();
  }
  hueSlider.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    handleHueMove(e);
    function onMove(ev) { handleHueMove(ev); }
    function onUp() { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // Hex input
  hexInput.addEventListener('change', function () {
    var val = hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{3,6}$/.test(val)) {
      if (val[0] !== '#') val = '#' + val;
      var hsv = hexToHsv(val);
      cpHue = hsv[0]; cpSat = hsv[1]; cpBri = hsv[2];
      applyPickerColor();
    }
  });

  // Preset swatches
  presetsRow.addEventListener('click', function (e) {
    var swatch = e.target.closest('.lv-color-swatch');
    if (!swatch) return;
    presetsRow.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
    swatch.classList.add('active');
    var hsv = hexToHsv(swatch.dataset.color);
    cpHue = hsv[0]; cpSat = hsv[1]; cpBri = hsv[2];
    var hex = updatePickerUI();
    document.body.style.backgroundColor = hex;
  });

  const sep2 = createSeparator();

  const btnDetails = createButton(ICONS.info, 'Toggle Details');
  btnDetails.classList.add('active');

  toolbar.append(
    btnPlayPause, timeElapsed, progress, timeDuration,
    sep1, btnLoop, btnBgColor,
    sep2, btnDetails
  );

  // Player container
  const playerContainer = document.createElement('div');
  playerContainer.id = 'lv-player';

  const lottieTarget = document.createElement('div');
  playerContainer.appendChild(lottieTarget);

  // Details panel
  const detailsPanel = document.createElement('div');
  detailsPanel.id = 'lv-details';
  detailsPanel.classList.add('visible');
  detailsPanel.innerHTML =
    '<h3>Details</h3>' +
    detailRow('File Size', formatFileSize(fileSize)) +
    detailRow('Frame Rate', fr + ' fps') +
    detailRow('Resolution', w + ' × ' + h) +
    detailRow('Frames', Math.round(totalFrames)) +
    detailRow('Layers', layersCount) +
    detailRow('Duration', duration.toFixed(2) + 's');

  document.body.append(toolbar, playerContainer, detailsPanel, colorPicker);

  // --- Phase 5: Initialize Lottie ---
  var anim = lottie.loadAnimation({
    container: lottieTarget,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: data,
  });

  // Free memory — lottie-web has its own copy now
  rawText = null;
  data = null;

  // --- Phase 6: Wire controls ---
  let isPlaying = true;
  let wasScrubbing = false;

  btnPlayPause.addEventListener('click', function () {
    if (isPlaying) {
      anim.pause();
      btnPlayPause.innerHTML = ICONS.play;
    } else {
      // If animation ended (at last frame), restart from beginning
      if (Math.round(anim.currentFrame) >= Math.round(totalFrames) - 1) {
        anim.goToAndPlay(0, true);
      } else {
        anim.play();
      }
      btnPlayPause.innerHTML = ICONS.pause;
    }
    isPlaying = !isPlaying;
  });

  anim.addEventListener('enterFrame', function () {
    const frame = Math.round(anim.currentFrame);
    progress.value = frame;
    timeElapsed.textContent = formatTime(frame / fr);
  });

  anim.addEventListener('complete', function () {
    isPlaying = false;
    btnPlayPause.innerHTML = ICONS.play;
  });

  progress.addEventListener('input', function () {
    if (!wasScrubbing && isPlaying) {
      anim.pause();
      wasScrubbing = true;
    }
    anim.goToAndStop(Number(progress.value), true);
  });

  progress.addEventListener('change', function () {
    if (wasScrubbing) {
      wasScrubbing = false;
      if (isPlaying) {
        anim.goToAndPlay(Number(progress.value), true);
      }
    }
  });

  btnLoop.addEventListener('click', function () {
    anim.loop = !anim.loop;
    btnLoop.classList.toggle('active');
  });

  btnBgColor.addEventListener('click', function () {
    colorPicker.classList.toggle('visible');
    btnBgColor.classList.toggle('active');
  });

  btnDetails.addEventListener('click', function () {
    detailsPanel.classList.toggle('visible');
    btnDetails.classList.toggle('active');
  });

  // --- Helpers ---
  function createButton(iconSvg, title) {
    const btn = document.createElement('button');
    btn.innerHTML = iconSvg;
    btn.title = title;
    return btn;
  }

  function createSeparator() {
    const sep = document.createElement('div');
    sep.className = 'lv-separator';
    return sep;
  }

  function detailRow(label, value) {
    return (
      '<div class="lv-detail-row">' +
      '<span class="lv-detail-label">' + label + '</span>' +
      '<span class="lv-detail-value">' + value + '</span>' +
      '</div>'
    );
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
})();
