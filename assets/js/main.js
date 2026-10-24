/* ============================================================
   인공지능디지털연구소(AIDL) 공식 웹앱 — main.js
   ※ 문의 메일 수신 주소 / 3D 로봇 주소는 아래 CONFIG 에서만 바꾸면 됩니다.
   ============================================================ */
const CONFIG = {
  MAIL_TO: '80284@naver.com',
  PHONE: '010-3420-2083',
  SPLINE_URL: 'https://prod.spline.design/AwO-6ba8cJrTfYkK/scene.splinecode',
  SPLINE_VIEWER: 'https://cdn.spline.design/@splinetool/viewer@2.0.111/build/spline-viewer.js'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1) 모바일 메뉴 -------------------------------------------------- */
(() => {
  const nav = $('#nav'), b = $('#burger');
  const set = (open) => {
    nav.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open);
    b.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    b.innerHTML = `<svg class="i"><use href="#i-${open ? 'x' : 'menu'}"/></svg>`;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  b.addEventListener('click', () => set(!nav.classList.contains('open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  addEventListener('resize', () => { if (innerWidth > 1260) set(false); });
})();

/* 2) 현재 위치 메뉴 강조 + 플로팅 버튼 --------------------------- */
(() => {
  const links = $$('.nav a[data-s]');
  const ids = links.map(a => a.dataset.s);
  const fab = $('#fab');
  const onScroll = () => {
    let cur = 'home';
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 140) cur = id;
    }
    links.forEach(a => a.classList.toggle('on', a.dataset.s === cur));
    const max = document.documentElement.scrollHeight - innerHeight;
    const c = $('#contact').getBoundingClientRect();
    const inContact = c.top < innerHeight * .7 && c.bottom > 0;
    fab.classList.toggle('on', scrollY > max * .3 && !inContact);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* 3) 히어로 영상 ---------------------------------------------------- */
(() => {
  const v = $('#heroVideo'), media = $('#heroMedia'), pb = $('#pauseBtn'), sb = $('#soundBtn');
  const label = () => {
    pb.innerHTML = `<svg class="i"><use href="#i-${v.paused ? 'play' : 'pause'}"/></svg><span>${v.paused ? '영상 재생' : '영상 멈춤'}</span>`;
    sb.innerHTML = `<svg class="i"><use href="#i-${v.muted ? 'mute' : 'vol'}"/></svg><span>${v.muted ? '소리 켜기' : '소리 끄기'}</span>`;
  };
  const toggle = () => { v.paused ? v.play().catch(() => {}) : v.pause(); };
  pb.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  media.addEventListener('click', toggle);
  sb.addEventListener('click', e => {
    e.stopPropagation();
    const wasMuted = v.muted;
    v.muted = !v.muted;
    if (wasMuted) { v.currentTime = 0; }
    v.play().catch(() => {});
    label();
  });
  v.addEventListener('play', label); v.addEventListener('pause', label);
  if (reduce) v.pause();
  v.play && v.play().catch(label);
  label();
  /* 화면 밖이면 영상 정지 (배터리·데이터 절약) */
  new IntersectionObserver(es => {
    es.forEach(e => { if (!e.isIntersecting && !v.paused) { v.dataset.auto = '1'; v.pause(); } else if (e.isIntersecting && v.dataset.auto) { v.dataset.auto = ''; v.play().catch(() => {}); } });
  }, { threshold: .1 }).observe(media);
})();

/* 4) 숫자 카운트업 ---------------------------------------------------- */
(() => {
  const els = $$('[data-count]');
  const run = el => {
    const to = +el.dataset.count; if (reduce) { el.textContent = to; return; }
    const t0 = performance.now(), d = 1400;
    const f = t => { const p = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: .6 });
  els.forEach(e => { e.textContent = '0'; io.observe(e); });
})();

/* 5) 3D 로봇 (Spline) — 화면에 가까워지면 불러옴 ------------------- */
(() => {
  const stage = $('#stage'), v = $('#robot'), msg = $('#robotMsg');
  let started = false, done = false;
  const ready = () => { if (done) return; done = true; stage.classList.add('ready'); msg.style.display = 'none'; };
  const fail = () => { if (done) return; msg.textContent = '3D 로봇을 불러오지 못했어요. 새로고침(F5)하거나 잠시 후 다시 열어 주세요.'; };
  async function start() {
    if (started) return; started = true;
    try { await import(CONFIG.SPLINE_VIEWER); } catch (e) { console.warn('[AIDL] spline viewer load error', e); fail(); return; }
    v.addEventListener('load-complete', ready);
    v.setAttribute('url', CONFIG.SPLINE_URL);
    const t0 = Date.now();
    const iv = setInterval(() => {
      const c = v.shadowRoot && v.shadowRoot.querySelector('canvas');
      const age = Date.now() - t0;
      if (done) return clearInterval(iv);
      if (c && c.width > 0 && age > 7000) { ready(); clearInterval(iv); }   // 이벤트가 오지 않는 환경 대비
      if (age > 30000) { clearInterval(iv); fail(); }
    }, 500);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { start(); o.disconnect(); } }, { rootMargin: '700px' }).observe(stage);
  } else start();
})();

/* 6) 로봇 인사말 타이핑 ------------------------------------------------ */
(() => {
  const el = $('#bubble');
  const msgs = ['안녕하세요! 저는 AIDL의 로봇 비서 NEXBOT이에요.', 'AI로 일하는 방법, 저와 함께 배워 볼까요?', '강의 문의는 아래 버튼을 눌러 주세요!'];
  if (reduce) { el.textContent = msgs[0]; return; }
  let started = false;
  const run = () => { let m = 0, i = 0; (function tick() {
    const t = msgs[m]; el.textContent = t.slice(0, i);
    if (i++ < t.length) return setTimeout(tick, 55);
    setTimeout(() => { m = (m + 1) % msgs.length; i = 0; tick(); }, 2300);
  })(); };
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting && !started) { started = true; run(); o.disconnect(); } }, { threshold: .3 }).observe(el);
})();

