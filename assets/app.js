// luizPHT — interação do portfólio estilo editor de vídeo
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const WA = 'https://wa.me/5531982943157?text=';
let clips = [];
const viewer = $('#viewer'), screen = $('#screen'), poster = $('#poster');
const mobile = () => matchMedia('(max-width:999px)').matches;
let cur = -1, playing = false, running = false, t0 = 0, off = 0; // off = posição da agulha (s) no clipe; running = vídeo tocando de verdade

const thumb = (c, w) => `https://i.vimeocdn.com/video/${c.dataset.thumb}-d_${w}`;
const pad = n => String(n).padStart(2, '0');
const tc = s => `00:${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}:${pad(Math.floor((s % 1) * 24))}`;
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===== Vídeos vindos da Google Planilha =====
// Planilha "Site luizPHT — Vídeos do portfólio" (Drive luiz.compht), aba "Videos".
// Colunas: A Ordem · B Mostrar no site (SIM/NÃO) · C Link do Vimeo · D Título · E Etiqueta · F Descrição · G Categoria
// Se a planilha falhar, o site usa os <article class="clip"> do index.html (reserva + SEO).
const SHEET = 'https://docs.google.com/spreadsheets/d/17W5Crg9H1wi9pivvVBqwo0kRHyzs8csuASRFN59DUDc/gviz/tq?tqx=out:csv&headers=1&sheet=Videos';

function parseCSV(txt) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

