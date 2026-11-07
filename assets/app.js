// luizPHT — interação do portfólio estilo editor de vídeo
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const WA = 'https://wa.me/5531982943157?text=';
let clips = [];
const viewer = $('#viewer'), screen = $('#screen'), poster = $('#poster');
const mobile = () => matchMedia('(max-width:999px)').matches;
let cur = -1, playing = false, t0 = 0;

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
  $$('.seg[data-i]').forEach(s => s.addEventListener('click', () => select(+s.dataset.i, true)));
  select(0, false);
}

function select(i, user) {
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
  t0 = performance.now();
  if (user && !mobile()) play();
}

function play() {
  const d = clips[cur].dataset;
  const src = `https://player.vimeo.com/video/${d.id}?${d.h ? 'h=' + d.h + '&' : ''}autoplay=1&title=0&byline=0&portrait=0&color=d6a868&dnt=1`;
  screen.insertAdjacentHTML('beforeend', `<iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(clips[cur].querySelector('h3').textContent)}"></iframe>`);
  screen.classList.add('playing'); playing = true; t0 = performance.now();
  $('#pp').textContent = '⏸';
}
function stop() {
  screen.querySelector('iframe')?.remove();
  screen.classList.remove('playing'); playing = false;
  $('#pp').textContent = '▶';
}
$('#play').onclick = play;
$('#pp').onclick = () => playing ? stop() : play();
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

// timecode + agulha percorrendo o clipe selecionado
const ph = $('#ph');
(function tick() {
  if (cur >= 0 && clips[cur]) {
    const d = clips[cur].dataset, dur = +d.dur;
    const s = ((performance.now() - t0) / 1000) % dur;
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
