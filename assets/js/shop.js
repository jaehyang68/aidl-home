/* ============================================================
   AIDL 프로그램 진열 · 상세페이지 · 뉴스레터 구독 · 관리자 진입
   - 서버 없이 동작합니다. 관리자가 등록한 내용은 "관리자 브라우저(localStorage)"에 저장되고,
     [백업·가져오기]에서 내려받은 programs.json 을 assets/data/ 에 올리면 모든 방문자에게 보입니다.
   - 뉴스레터 구독자는 브라우저에 저장 + 80284@naver.com 으로 메일(FormSubmit)도 함께 보냅니다.
   - 구글 시트 연동 자리: sendToSheet() 안에 Apps Script 웹앱 주소를 넣으면 됩니다.
   ============================================================ */
(function () {
  'use strict';
  var KP = 'aidl_programs_v1', KS = 'aidl_subscribers_v1', KA = 'aidl_admin_pin_v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : { MAIL_TO: '80284@naver.com', FORM_KEY: '', PREVIEW: false };

  var CATS = {
    sig: { label: '시그니처', tag: 'SIGNATURE', icon: 'i-zap' },
    cus: { label: '대상별 맞춤', tag: '맞춤', icon: 'i-brief' },
    pub: { label: '책쓰기·출판', tag: '책쓰기', icon: 'i-book' },
    cert: { label: 'AI 자격증', tag: '자격증', icon: 'i-cert' },
    free: { label: '무료 자료', tag: 'FREE', icon: 'i-file' }
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function read(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return { ok: true }; } catch (e) { return { ok: false, error: e }; } }
  function usage() { var n = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('aidl_') === 0) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {} return n; }
  function safeSrc(u) { u = String(u || '').trim(); return (/^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(u) || /^https:\/\/[^\s"'<>]+$/i.test(u) || /^assets\/[\w\-./]+$/i.test(u)) ? u : ''; }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 글 내용 정리(보안) : 허용한 태그·속성만 남깁니다 ---------- */
  var OK_TAGS = { P: 1, H2: 1, H3: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, SPAN: 1, DIV: 1, IMG: 1, UL: 1, OL: 1, LI: 1, A: 1 };
  function cleanStyle(st) {
    var out = [];
    String(st || '').split(';').forEach(function (d) {
      var p = d.split(':'); if (p.length < 2) return;
      var k = p[0].trim().toLowerCase(), v = p.slice(1).join(':').trim();
      if (k === 'text-align' && /^(left|center|right)$/.test(v)) out.push('text-align:' + v);
      if ((k === 'background-color' || k === 'background') && /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|transparent|[a-z]+)$/i.test(v) && v.indexOf('url') < 0) out.push('background-color:' + v);
    });
    return out.join(';');
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { node.removeChild(n); return; }
        if (!OK_TAGS[n.tagName]) {
          if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|FORM|INPUT|BUTTON|SVG)$/.test(n.tagName)) { node.removeChild(n); return; }
          walk(n); while (n.firstChild) node.insertBefore(n.firstChild, n); node.removeChild(n); return;
        }
        [].slice.call(n.attributes).forEach(function (a) {
          var nm = a.name.toLowerCase(), keep = false;
          if (nm === 'style') { var s = cleanStyle(a.value); if (s) { n.setAttribute('style', s); keep = true; } }
          else if (n.tagName === 'IMG' && nm === 'src') { var u = safeSrc(a.value); if (u) { keep = true; } }
          else if (n.tagName === 'IMG' && nm === 'alt') keep = true;
          else if (n.tagName === 'A' && nm === 'href' && /^(https:\/\/|tel:|mailto:|#)/i.test(a.value.trim())) keep = true;
          if (!keep) n.removeAttribute(a.name);
        });
        if (n.tagName === 'IMG' && !n.getAttribute('src')) { node.removeChild(n); return; }
        if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        walk(n);
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  /* ---------- 기본(시작) 데이터 : 현재 홈페이지의 카드에서 읽어 옵니다 ---------- */
  var SEED_IMG = {
    'AI 업무혁신 MASTER': ['assets/img/lecture-smartwork.jpg', 'cover'],
    'AI CONTENT STUDIO': ['assets/img/poster-yeosu.jpg', 'contain'],
    'AI MOVIE STUDIO': ['assets/img/award-laurel-winner.jpg', 'cover'],
    '공공기관 AI 업무혁신': ['assets/img/lecture-yeosu.jpg', 'cover'],
    '교직원 생성형 AI': ['assets/img/case-teach.jpg', 'cover'],
    '소상공인 AI 콘텐츠 마케팅': ['assets/img/case-practice.jpg', 'cover'],
    '바이브코딩 웹앱 실전교육': ['assets/img/course-webapp.jpg', 'cover'],
    'AI 책쓰기·책출판': ['assets/img/books.jpg', 'contain'],
    'AI 자격증 과정': ['assets/img/award-icta.jpg', 'contain']
  };
  var cta = null, seedCache = null;
  function buildSeed() {
    if (seedCache) return seedCache;
    var list = [];
    $$('#progGrid .prog').forEach(function (c, i) {
      if (c.classList.contains('cta-card')) { cta = c.outerHTML; return; }
      var title = ($('h3', c) || {}).textContent || '', dds = $$('dd', c), dts = $$('dt', c);
      var cat = c.getAttribute('data-g') || 'cus';
      if (/자격증/.test(title)) cat = 'cert';
      var use = $('.ic use', c), img = SEED_IMG[title] || ['', 'cover'];
      var sum = ($('.one', c) || {}).textContent || '', target = dds[0] ? dds[0].textContent : '', out = dds[1] ? dds[1].textContent : '';
      var btn = $('[data-course]', c);
      list.push({
        id: 's' + (i + 1), category: cat, title: title, summary: sum, target: target,
        outputLabel: dts[1] ? dts[1].textContent : '산출물', output: out, duration: '',
        icon: use ? (use.getAttribute('href') || '').replace('#', '') : CATS[cat].icon,
        course: btn ? btn.getAttribute('data-course') : title,
        image: img[0], imageFit: img[1],
        bodyHtml: '<h2>이런 분께 추천합니다</h2><p>' + esc(target) + '</p><h2>교육을 마치면</h2><p>' + esc(out) + '</p><h2>진행 방식</h2><p>기관의 업무와 수강 대상에 맞춰 반나절 특강부터 종일 실습까지 일정에 맞게 조정합니다. 설명을 듣는 데서 끝나지 않고, 직접 만들어 보는 실습 중심으로 진행합니다.</p>',
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
      });
    });
    seedCache = list; return list;
  }

  var cache = { list: null, source: 'seed' };
  function load(cb) {
    var C = window.AIDLC;
    if (C && C.enabled) {   // 클라우드(Supabase)에서 먼저 읽기. 실패하거나 비어 있으면 기존 방식으로.
      return C.list().then(function (l) {
        if (l && l.length) { cache = { list: l, source: 'cloud' }; return cb(cache.list); }
        loadLocal(cb);
      }).catch(function () { loadLocal(cb); });
    }
    loadLocal(cb);
  }
  function loadLocal(cb) {
    var local = read(KP, null);
    if (local && Array.isArray(local.programs)) { cache = { list: local.programs, source: 'local' }; return cb(cache.list); }
    var seed = buildSeed();
    if (!window.fetch || location.protocol === 'file:') { cache = { list: seed, source: 'seed' }; return cb(seed); }
    fetch('assets/data/programs.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      if (j && Array.isArray(j.programs) && j.programs.length) cache = { list: j.programs, source: 'published' };
      else cache = { list: seed, source: 'seed' };
      cb(cache.list);
    }).catch(function () { cache = { list: seed, source: 'seed' }; cb(seed); });
  }
  /* 저장 결과는 항상 Promise({ok}) 로 돌려줍니다. 관리자 로그인 상태면 Supabase 에, 아니면 이 브라우저에 저장합니다. */
  function upData(html, C, memo) {
    var urls = String(html || '').match(/src="data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+"/g) || [];
    return urls.reduce(function (pr, u) {
      return pr.then(function (h) {
        var d = u.slice(5, -1);
        return (memo[d] ? Promise.resolve(memo[d]) : C.upload(d).then(function (x) { memo[d] = x; return x; })).then(function (x) { return h.split(u).join('src="' + x + '"'); });
      });
    }, Promise.resolve(html));
  }
  function savePrograms(list) {
    var C = window.AIDLC;
    if (C && C.enabled && C.loggedIn()) {
      var memo = {}, out = [];
      return list.reduce(function (pr, p) {
        return pr.then(function () {
          var q = JSON.parse(JSON.stringify(p));
          var a = /^data:image\//.test(q.image || '') ? (memo[q.image] ? Promise.resolve(memo[q.image]) : C.upload(q.image).then(function (x) { memo[q.image] = x; return x; })) : Promise.resolve(q.image);
          return a.then(function (x) { q.image = x; return upData(q.bodyHtml, C, memo); }).then(function (h) { q.bodyHtml = h; out.push(q); });
        });
      }, Promise.resolve()).then(function () { return C.saveAll(out); }).then(function () {
        cache = { list: out, source: 'cloud' }; render(); return { ok: true };
      }).catch(function (e) { return { ok: false, error: e, login: e && e.status === 401 }; });
    }
    var r = write(KP, { version: 1, savedAt: new Date().toISOString(), programs: list }); if (r.ok) { cache = { list: list, source: 'local' }; render(); }
    return Promise.resolve(r);
  }
  function getPrograms() { return (cache.list || buildSeed()).slice(); }

  /* ---------- 고객 화면 : 카드 진열 ---------- */
  var filter = 'all';
  function thumb(p) {
    var href = '#/program/' + encodeURIComponent(p.id), src = safeSrc(p.image);
    if (src) return '<a class="pthumb fit-' + (p.imageFit === 'contain' ? 'contain' : 'cover') + '" href="' + href + '" tabindex="-1" aria-hidden="true"><img src="' + esc(src) + '" alt="" loading="lazy"></a>';
    var ic = (CATS[p.category] || CATS.cus).icon;
    return '<a class="pthumb tile t-' + esc(p.category) + '" href="' + href + '" tabindex="-1" aria-hidden="true"><svg class="i"><use href="#' + esc(p.icon || ic) + '"/></svg><b>' + esc(p.title) + '</b></a>';
  }
  function card(p) {
    var c = CATS[p.category] || CATS.cus, href = '#/program/' + encodeURIComponent(p.id);
    var rows = '<dt>대상</dt><dd>' + esc(p.target || '-') + '</dd>';
    var second = p.output || p.duration;
    if (second) rows += '<dt>' + esc(p.outputLabel || (p.output ? '산출물' : '시간')) + '</dt><dd>' + esc(p.output || p.duration) + '</dd>';
    return '<article class="card hov prog' + (p.category === 'sig' ? ' sig' : '') + '" data-g="' + esc(p.category) + '" data-id="' + esc(p.id) + '">' +
      thumb(p) +
      '<div class="top"><span class="ic"><svg class="i"><use href="#' + esc(p.icon || c.icon) + '"/></svg></span><span class="tag' + (p.category === 'cus' ? ' b' : (p.category === 'pub' || p.category === 'cert' || p.category === 'free') ? ' g' : '') + '">' + esc(c.tag) + '</span></div>' +
      '<h3><a href="' + href + '">' + esc(p.title) + '</a></h3><p class="one">' + esc(p.summary) + '</p><dl>' + rows + '</dl>' +
      '<div class="pbtns"><a class="btn sm" href="' + href + '">자세히 보기</a><button class="btn sm primary" type="button" data-course="' + esc(p.course || p.title) + '">문의하기</button></div></article>';
  }
  function render() {
    var grid = $('#progGrid'); if (!grid) return;
    var list = getPrograms(), bar = $('.filters');
    var present = {}; list.forEach(function (p) { present[p.category] = 1; });
    if (filter !== 'all' && !present[filter]) filter = 'all';
    if (bar) {
      var h = '<button type="button" data-f="all" aria-pressed="' + (filter === 'all') + '">전체</button>';
      Object.keys(CATS).forEach(function (k) { if (present[k]) h += '<button type="button" data-f="' + k + '" aria-pressed="' + (filter === k) + '">' + CATS[k].label + '</button>'; });
      bar.innerHTML = h;
    }
    var show = list.filter(function (p) { return filter === 'all' || p.category === filter; });
    var html = show.map(card).join('');
    if (!show.length) html = '<p class="pempty">등록된 프로그램이 없습니다. 상단 문의하기로 맞춤 과정을 상담해 주세요.</p>';
    grid.innerHTML = html + (filter === 'all' || !show.length ? (cta || '') : '');
    $$('.prog', grid).forEach(function (c) { c.classList.add('in'); });
    if (typeof routeNow === 'function') routeNow(true);
  }

  /* ---------- 문의 폼에 과정 자동 선택 ---------- */
  function prefill(name) {
    var box = $('#coursePick'); if (!box || !name) return;
    var inp = $$('input', box).filter(function (i) { return i.value === name; })[0];
    if (!inp) {
      var l = document.createElement('label'); l.innerHTML = '<input type="checkbox" name="course"><span></span>';
      $('input', l).value = name; $('span', l).textContent = name; box.appendChild(l); inp = $('input', l);
    }
    inp.checked = true;
  }
  document.addEventListener('click', function (e) {
    var f = e.target.closest('.filters button');
    if (f) { filter = f.getAttribute('data-f'); render(); return; }
    var t = e.target.closest('[data-course]');
    if (t && !t.closest('#pdetail')) {
      prefill(t.getAttribute('data-course'));
      if (t.tagName === 'BUTTON') { var ct = $('#contact'); if (ct) ct.scrollIntoView({ behavior: 'smooth' }); }
    }
  });

  /* ---------- 독립 상세페이지 : #/program/아이디 ---------- */
  var baseTitle = document.title, detailOpen = false;
  function ensureDetail() {
    var d = $('#pdetail'); if (d) return d;
    d = document.createElement('div'); d.id = 'pdetail'; d.className = 'pd'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '프로그램 상세');
    document.body.appendChild(d); return d;
  }
  function openDetail(id) {
    var p = getPrograms().filter(function (x) { return x.id === id; })[0], d = ensureDetail();
    if (!p) {
      d.innerHTML = '<div class="pd-in"><a class="btn sm" href="#programs">← 목록으로</a><h1 style="margin-top:30px">프로그램을 찾을 수 없습니다</h1><p>주소가 바뀌었거나 삭제된 프로그램입니다.</p><a class="btn primary" href="#programs">전체 프로그램 보기</a></div>';
    } else {
      var c = CATS[p.category] || CATS.cus, src = safeSrc(p.image);
      var meta = '';
      if (p.target) meta += '<li><b>대상</b>' + esc(p.target) + '</li>';
      if (p.duration) meta += '<li><b>시간</b>' + esc(p.duration) + '</li>';
      if (p.output) meta += '<li><b>' + esc(p.outputLabel || '산출물') + '</b>' + esc(p.output) + '</li>';
      var img = src ? '<div class="pd-img fit-' + (p.imageFit === 'contain' ? 'contain' : 'cover') + '"><img src="' + esc(src) + '" alt="' + esc(p.title) + '"></div>'
        : '<div class="pd-img tile t-' + esc(p.category) + '"><svg class="i"><use href="#' + esc(p.icon || c.icon) + '"/></svg><b>' + esc(p.title) + '</b></div>';
      d.innerHTML = '<div class="pd-in"><a class="btn sm pd-back" href="#programs">← 프로그램 목록</a>' +
        '<div class="pd-top">' + img + '<div class="pd-info"><span class="eyebrow">' + esc(c.label) + '</span><h1>' + esc(p.title) + '</h1><p class="pd-sum">' + esc(p.summary) + '</p>' +
        (meta ? '<ul class="pd-meta">' + meta + '</ul>' : '') +
        '<div class="pd-cta"><a class="btn primary" href="#contact" data-pdc="' + esc(p.course || p.title) + '">이 프로그램으로 강의 문의하기</a>' +
        '<a class="btn kakao" href="http://pf.kakao.com/_xcXRTX/chat" target="_blank" rel="noopener"><svg class="i"><use href="#i-chat"/></svg>카카오톡 문의</a></div></div></div>' +
        '<article class="pbody">' + sanitize(p.bodyHtml) + '</article>' +
        '<div class="pd-end"><a class="btn sm" href="#programs">← 다른 프로그램 보기</a><a class="btn primary" href="#contact" data-pdc="' + esc(p.course || p.title) + '">강의 문의하기</a></div></div>';
      document.title = p.title + ' | 인공지능디지털연구소 AIDL';
    }
    d.hidden = false; d.scrollTop = 0; document.body.classList.add('pd-open'); detailOpen = true;
  }
  function closeDetail() {
    var d = $('#pdetail'); if (!d || d.hidden) return;
    d.hidden = true; document.body.classList.remove('pd-open'); detailOpen = false; document.title = baseTitle;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-pdc]'); if (a) prefill(a.getAttribute('data-pdc'));
  });
  var lastRoute = '';
  function routeNow(soft) {
    var h = location.hash, m = h.match(/^#\/program\/(.+)$/);
    if (m) { openDetail(decodeURIComponent(m[1])); }
    else { closeDetail(); }
    if (!soft && h === '#admin') requestAdmin();
  }
  addEventListener('hashchange', function () { routeNow(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && detailOpen) location.hash = '#programs'; });

  /* ---------- 공통 모달 ---------- */
  function modal(id, html, onClose) {
    var m = document.getElementById(id); if (m) m.remove();
    m = document.createElement('div'); m.id = id; m.className = 'aidl-modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="aidl-modal-box">' + html + '</div>';
    document.body.appendChild(m);
    var prev = document.activeElement;
    function close() { m.classList.remove('on'); setTimeout(function () { m.remove(); }, 200); document.removeEventListener('keydown', key); if (prev && prev.focus) try { prev.focus(); } catch (e) {} if (onClose) onClose(); }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var f = $$('input,button,select,textarea,a[href]', m).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); }
      }
    }
    m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    document.addEventListener('keydown', key);
    requestAnimationFrame(function () { m.classList.add('on'); var f = $('input,button.primary', m); if (f) f.focus(); });
    return { el: m, close: close };
  }

  /* ---------- 뉴스레터 구독 ---------- */
  function subs() { var s = read(KS, []); return Array.isArray(s) ? s : []; }
  function saveSubs(l) { return write(KS, l); }
  function sendToSheet(rec) { /* 구글 시트 연동 자리: Apps Script 웹앱 주소를 넣고 fetch(url,{method:'POST',body:JSON.stringify(rec)}) 하세요. */ return Promise.resolve(); }
  function sendMail(rec) {
    if (cfg.PREVIEW) return Promise.resolve({ ok: true, simulated: true });
    if (!window.fetch || !cfg.FORM_KEY) return Promise.reject(new Error('no-key'));
    return fetch('https://formsubmit.co/ajax/' + cfg.FORM_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: '[AIDL 뉴스레터 구독] ' + rec.name, _template: 'table', _captcha: 'false', email: rec.email, name: rec.name, 전화번호: rec.phone, 구분: '뉴스레터 구독 신청', 신청일시: new Date(rec.createdAt).toLocaleString('ko-KR') })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var ok = j && (j.success === true || j.success === 'true') && !/activat/i.test(j.message || '');
      if (!ok) throw new Error('mail'); return { ok: true };
    });
  }
  function openSub() {
    var m = modal('nlModal',
      '<button class="aidl-x" type="button" aria-label="닫기" data-x>×</button>' +
      '<div class="nl-form"><span class="nl-ico">✉</span><h3>AI 활용 소식, 무료로 받아보세요</h3><p class="nl-sub">강의 소식과 업무 효율 팁을 정리해 보내드립니다. 언제든 중단할 수 있어요.</p>' +
      '<form id="nlForm" novalidate>' +
      '<label>이름<input name="name" autocomplete="name" placeholder="홍길동" required></label>' +
      '<label>전화번호<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" required></label>' +
      '<label>이메일 주소<input name="email" type="email" autocomplete="email" placeholder="name@example.com" required></label>' +
      '<input class="hp" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="nl-agree"><input type="checkbox" name="agree"><span>개인정보 수집·이용에 동의합니다. (필수) <button type="button" data-priv>내용 보기</button></span></label>' +
      '<p class="nl-err" id="nlErr" role="alert"></p>' +
      '<button class="btn primary nl-go" type="submit">무료로 즉시 구독하기</button></form></div>');
    var box = m.el;
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) m.close();
      if (e.target.closest('[data-priv]')) { var b = $('#privBtn2'); if (b) b.click(); }
    });
    $('#nlForm', box).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, err = $('#nlErr', box), v = function (n) { return (f.elements[n].value || '').trim(); };
      if (v('_honey')) { m.close(); return; }
      var name = v('name'), phone = v('phone'), email = v('email');
      var digits = phone.replace(/\D/g, '');
      if (name.length < 2) return fail('이름을 2자 이상 입력해 주세요.', 'name');
      if (digits.length < 9 || digits.length > 11) return fail('전화번호를 정확히 입력해 주세요.', 'phone');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('이메일 주소 형식을 확인해 주세요.', 'email');
      if (!f.elements.agree.checked) return fail('개인정보 수집·이용에 동의해 주세요.', 'agree');
      var C = window.AIDLC, cloudOn = !!(C && C.enabled && !cfg.PREVIEW);
      var list = subs();
      if (list.some(function (s) { return s.email.toLowerCase() === email.toLowerCase(); })) return fail('이미 구독 중인 이메일입니다.', 'email');
      var rec = { id: uid(), name: name, phone: phone, email: email, agreedAt: new Date().toISOString(), createdAt: new Date().toISOString(), mailed: false };
      var btn = $('.nl-go', box); btn.disabled = true; btn.textContent = '구독 처리 중…';
      var cloud = cloudOn ? C.addSub(rec).then(function () { return 'ok'; }).catch(function (e) { return e && e.dup ? 'dup' : 'fail'; }) : Promise.resolve('off');
      cloud.then(function (cr) {
        if (cr === 'dup') { btn.disabled = false; btn.textContent = '무료로 즉시 구독하기'; return fail('이미 구독 중인 이메일입니다.', 'email'); }
        var sv = { ok: true };
        if (cr !== 'ok') { list.push(rec); sv = saveSubs(list); }   // 클라우드 저장이 안 될 때만 이 브라우저에 보관
        sendToSheet(rec);
        return sendMail(rec).then(function () { rec.mailed = true; return true; }).catch(function () { return false; }).then(function (okMail) { done(okMail, cr, sv); });
      });
      function done(okMail, cr, sv) {
        if (okMail) { var l2 = subs(); l2.forEach(function (s) { if (s.id === rec.id) s.mailed = true; }); saveSubs(l2); }
        $('.aidl-modal-box', box).innerHTML = '<button class="aidl-x" type="button" aria-label="닫기" data-x>×</button><div class="nl-form nl-done"><span class="nl-ico ok">✓</span><h3>구독이 완료되었습니다!</h3><p class="nl-sub">' + esc(name) + '님, 신청해 주셔서 감사합니다.' + ((okMail || cr === 'ok') ? '' : '<br><small>메일 전송은 잠시 후 다시 시도됩니다.</small>') + (sv.ok ? '' : '<br><small>이 브라우저의 저장 공간이 부족해 일부만 저장되었어요.</small>') + '</p><button class="btn primary" type="button" data-x>확인</button></div>';
      }
      function fail(msg, field) { err.textContent = msg; f.elements[field].focus(); }
    });
  }
  function flushMail() {
    var l = subs().filter(function (s) { return s.mailed === false; }).slice(0, 3);
    l.forEach(function (rec) { sendMail(rec).then(function () { var all = subs(); all.forEach(function (s) { if (s.id === rec.id) s.mailed = true; }); saveSubs(all); }).catch(function () {}); });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-sub]'); if (b) { e.preventDefault(); var n = $('#nav'); if (n) n.classList.remove('open'); document.body.style.overflow = ''; openSub(); } });

  /* ---------- 관리자 진입 : #admin 주소 또는 푸터 © 5번 클릭 → PIN ---------- */
  function sha(str) {
    if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return Promise.resolve('x' + (h >>> 0).toString(16));
  }
  var adminLoaded = false;
  function loadAdmin() {
    function go() { if (window.AIDL && AIDL.openAdmin) AIDL.openAdmin(); }
    if (adminLoaded) return go(); adminLoaded = true;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/admin.css'; document.head.appendChild(l);
    var s = document.createElement('script'); s.src = 'assets/js/admin.js'; s.onload = go;
    s.onerror = function () { adminLoaded = false; alert('관리자 화면을 불러오지 못했습니다. assets/js/admin.js 파일이 올라가 있는지 확인해 주세요.'); };
    document.body.appendChild(s);
  }
  /* 클라우드 연결 시: 이메일·비밀번호 로그인(Supabase) */
  function cloudLogin() {
    var C = window.AIDLC;
    if (C.loggedIn()) return loadAdmin();
    var m = modal('pinModal',
      '<button class="aidl-x" type="button" aria-label="닫기" data-x>×</button><div class="nl-form"><span class="nl-ico">🛠</span><h3>관리자 로그인</h3>' +
      '<p class="nl-sub">관리자 이메일과 비밀번호를 입력해 주세요.</p>' +
      '<form id="pinForm"><label>이메일<input name="email" type="email" autocomplete="username" required></label>' +
      '<label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>' +
      '<p class="nl-err" id="pinErr" role="alert"></p><button class="btn primary nl-go" type="submit">로그인</button></form></div>',
      function () { if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search); });
    m.el.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) m.close(); });
    $('#pinForm', m.el).addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, err = $('#pinErr', m.el), btn = $('.nl-go', m.el);
      var em = f.elements.email.value.trim(), pw = f.elements.pw.value;
      if (!em || !pw) { err.textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
      btn.disabled = true; btn.textContent = '확인 중…'; err.textContent = '';
      C.login(em, pw).then(function () { m.close(); setTimeout(loadAdmin, 220); }).catch(function (x) {
        btn.disabled = false; btn.textContent = '로그인';
        err.textContent = (x && (x.status === 400 || x.status === 401 || x.status === 422)) ? '이메일 또는 비밀번호가 맞지 않습니다.' : (x && x.status === 429 ? '시도가 너무 많습니다. 잠시 후 다시 해 주세요.' : '연결에 실패했어요. 인터넷 연결을 확인해 주세요.');
      });
    });
  }
  function requestAdmin() {
    if (window.AIDLC && AIDLC.enabled && !cfg.PREVIEW) return cloudLogin();
    try { if (sessionStorage.getItem('aidl_admin_ok') === '1') return loadAdmin(); } catch (e) {}
    var rec = read(KA, null), setup = !rec;
    var lock = 0; try { lock = +sessionStorage.getItem('aidl_pin_lock') || 0; } catch (e) {}
    var m = modal('pinModal',
      '<button class="aidl-x" type="button" aria-label="닫기" data-x>×</button><div class="nl-form"><span class="nl-ico">🛠</span><h3>' + (setup ? '관리자 PIN 만들기' : '관리자 확인') + '</h3>' +
      '<p class="nl-sub">' + (setup ? '이 브라우저에서 쓸 숫자 4자리 이상 PIN을 정해 주세요. 잊어버리면 브라우저 저장 데이터를 지워야 합니다.' : 'PIN을 입력해 주세요.') + '</p>' +
      '<form id="pinForm"><label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" minlength="4" required></label>' +
      (setup ? '<label>PIN 한 번 더<input name="pin2" type="password" inputmode="numeric" autocomplete="off" required></label>' : '') +
      '<p class="nl-err" id="pinErr" role="alert"></p><button class="btn primary nl-go" type="submit">' + (setup ? '설정하고 들어가기' : '들어가기') + '</button></form></div>',
      function () { if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search); });
    m.el.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) m.close(); });
    $('#pinForm', m.el).addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, err = $('#pinErr', m.el), pin = f.elements.pin.value.trim();
      if (Date.now() < lock) { err.textContent = '잠시 후 다시 시도해 주세요.'; return; }
      if (!/^\d{4,12}$/.test(pin)) { err.textContent = '숫자 4~12자리로 입력해 주세요.'; return; }
      if (setup) {
        if (pin !== f.elements.pin2.value.trim()) { err.textContent = '두 PIN이 같지 않습니다.'; return; }
        var salt = uid();
        sha(salt + pin).then(function (h) { write(KA, { salt: salt, hash: h }); ok(); });
      } else {
        sha(rec.salt + pin).then(function (h) {
          if (h === rec.hash) return ok();
          var n = (+sessionStorage.getItem('aidl_pin_fail') || 0) + 1; try { sessionStorage.setItem('aidl_pin_fail', n); if (n >= 5) { sessionStorage.setItem('aidl_pin_lock', Date.now() + 60000); sessionStorage.setItem('aidl_pin_fail', 0); } } catch (x) {}
          err.textContent = n >= 5 ? '5번 틀려 1분간 잠깁니다.' : 'PIN이 맞지 않습니다. (' + n + '/5)';
        });
      }
      function ok() { try { sessionStorage.setItem('aidl_admin_ok', '1'); sessionStorage.setItem('aidl_pin_fail', 0); } catch (x) {} m.close(); setTimeout(loadAdmin, 220); }
    });
  }
  (function () {
    var n = 0, t = 0, el = document.querySelector('.copy > span');
    if (el) el.addEventListener('click', function () { var now = Date.now(); if (now - t > 4000) n = 0; t = now; if (++n >= 5) { n = 0; requestAdmin(); } });
  })();

  /* 외부(관리자 화면)에서 쓰는 도구들 */
  window.AIDL = window.AIDL || {};
  AIDL.CATS = CATS; AIDL.esc = esc; AIDL.read = read; AIDL.write = write; AIDL.usage = usage; AIDL.safeSrc = safeSrc; AIDL.uid = uid;
  AIDL.sanitize = sanitize; AIDL.getPrograms = getPrograms; AIDL.savePrograms = savePrograms; AIDL.source = function () { return cache.source; };
  AIDL.subs = subs; AIDL.saveSubs = saveSubs; AIDL.modal = modal; AIDL.cloud = (window.AIDLC && AIDLC.enabled && !cfg.PREVIEW) ? window.AIDLC : null; AIDL.refresh = render; AIDL.seed = buildSeed; AIDL.KEYS = { programs: KP, subscribers: KS, pin: KA };

  /* 시작 */
  buildSeed();
  load(function () { render(); routeNow(false); flushMail(); });
})();
