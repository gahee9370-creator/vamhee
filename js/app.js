(() => {
  'use strict';

  // ============ toast ============
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  }

  // ============ D-day countdown ============
  const WEDDING_AT = new Date('2026-11-07T12:00:00+09:00').getTime();
  const pad = (n) => String(n).padStart(2, '0');
  function tickDday() {
    let d = Math.max(0, WEDDING_AT - Date.now());
    const days = Math.floor(d / 86400000); d -= days * 86400000;
    const hours = Math.floor(d / 3600000); d -= hours * 3600000;
    const mins = Math.floor(d / 60000); d -= mins * 60000;
    const secs = Math.floor(d / 1000);
    document.getElementById('ddDays').textContent = days;
    document.getElementById('ddHours').textContent = pad(hours);
    document.getElementById('ddMins').textContent = pad(mins);
    document.getElementById('ddSecs').textContent = pad(secs);
  }
  tickDday();
  setInterval(tickDday, 1000);

  // ============ calendar ============
  function buildCalendar() {
    const grid = document.getElementById('calendarGrid');
    const first = new Date(2026, 10, 1);
    const start = first.getDay();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < start; i++) {
      frag.appendChild(document.createElement('div'));
    }
    for (let day = 1; day <= 30; day++) {
      const cell = document.createElement('div');
      const dow = (start + day - 1) % 7;
      cell.textContent = day;
      if (day === 7) cell.classList.add('wedding-day');
      else if (dow === 0) cell.classList.add('sun');
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
  }
  buildCalendar();

  // ============ image slots ============
  // Longest edge is kept up to MAX_DIM so uploaded previews stay high-res
  // (independent of the on-screen slot size). Deployed photos placed as
  // static files under assets/images/ are shown at full original quality —
  // this re-encode only applies to in-browser preview uploads.
  const MAX_DIM = 2400;
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  async function fileToDataUrl(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, MAX_DIM / longest);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL('image/webp', 0.92);
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  const slotKey = (id) => 'invite:slot:' + id;

  function getSlotData(id) {
    try {
      const raw = localStorage.getItem(slotKey(id));
      return raw || null;
    } catch (e) { return null; }
  }
  function setSlotData(id, dataUrl) {
    try {
      localStorage.setItem(slotKey(id), dataUrl);
      return true;
    } catch (e) { return false; }
  }

  class ImageSlotController {
    constructor(root) {
      this.root = root;
      this.id = root.dataset.slot;
      this.staticSrc = root.dataset.static || '';
      this.img = root.querySelector('.img-slot-img');
      this.input = root.querySelector('.img-slot-input');
      this._depth = 0;

      // Only mark the slot "filled" once the image actually decodes —
      // a data-static path that doesn't exist yet (photo not delivered
      // yet) must fall back to the empty placeholder, not a broken-image icon.
      this.img.addEventListener('load', () => this.root.classList.add('filled'));
      this.img.addEventListener('error', () => this.root.classList.remove('filled'));

      root.addEventListener('click', () => {
        if (!this.root.classList.contains('filled')) {
          // Empty slot → pick a file.
          this.input.click();
          return;
        }
        // Filled: only the gallery opens the enlarged viewer. Story/hero
        // slots do nothing on click (no enlarge, no zoom).
        if (galleryIds.indexOf(this.id) >= 0) openLightbox(this.id);
      });
      this.input.addEventListener('change', () => {
        const f = this.input.files && this.input.files[0];
        if (f) this.ingest(f);
        this.input.value = '';
      });
      ['dragenter', 'dragover'].forEach((evt) => {
        root.addEventListener(evt, (e) => {
          e.preventDefault();
          if (evt === 'dragenter') this._depth++;
          root.classList.add('drag-over');
        });
      });
      root.addEventListener('dragleave', () => {
        if (--this._depth <= 0) { this._depth = 0; root.classList.remove('drag-over'); }
      });
      root.addEventListener('drop', (e) => {
        e.preventDefault();
        this._depth = 0;
        root.classList.remove('drag-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this.ingest(f);
      });

      this.refresh();
    }

    async ingest(file) {
      if (ACCEPT.indexOf(file.type) < 0) {
        toast('PNG, JPEG, WebP, AVIF 이미지만 가능해요.');
        return;
      }
      try {
        const url = await fileToDataUrl(file);
        const ok = setSlotData(this.id, url);
        if (!ok) toast('이미지가 커서 이 기기에서만 임시로 보여요.');
        this.refresh(url);
      } catch (err) {
        toast('이미지를 불러올 수 없어요.');
      }
    }

    // sessionUrl: if a save just failed (quota), show it this session anyway.
    refresh(sessionUrl) {
      // A local upload always wins over the baked-in static path — the
      // user's explicit drop is a deliberate override, not a fallback.
      const url = getSlotData(this.id) || sessionUrl || this.staticSrc;
      if (url) {
        if (this.img.getAttribute('src') !== url) {
          this.img.src = url;
        } else if (this.img.complete && this.img.naturalWidth > 0) {
          this.root.classList.add('filled');
        }
      } else {
        this.img.removeAttribute('src');
        this.root.classList.remove('filled');
      }
    }
  }

  const slotControllers = new Map();
  document.querySelectorAll('.img-slot').forEach((el) => {
    const ctrl = new ImageSlotController(el);
    slotControllers.set(ctrl.id, ctrl);
  });

  // ============ story carousel ============
  const storyScroller = document.getElementById('storyScroller');
  const storySlideCount = storyScroller.children.length;
  const storyDotsWrap = document.getElementById('storyDots');
  let storyIndex = 0;

  for (let i = 0; i < storySlideCount; i++) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', '슬라이드 ' + (i + 1));
    b.addEventListener('click', () => goStory(i));
    storyDotsWrap.appendChild(b);
  }
  function renderStoryDots() {
    [...storyDotsWrap.children].forEach((b, i) => b.classList.toggle('active', i === storyIndex));
  }
  function goStory(i) {
    storyIndex = Math.max(0, Math.min(storySlideCount - 1, i));
    renderStoryDots();
    const step = storyScroller.scrollWidth / storySlideCount;
    storyScroller.scrollTo({ left: step * storyIndex, behavior: 'smooth' });
  }
  let storyScrollTimer = null;
  storyScroller.addEventListener('scroll', () => {
    clearTimeout(storyScrollTimer);
    storyScrollTimer = setTimeout(() => {
      const step = storyScroller.scrollWidth / storySlideCount;
      const idx = Math.max(0, Math.min(storySlideCount - 1, Math.round(storyScroller.scrollLeft / step)));
      if (idx !== storyIndex) { storyIndex = idx; renderStoryDots(); }
    }, 60);
  });
  document.getElementById('storyPrev').addEventListener('click', () => goStory(storyIndex - 1));
  document.getElementById('storyNext').addEventListener('click', () => goStory(storyIndex + 1));
  renderStoryDots();

  // ============ gallery carousel + lightbox ============
  const galleryIds = [1, 2, 3, 4, 5, 6].map((n) => 'g' + n);
  const galleryScroller = document.getElementById('galleryScroller');
  document.getElementById('galPrev').addEventListener('click', () => {
    galleryScroller.scrollBy({ left: -galleryScroller.clientWidth * 0.7, behavior: 'smooth' });
  });
  document.getElementById('galNext').addEventListener('click', () => {
    galleryScroller.scrollBy({ left: galleryScroller.clientWidth * 0.7, behavior: 'smooth' });
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  let lbItems = [];
  let lbIndex = 0;

  function openLightbox(id) {
    lbItems = galleryIds
      .map((gid) => ({ id: gid, ctrl: slotControllers.get(gid) }))
      .filter((it) => it.ctrl && it.ctrl.root.classList.contains('filled'));
    if (!lbItems.length) return;
    lbIndex = Math.max(0, lbItems.findIndex((it) => it.id === id));
    renderLightbox();
    lightbox.hidden = false;
  }
  function renderLightbox() {
    const it = lbItems[lbIndex];
    lightboxImg.src = it.ctrl.img.src;
    lightboxCounter.textContent = (lbIndex + 1) + ' / ' + lbItems.length;
    const many = lbItems.length > 1;
    lightboxPrev.hidden = !many;
    lightboxNext.hidden = !many;
  }
  function closeLightbox() { lightbox.hidden = true; }
  function lbPrev() { lbIndex = (lbIndex - 1 + lbItems.length) % lbItems.length; renderLightbox(); }
  function lbNext() { lbIndex = (lbIndex + 1) % lbItems.length; renderLightbox(); }

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); lbPrev(); });
  lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); lbNext(); });
  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'ArrowLeft') lbPrev();
    else if (e.key === 'ArrowRight') lbNext();
    else if (e.key === 'Escape') closeLightbox();
  });
  let touchX = 0;
  lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0] ? e.touches[0].clientX : 0; });
  lightbox.addEventListener('touchend', (e) => {
    const x = e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
    const d = x - touchX;
    if (d < -40) lbNext(); else if (d > 40) lbPrev();
  });

  // ============ accordion ============
  function setupAccordion(toggleId, panelId, chevronId) {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      chevron.classList.toggle('open', open);
    });
  }
  setupAccordion('groomToggle', 'groomPanel', 'groomChevron');
  setupAccordion('brideToggle', 'bridePanel', 'brideChevron');

  // ============ copy account numbers ============
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      const num = btn.dataset.num;
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(num);
      } catch (e) {}
      btn.textContent = '복사됨 ✓';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });

  // ============ map buttons ============
  document.getElementById('btnNaver').addEventListener('click', () => {
    window.open('https://map.naver.com/p/entry/place/33499928', '_blank');
  });
  document.getElementById('btnKakao').addEventListener('click', () => {
    window.open('https://map.kakao.com/?q=' + encodeURIComponent('강서 더베뉴지'), '_blank');
  });
  document.getElementById('btnTmap').addEventListener('click', () => {
    window.location.href = 'tmap://search?name=' + encodeURIComponent('강서 더베뉴지');
    setTimeout(() => window.open('https://www.tmap.co.kr/', '_blank'), 500);
  });

  // ============ share / copy link ============
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: '이순규 ♥ 전가희 결혼합니다', url }); } catch (e) {}
    } else {
      copyLink();
    }
  });
  function copyLink() {
    const btn = document.getElementById('copyLinkBtn');
    const original = btn.textContent;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(location.href);
    } catch (e) {}
    btn.textContent = '복사됨 ✓';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
  document.getElementById('copyLinkBtn').addEventListener('click', copyLink);

  // ============ background music ============
  const bgm = document.getElementById('bgm');
  const musicToggle = document.getElementById('musicToggle');
  const musicNote = document.getElementById('musicNote');
  let musicOn = false;
  bgm.volume = 0;

  function fadeTo(target, ms) {
    const start = bgm.volume;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / ms);
      bgm.volume = start + (target - start) * p;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  musicToggle.addEventListener('click', async () => {
    musicOn = !musicOn;
    musicToggle.setAttribute('aria-pressed', String(musicOn));
    musicNote.classList.toggle('playing', musicOn);
    if (musicOn) {
      try {
        await bgm.play();
        fadeTo(0.5, 800);
      } catch (e) {
        toast('배경음악 파일을 아직 준비 중이에요.');
        musicOn = false;
        musicToggle.setAttribute('aria-pressed', 'false');
        musicNote.classList.remove('playing');
      }
    } else {
      fadeTo(0, 400);
      setTimeout(() => { if (!musicOn) bgm.pause(); }, 420);
    }
  });
})();