/* 7) 소개/AI LAB 영상 재생 버튼 --------------------------------------- */
$$('[data-video]').forEach(box => {
  const v = $('video', box), btn = $('.play', box);
  btn.addEventListener('click', () => {
    $('#heroVideo').pause();
    v.controls = true; v.preload = 'auto'; box.classList.add('playing'); v.play().catch(() => {});
  });
});

/* 8) 프로그램 필터 · 문의 과정 자동 선택 -------------------------- */
(() => {
  const btns = $$('.filters button'), cards = $$('#progGrid .prog');
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.setAttribute('aria-pressed', x === b));
    cards.forEach(c => { c.hidden = b.dataset.f !== 'all' && c.dataset.g !== b.dataset.f; });
  }));
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-course]'); if (!t) return;
    const cb = $$('#coursePick input').find(i => i.value === t.dataset.course);
    if (cb) cb.checked = true;
    if (t.tagName === 'BUTTON') $('#contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  });
})();

/* 9) JH RESULT 5 스텝퍼 ------------------------------------------------ */
(() => {
  const D = [
    ['DEFINE', '업무 정의', '무엇을 AI로 바꿀지부터 정합니다. 반복되고 시간이 오래 걸리는 업무를 목록으로 만들고, 가장 효과가 큰 업무 후보를 고릅니다.', ['내 업무 진단표', 'AI 적용 우선순위 TOP 3', '교육 목표 한 줄 정의']],
    ['DESIGN', 'AI 업무흐름 설계', '입력 → AI 작업 → 사람의 검토로 이어지는 업무 흐름과 프롬프트를 설계합니다. AI에게 일을 정확히 맡기는 방법을 익힙니다.', ['업무 흐름도', '내 업무용 프롬프트 세트', '검토 체크리스트']],
    ['CREATE', '결과물 제작', '강의 시간 안에 실제 문서·콘텐츠·영상·웹앱을 직접 만듭니다. 따라 하다 보면 내 결과물이 완성됩니다.', ['보고서·기획서·회의록 초안', '홍보 이미지·영상·숏폼', '반응형 웹앱·홈페이지']],
    ['AUTOMATE', '반복업무 자동화', '한 번 만든 방식을 템플릿과 자동화로 바꿔 매번 처음부터 만들지 않게 합니다. 업무 시간이 실제로 줄어드는 단계입니다.', ['재사용 템플릿', '반복업무 자동화 흐름', '팀 공유용 매뉴얼']],
    ['AMPLIFY', '성과 확산', '만든 결과물을 블로그·유튜브·SNS·기관 홍보와 팀 공유로 확산하고, 교육 이후에도 계속 쓰도록 이어갑니다.', ['SNS·블로그 게시물', '팀·기관 공유 플랜', '사후 지원 안내']]
  ];
  const tabs = $$('.steps-tab button'), H = $('#r5H'), P = $('#r5P'), L = $('#r5L'), bar = $('#r5Bar');
  const show = i => {
    const [k, n, p, l] = D[i];
    tabs.forEach((t, x) => { t.setAttribute('aria-selected', x === i); t.tabIndex = x === i ? 0 : -1; });
    H.innerHTML = `<em>${k}</em> · ${n}`; P.textContent = p;
    L.innerHTML = l.map(s => `<li><svg class="i"><use href="#i-check"/></svg>${s}</li>`).join('');
    bar.style.width = ((i + 1) / D.length * 100) + '%';
    const box = tabs[i].parentElement;
    if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: 'smooth' });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = (i + (e.key === 'ArrowRight' ? 1 : D.length - 1)) % D.length; show(n); tabs[n].focus(); }
    });
  });
  show(0);
})();

