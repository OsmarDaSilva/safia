/* SAFIA — iconos de línea en lugar de emojis
   -------------------------------------------------------------------
   Reemplaza en toda la página (y en lo que se dibuja después) cada
   emoji por un icono SVG de línea, sobrio, del mismo estilo que el menú
   lateral. Los emojis sin equivalente profesional se quitan.
   En <option>, <title>, <textarea> y placeholders no se puede meter SVG:
   ahí se elimina el emoji.
   Incluir en todas las páginas después de safia-sync.js. */
(function () {
  'use strict';

  // Paths estilo Feather (viewBox 0 0 24 24, stroke currentColor)
  var P = {
    check:      '<polyline points="20 6 9 17 4 12"/>',
    x:          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert:      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    drop:       '<path d="M12 2.7s6 6.6 6 10.8a6 6 0 0 1-12 0C6 9.3 12 2.7 12 2.7z"/>',
    rain:       '<path d="M16 13v8M8 13v8M12 15v8"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/>',
    cloud:      '<path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    sun:        '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
    leaf:       '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.5 5-6.5"/>',
    flask:      '<path d="M9 3h6M10 3v6l-4.5 8A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
    edit:       '<path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17z"/><path d="M14 7l3 3"/>',
    menu:       '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    calendar:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    file:       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/>',
    sparkle:    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
    award:      '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1"/>',
    chart:      '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/><line x1="3" y1="21" x2="21" y2="21"/>',
    trend:      '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    pin:        '<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    globe:      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    thermo:     '<path d="M14 14.8V3.5a2.5 2.5 0 0 0-5 0v11.3a4 4 0 1 0 5 0z"/>',
    mic:        '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    cpu:        '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
    snow:       '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="4.9" y2="19.1"/>',
    user:       '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    printer:    '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    down:       '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    up:         '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    star:       '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
    wind:       '<path d="M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.7A2.5 2.5 0 1 1 19.5 12H2"/>',
    waves:      '<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    bulb:       '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
    plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    trash:      '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>',
    save:       '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    radio:      '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5m-8.5 0a6 6 0 0 1 0-8.5m11.3-2.8a10 10 0 0 1 0 14.1M4.9 4.9a10 10 0 0 0 0 14.1"/>',
    ruler:      '<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>',
    layers:     '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    tool:       '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7 7a2.1 2.1 0 0 1-3-3l7-7a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/>',
    clip:       '<path d="M21.4 11.1 12.5 20a6 6 0 0 1-8.5-8.5l8.9-8.9a4 4 0 0 1 5.7 5.7l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.2-8.2"/>',
    refresh:    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    dna:        '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12s10 6 10 6"/><path d="M8.5 6h7M8.5 18h7M9.5 12h5"/>',
    eye:        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    zap:        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    scale:      '<path d="M12 3v18M5 21h14"/><path d="M3 7h18"/><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
    truck:      '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    hash:       '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    image:      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    scissors:   '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.1" y2="15.9"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.1" y1="8.1" x2="12" y2="12"/>',
    inbox:      '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    flame:      '<path d="M12 22c4.4 0 7-3 7-7 0-3-2-5-3-6-1 2-2 3-3 3 0-3-1-6-4-9-1 4-5 6-5 12a7 7 0 0 0 8 7z"/>',
    dollar:     '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    rotate:     '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2-9.4L23 10"/>',
    bug:        '<path d="M8 2l1.9 1.9M16 2l-1.9 1.9"/><path d="M9 7.5a3 3 0 0 1 6 0v.5H9z"/><path d="M6 13H2m20 0h-4M6 17l-3 2m18-2 3 2M7 9 4 7m16 2 3-2"/><path d="M12 20a5 5 0 0 0 5-5v-4a5 5 0 0 0-10 0v4a5 5 0 0 0 5 5z"/><path d="M12 11v9"/>',
    lock:       '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    minus:      '<line x1="5" y1="12" x2="19" y2="12"/>',
    circle:     '<circle cx="12" cy="12" r="10"/>'
  };

  // emoji → [icono, color opcional, relleno]
  var MAPA = {
    '✓': ['check', '#178029'], '✅': ['check', '#178029'], '✔': ['check', '#178029'],
    '❌': ['x', '#B3261E'], '✕': ['x'],
    '⚠': ['alert', '#B8860B'],
    '💧': ['drop', '#1565C0'], '💦': ['drop', '#1565C0'], '🚿': ['drop', '#1565C0'], '🧴': ['drop', '#1565C0'],
    '🌧': ['rain', '#1565C0'], '⛈': ['rain', '#1565C0'], '🌦': ['rain', '#1565C0'], '☁': ['cloud', '#6B7280'], '⛅': ['cloud', '#6B7280'],
    '☀': ['sun', '#D4A24C'], '🏖': ['sun', '#D4A24C'],
    '🌾': ['leaf', '#8B6F00'], '🌱': ['leaf', '#22A93A'], '🌿': ['leaf', '#22A93A'], '🌽': ['leaf', '#22A93A'], '🌻': ['leaf', '#22A93A'], '🌸': ['leaf', '#22A93A'], '🍂': ['leaf', '#8B6F00'], '🌳': ['leaf', '#178029'],
    '🥜': ['leaf', '#22A93A'], '🫘': ['leaf', '#22A93A'], '🍅': ['leaf', '#22A93A'], '🥬': ['leaf', '#22A93A'], '🍊': ['leaf', '#22A93A'], '🍇': ['leaf', '#22A93A'], '☕': ['leaf', '#22A93A'], '🍌': ['leaf', '#22A93A'], '🥑': ['leaf', '#22A93A'],
    '🧪': ['flask', '#5B3FA6'], '🧬': ['dna', '#5B3FA6'],
    '✏': ['edit'], '📝': ['edit'],
    '🟢': ['circle', '#22A93A', true], '🟡': ['circle', '#D4A24C', true], '🔴': ['circle', '#B3261E', true], '⚫': ['circle', '#4B5563', true], '🟫': ['circle', '#8B5E3C', true],
    '☰': ['menu'],
    '📅': ['calendar'], '📄': ['file'], '📋': ['file'], '📁': ['file'], '📂': ['file'], '📚': ['file'],
    '✨': ['sparkle', '#5B3FA6'],
    '🏆': ['award', '#D4A24C'], '🥇': ['award', '#D4A24C'], '🥈': ['award', '#8C9196'], '🥉': ['award', '#B87333'],
    '📊': ['chart'], '📈': ['trend', '#178029'],
    '📍': ['pin', '#B3261E'], '🗺': ['pin'], '🌎': ['globe'], '🌍': ['globe'], '🌐': ['globe'],
    '🌡': ['thermo', '#B3261E'],
    '🎤': ['mic'], '🗣': ['mic'],
    '🧠': ['cpu', '#5B3FA6'], '🤖': ['cpu'],
    '❄': ['snow', '#1565C0'], '🧊': ['snow', '#1565C0'],
    '👤': ['user'], '🧑': ['user'], '👔': ['user'], '👥': ['users'],
    '🖨': ['printer'],
    '🔻': ['down', '#B3261E'], '⬇': ['down'], '🔺': ['up', '#178029'], '⬆': ['up'],
    '★': ['star', '#D4A24C'], '⭐': ['star', '#D4A24C'],
    '💨': ['wind', '#6B7280'], '🌊': ['waves', '#1565C0'],
    '💡': ['bulb', '#D4A24C'], '➕': ['plus'], '🔎': ['search'], '🔍': ['search'],
    '🗑': ['trash', '#B3261E'], '💾': ['save'],
    '🛰': ['radio'], '📡': ['radio'], '📐': ['ruler'], '🧱': ['layers'],
    '🔧': ['tool'], '⚙': ['tool'], '📎': ['clip'], '🔄': ['refresh'], '♻': ['refresh'],
    '👀': ['eye'], '🚀': ['zap', '#D4A24C'], '⚡': ['zap', '#D4A24C'], '🔥': ['flame', '#B3261E'],
    '⚖': ['scale'], '🚛': ['truck'], '🚜': ['truck'], '🔢': ['hash'], '🖼': ['image'], '✂': ['scissors'],
    '📭': ['inbox'], '💰': ['dollar', '#178029'], '🌀': ['rotate', '#1565C0'], '🐛': ['bug'], '🔒': ['lock']
    // Sin equivalente (se quitan): 👋 👆 💪 🤐 y cualquier otro no listado
  };

  function svg(nombre, color, relleno) {
    var d = P[nombre]; if (!d) return null;
    return '<svg class="ico-e" viewBox="0 0 24 24" aria-hidden="true"' + (color ? ' style="color:' + color + (relleno ? ';fill:' + color : '') + '"' : '') + '>' + d + '</svg>';
  }

  // Emoji (con variante y secuencias unidas por ZWJ) o símbolos sueltos usados como figuritas
  var RE = /(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*|[✓✔✕★⬆⬇☰]️?)/gu;
  function base(e) { return e.replace(/️/g, '').split('‍')[0]; }

  var SIN_SVG = { OPTION: 1, TITLE: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };

  function procesarTexto(nodo) {
    var t = nodo.nodeValue;
    if (!t || !RE.test(t)) { RE.lastIndex = 0; return; }
    RE.lastIndex = 0;
    var padre = nodo.parentNode;
    if (!padre) return;
    if (SIN_SVG[padre.nodeName] || padre.closest('svg')) { nodo.nodeValue = t.replace(RE, '').replace(/^\s+/, ''); return; }
    var partes = t.split(RE), frag = document.createDocumentFragment(), cambio = false;
    partes.forEach(function (parte) {
      if (!parte) return;
      var m = MAPA[base(parte)];
      if (m !== undefined || RE.test(parte)) {
        RE.lastIndex = 0;
        if (m) { var span = document.createElement('span'); span.innerHTML = svg(m[0], m[1], m[2]) || ''; if (span.firstChild) frag.appendChild(span.firstChild); }
        cambio = true;
      } else {
        frag.appendChild(document.createTextNode(parte));
      }
      RE.lastIndex = 0;
    });
    if (cambio) padre.replaceChild(frag, nodo);
  }

  function procesar(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { procesarTexto(raiz); return; }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    if (raiz.nodeType === 1 && raiz.closest && raiz.closest('svg')) return;
    var walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null), lista = [], n;
    while ((n = walker.nextNode())) lista.push(n);
    lista.forEach(procesarTexto);
    // placeholders y títulos de pestaña
    var els = raiz.nodeType === 1 && raiz.hasAttribute && raiz.hasAttribute('placeholder') ? [raiz] : [];
    if (raiz.querySelectorAll) els = els.concat(Array.prototype.slice.call(raiz.querySelectorAll('[placeholder]')));
    els.forEach(function (el) { var v = el.getAttribute('placeholder'); if (v && RE.test(v)) el.setAttribute('placeholder', v.replace(RE, '').replace(/^\s+/, '')); RE.lastIndex = 0; });
  }

  function arrancar() {
    var css = document.createElement('style');
    css.textContent = '.ico-e{width:1.05em;height:1.05em;display:inline-block;vertical-align:-0.18em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;margin-right:.15em;flex-shrink:0}';
    document.head.appendChild(css);
    if (document.title) { document.title = document.title.replace(RE, '').replace(/^\s+/, ''); }
    procesar(document.body);
    new MutationObserver(function (cambios) {
      cambios.forEach(function (c) {
        if (c.type === 'characterData') { procesarTexto(c.target); return; }
        Array.prototype.forEach.call(c.addedNodes, procesar);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);

  window.SafiaIconos = { svg: svg, procesar: procesar };
})();
