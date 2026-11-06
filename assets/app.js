// luizPHT — interação do portfólio estilo editor de vídeo
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const WA = 'https://wa.me/5531982943157?text=';
const clips = $$('.clip');
const viewer = $('#viewer'), screen = $('#screen'), poster = $('#poster');
const mobile = () => matchMedia('(max-width:999px)').matches;
let cur = -1, playing = false, t0 = 0;

const thumb = (c, w) => `https://i.vimeocdn.com/video/${c.dataset.thumb}-d_${w}`;
const pad = n => String(n).padStart(2, '0');
const tc = s => `00:${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}:${pad(Math.floor((s % 1) * 24))}`;

// miniaturas
clips.forEach((c, i) => {
  c.insertAdjacentHTML('afterbegin', `<img class="th" loading="lazy" src="${thumb(c, 640)}" alt="${c.querySelector('h3').textContent} — edição de vídeo por Luiz PHT"><em>${c.dataset.o === 'v' ? '9:16' : '16:9'}</em>`);
  c.tabIndex = 0;
  c.addEventListener('click', () => select(i, true));
  c.addEventListener('keydown', e => e.key === 'Enter' && select(i, true));
});
$('#count').textContent = clips.length + ' clipes';

// timeline: segmentos proporcionais à duração real
['d', 'e'].forEach(g => {
  const lane = $(g === 'd' ? '#laneD' : '#laneE');
  const list = clips.filter(c => c.dataset.group === g);
  const total = list.reduce((a, c) => a + +c.dataset.dur, 0);
  let x = 0;
  list.forEach(c => {
    const w = +c.dataset.dur / total * 99, i = clips.indexOf(c);
    lane.insertAdjacentHTML('beforeend', `<div class="seg v" data-i="${i}" style="left:${x}%;width:${w - .3}%;background-image:url(${thumb(c, 295)})">▶ ${c.querySelector('h3').textContent}</div>`);
    x += w;
  });
});
$$('.seg[data-i]').forEach(s => s.addEventListener('click', () => select(+s.dataset.i, true)));

function select(i, user) {
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
  screen.insertAdjacentHTML('beforeend', `<iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${clips[cur].querySelector('h3').textContent}"></iframe>`);
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
  if (cur >= 0) {
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

select(0, false);