async function loadSheet() {
  const res = await withTimeout(fetch(SHEET, { cache: 'no-store' }), 5000);
  if (!res.ok) throw new Error('planilha ' + res.status);
  const rows = parseCSV(await res.text()).slice(1);
  // dados já conhecidos (capa, duração, formato) vêm da lista reserva do HTML
  const known = {};
  $$('#clips .clip').forEach(c => known[c.dataset.id] = { ...c.dataset });
  const list = rows.map((r, n) => {
    const [ordem, mostrar, link, titulo, etiqueta, desc, cat] = r.map(x => (x || '').trim());
    const m = (link || '').match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i);
    if (!m || !titulo || /^n/i.test(mostrar)) return null;
    const h = m[2] || (link.match(/[?&]h=([0-9a-f]+)/i) || [])[1] || '';
    return { n, ordem: parseFloat((ordem || '').replace(',', '.')), id: m[1], h, titulo, etiqueta, desc, cat: cat || 'Publicidade' };
  }).filter(Boolean).sort((a, b) => (isNaN(a.ordem) ? 1e9 : a.ordem) - (isNaN(b.ordem) ? 1e9 : b.ordem) || a.n - b.n);
  if (!list.length) throw new Error('planilha vazia');
  // vídeo novo: busca capa, duração e formato no Vimeo
  const full = await Promise.all(list.map(async v => {
    const k = known[v.id];
    if (k && k.thumb) return { ...v, o: k.o, dur: k.dur, thumb: k.thumb };
    try {
      const url = `https://vimeo.com/${v.id}${v.h ? '/' + v.h : ''}`;
      const o = await withTimeout(fetch('https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent(url)).then(r => r.json()), 5000);
      const t = (o.thumbnail_url || '').match(/\/video\/([^?]+?)-d_\d+/);
      return { ...v, o: o.height > o.width ? 'v' : 'h', dur: o.duration || 60, thumb: t ? t[1] : '' };
    } catch (e) { console.warn('Vimeo não respondeu para', v.id); return null; }
  }));
  const ok = full.filter(v => v && v.thumb);
  if (!ok.length) throw new Error('nenhum vídeo válido');
  $('#clips').innerHTML = ok.map(v => `<article class="clip" data-id="${v.id}"${v.h ? ` data-h="${v.h}"` : ''} data-o="${v.o}" data-dur="${v.dur}" data-group="${v.cat === 'Evento' ? 'e' : 'd'}" data-cat="${esc(v.cat)}" data-thumb="${esc(v.thumb)}">
        <h3>${esc(v.titulo)}</h3><p>${esc(v.etiqueta || v.cat)}</p><p class="d">${esc(v.desc)}</p></article>`).join('');
}

// monta miniaturas e timeline a partir dos <article class="clip">
function build() {
  clips = $$('.clip');
  clips.forEach((c, i) => {
    c.insertAdjacentHTML('afterbegin', `<img class="th" loading="lazy" src="${thumb(c, 640)}" alt="${esc(c.querySelector('h3').textContent)} — edição de vídeo por Luiz PHT"><em>${c.dataset.o === 'v' ? '9:16' : '16:9'}</em>`);
    c.tabIndex = 0;
    c.addEventListener('click', () => select(i, true));
    c.addEventListener('keydown', e => e.key === 'Enter' && select(i, true));
  });
  $('#count').textContent = clips.length + ' clipes';

  // timeline: segmentos proporcionais à duração real
  ['d', 'e'].forEach(g => {
    const lane = $(g === 'd' ? '#laneD' : '#laneE');
    lane.querySelectorAll('.seg[data-i]').forEach(s => s.remove());
    const list = clips.filter(c => c.dataset.group === g);
    const total = list.reduce((a, c) => a + +c.dataset.dur, 0);
    let x = 0;
    list.forEach(c => {
      const w = +c.dataset.dur / total * 99, i = clips.indexOf(c);
      lane.insertAdjacentHTML('beforeend', `<div class="seg v" data-i="${i}" style="left:${x}%;width:${w - .3}%;background-image:url(${thumb(c, 295)})">▶ ${esc(c.querySelector('h3').textContent)}</div>`);
      x += w;
    });
  });
  // clicar num clipe da timeline só posiciona a agulha (não toca) — ver seek() mais abaixo
  select(0, false);
}

function select(i, user, at = 0) {
  if (!clips.length) return;
  i = (i + clips.length) % clips.length;
  const c = clips[i], d = c.dataset, name = c.querySelector('h3').textContent;
  stop();
  cur = i;
  viewer.classList.toggle('vert', d.o === 'v');
  $('#ratio').textContent = d.o === 'v' ? '9:16' : '16:9';
  poster.src = thumb(c, d.o === 'v' ? 960 : 1280);
  poster.alt = name + ' — vídeo editado por Luiz PHT';
  $('#vname').textContent = name;
  $('#title').textContent = name;
  $('#desc').textContent = c.querySelector('.d').textContent;
  $('#tag').textContent = c.querySelectorAll('p')[0].textContent.toUpperCase();
  $('#cta').href = WA + encodeURIComponent(`Olá Luiz! Vi o vídeo "${name}" no seu portfólio e quero um vídeo assim.`);
  $$('.clip,.seg[data-i]').forEach(e => e.classList.toggle('on', e === c || e.dataset.i == i));
  if (user) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  off = at;
  if (user && !mobile()) play();
}

function play() {
  const d = clips[cur].dataset;
  const src = `https://player.vimeo.com/video/${d.id}?${d.h ? 'h=' + d.h + '&' : ''}autoplay=1&title=0&byline=0&portrait=0&color=d6a868&dnt=1${off >= 1 ? '#t=' + Math.floor(off) + 's' : ''}`;
  screen.insertAdjacentHTML('beforeend', `<iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(clips[cur].querySelector('h3').textContent)}"></iframe>`);
  screen.classList.add('playing'); playing = true; running = false; t0 = performance.now();
  $('#pp').textContent = '⏸';
}
function stop() {
  if (running && clips[cur]) off = Math.min(+clips[cur].dataset.dur, off + (performance.now() - t0) / 1000);
  screen.querySelector('iframe')?.remove();
  screen.classList.remove('playing'); playing = running = false;
  $('#pp').textContent = '▶';
}
// conversa com o player do Vimeo (postMessage): a agulha só anda quando o vídeo está realmente tocando

const vimeo = method => screen.querySelector('iframe')?.contentWindow.postMessage(JSON.stringify({ method }), 'https://player.vimeo.com');
addEventListener('message', e => {
  if (e.origin !== 'https://player.vimeo.com') return;
  let m; try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (_) { return; }
  const send = (method, value) => e.source.postMessage(JSON.stringify({ method, value }), e.origin);
  if (m.event === 'ready') ['play', 'pause', 'finish', 'ended', 'playProgress', 'timeupdate', 'seek', 'seeked'].forEach(v => send('addEventListener', v));
  else if (m.event === 'play' || m.event === 'playing') { running = true; t0 = performance.now(); $('#pp').textContent = '⏸'; }
  else if (/^(pause|ended|finish)$/.test(m.event)) { if (m.data && m.data.seconds != null) off = m.data.seconds; running = false; $('#pp').textContent = '▶'; }
  if (/^(timeupdate|playProgress|seek|seeked)$/.test(m.event) && m.data && m.data.seconds != null) { off = m.data.seconds; t0 = performance.now(); }
});
$('#play').onclick = play;
$('#pp').onclick = () => !playing ? play() : vimeo(running ? 'pause' : 'play');
$('#prev').onclick = () => select(cur - 1, true);
$('#next').onclick = () => select(cur + 1, true);

// swipe no celular
let sx = null;
screen.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
screen.addEventListener('touchend', e => {
  if (sx === null || playing) return;
  const dx = e.changedTouches[0].clientX - sx; sx = null;
  if (Math.abs(dx) > 50) select(cur + (dx < 0 ? 1 : -1), true);
});

// filtros do menu
$$('.menu button').forEach(b => b.onclick = () => {
  $$('.menu button').forEach(x => x.classList.toggle('on', x === b));
  const f = b.dataset.filter;
  clips.forEach(c => c.classList.toggle('off', f !== 'all' && c.dataset.cat !== f));
  const first = clips.find(c => !c.classList.contains('off'));
  if (first) select(clips.indexOf(first), false);
});

// painéis do celular (sobre / contato) e atalhos da timeline
function openSheet(id) {
  $$('#about,#contact').forEach(s => s.classList.toggle('show', s.id === id));
  document.body.classList.toggle('sheet-open', id === 'about' || id === 'contact');
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.open === (id || 'none')));
  if (!mobile() && id) $('#' + id).animate([{ scale: 1 }, { scale: 1.04 }, { scale: 1 }], { duration: 450 });
}
$$('[data-open]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.open === 'none' ? null : b.dataset.open)));
$$('[data-close]').forEach(b => b.onclick = () => openSheet(null));
$('#scrim').onclick = () => openSheet(null);

// medidor de áudio
const wave = $('#wave');
for (let i = 0; i < 30; i++) wave.insertAdjacentHTML('beforeend', `<i style="height:${20 + Math.random() * 80}%;animation-delay:${-Math.random()}s"></i>`);

// timeline: agulha parada; só anda enquanto o vídeo toca.
// Clicar/arrastar na régua ou num clipe posiciona a agulha e seleciona o clipe que está embaixo.
const ph = $('#ph'), lanesEl = $('.lanes');
function seek(x, lane) {
  const r = lanesEl.getBoundingClientRect(), pct = Math.max(0, Math.min(99, (x - r.left) / r.width * 100));
  const segs = [...lane.querySelectorAll('.seg[data-i]')];
  if (!segs.length) return;
  const seg = segs.find(s => pct >= parseFloat(s.style.left) && pct <= parseFloat(s.style.left) + parseFloat(s.style.width)) ||
    segs.reduce((a, s) => Math.abs(parseFloat(s.style.left) - pct) < Math.abs(parseFloat(a.style.left) - pct) ? s : a);
  const i = +seg.dataset.i, dur = +clips[i].dataset.dur;
  const at = Math.max(0, Math.min(dur - 0.5, (pct - parseFloat(seg.style.left)) / parseFloat(seg.style.width) * dur));
  if (i !== cur) select(i, false, at); else { stop(); off = at; }
}
lanesEl.addEventListener('pointerdown', e => {
  if (mobile()) return;
  const onRuler = e.target.classList.contains('ruler') || e.target === ph;
  const seg = e.target.closest('.seg[data-i]');
  if (!onRuler && !seg) return;
  const lane = seg ? seg.parentElement : (clips[cur]?.dataset.group === 'e' ? $('#laneE') : $('#laneD'));
  e.preventDefault();
  seek(e.clientX, lane);
  const mv = ev => seek(ev.clientX, lane);
  addEventListener('pointermove', mv);
  addEventListener('pointerup', () => removeEventListener('pointermove', mv), { once: true });
});
lanesEl.addEventListener('dblclick', e => e.target.closest('.seg[data-i]') && !playing && play()); // duplo clique toca
(function tick() {
  if (cur >= 0 && clips[cur]) {
    const d = clips[cur].dataset, dur = +d.dur;
    const s = running ? Math.min(dur, off + (performance.now() - t0) / 1000) : off;
    $('#tc').textContent = tc(s);
    const seg = $(`.seg[data-i="${cur}"]`);
    if (seg && !mobile()) ph.style.left = `calc(${seg.style.left} + ${parseFloat(seg.style.width) * s / dur}%)`;
  }
  requestAnimationFrame(tick);
})();

// painéis arrastáveis (desktop)
$$('.panel .bar').forEach(bar => {
  const el = bar.parentElement;
  bar.addEventListener('pointerdown', e => {
    if (mobile() || e.target.closest('button')) return;
    const r = el.getBoundingClientRect(), pr = el.offsetParent.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    Object.assign(el.style, { transform: 'none', animation: 'none', right: 'auto', bottom: 'auto', transition: 'none', zIndex: 10, left: r.left - pr.left + 'px', top: r.top - pr.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const mv = ev => { el.style.left = ev.clientX - pr.left - ox + 'px'; el.style.top = ev.clientY - pr.top - oy + 'px'; };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', () => removeEventListener('pointermove', mv), { once: true });
  });
});

// inicia: tenta a planilha; se falhar, usa a lista do HTML
loadSheet().catch(e => console.warn('Usando a lista reserva do HTML:', e.message)).finally(build);