/* 10) 이미지 크게 보기 ------------------------------------------------- */
(() => {
  const lb = $('#lb'), img = $('#lbImg');
  const close = () => lb.classList.remove('on');
  $$('[data-zoom]').forEach(z => z.addEventListener('click', () => { const s = $('img', z); img.src = s.src; img.alt = s.alt; lb.classList.add('on'); }));
  lb.addEventListener('click', e => { if (e.target !== img) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();

/* 11) 개인정보 모달 ---------------------------------------------------- */
(() => {
  const m = $('#priv'), open = () => m.classList.add('on'), close = () => m.classList.remove('on');
  ['#privBtn', '#privBtn2'].forEach(s => $(s).addEventListener('click', open));
  $('#privX').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();

/* 12) 강의 문의 폼 → 대표 이메일(80284@naver.com)로 전송 ---------- */
(() => {
  const form = $('#inqForm'), btn = $('#submitBtn'), tx = $('#submitTx'), res = $('#result');
  const rules = {
    org: v => v.trim().length >= 2,
    nm: v => v.trim().length >= 2,
    tel: v => v.replace(/\D/g, '').length >= 9,
    em: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
  };
  const mark = (id) => {
    const el = document.getElementById(id), box = el.closest('.f'), ok = rules[id](el.value);
    box.classList.toggle('bad', !ok); box.classList.toggle('ok', ok); return ok;
  };
  Object.keys(rules).forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('blur', () => mark(id));
    el.addEventListener('input', () => { if (el.closest('.f').classList.contains('bad')) mark(id); });
  });
  $('#agree').addEventListener('change', () => { $('#agreeErr').style.display = $('#agree').checked ? 'none' : 'block'; });

  const val = n => (form.elements[n] ? form.elements[n].value.trim() : '');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    let first = null;
    Object.keys(rules).forEach(id => { if (!mark(id) && !first) first = document.getElementById(id); });
    const ag = $('#agree'); if (!ag.checked) { $('#agreeErr').style.display = 'block'; if (!first) first = ag; }
    if (first) { first.focus(); return; }
    if (form.elements._honey.value) { show(true); return; }   // 스팸 로봇은 조용히 통과

    const courses = $$('#coursePick input:checked').map(i => i.value).join(', ') || '(선택 없음)';
    const data = {
      '기관·회사명': val('기관·회사명'), '담당자': val('담당자'), '연락처': val('연락처'), '이메일': val('이메일'),
      '교육 대상': val('교육 대상') || '(미선택)', '예상 인원': val('예상 인원') || '(미입력)',
      '희망 과정': courses, '희망 일정': val('희망 일정') || '(미입력)', '문의 내용': val('문의 내용') || '(미입력)'
    };
    const payload = Object.assign({
      _subject: `[AIDL 강의문의] ${data['기관·회사명']} · ${data['담당자']}`,
      _template: 'table', _captcha: 'false', email: data['이메일'], name: data['담당자']
    }, data);

    btn.disabled = true; btn.classList.add('loading'); tx.textContent = '접수 중입니다…';
    try {
      const r = await fetch('https://formsubmit.co/ajax/' + CONFIG.MAIL_TO, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j.success === true || j.success === 'true')) show(true); else throw new Error(j.message || r.status);
    } catch (err) {
      console.warn('[AIDL] form error', err);
      show(false, data);
    } finally {
      btn.disabled = false; btn.classList.remove('loading'); tx.textContent = '강의 문의 접수하기';
    }
  });

  function show(ok, data) {
    res.classList.toggle('fail', !ok);
    $('#resH').textContent = ok ? '문의가 접수되었습니다' : '전송이 원활하지 않았어요';
    if (ok) {
      $('#resP').textContent = '감사합니다. 영업일 기준 1일 내에 입력하신 연락처로 연락드리겠습니다.';
    } else {
      const body = encodeURIComponent(Object.entries(data || {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
      $('#resP').innerHTML = `일시적인 문제로 접수하지 못했습니다. 아래 버튼으로 메일을 보내시거나 <a href="tel:01034202083" style="font-weight:800;text-decoration:underline">${CONFIG.PHONE}</a> 로 전화 주세요.<br><br><a class="btn primary" href="mailto:${CONFIG.MAIL_TO}?subject=${encodeURIComponent('[강의문의] ' + ((data || {})['기관·회사명'] || ''))}&body=${body}">이메일로 직접 보내기</a>`;
    }
    $('.ck use', res).setAttribute('href', ok ? '#i-check' : '#i-x');
    form.classList.add('sent');
    form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  $('#resetBtn').addEventListener('click', () => { form.reset(); $$('.f', form).forEach(f => f.classList.remove('ok', 'bad')); form.classList.remove('sent'); });
})();

/* 13) 스크롤 등장 효과 · 연도 --------------------------------------- */
(() => {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  $$('.rv').forEach(n => io.observe(n));
  $('#yr').textContent = new Date().getFullYear();
})();
