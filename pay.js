/* ============================================================
   AIDL 상품 판매 + 토스페이먼츠 결제 (테스트 모드)
   - 상품(이름·가격·설명·이미지)은 관리자 [상품] 탭에서 등록한 클라우드 데이터를 그대로 불러옵니다.
   - 결제창은 토스 결제위젯(v2). 결제 승인은 Supabase 서버 함수(toss-pay)가 처리합니다.
   - CLIENT_KEY 는 "공개용 클라이언트 키"입니다. (시크릿 키는 절대 여기에 넣지 마세요)
   - 아래 키는 토스 공식 문서의 공개 테스트 키라 실제 결제는 일어나지 않습니다.
     내 상점의 테스트 키(test_gck_...)로 바꾸려면 아래 한 줄만 고치면 됩니다.
   ============================================================ */
(function () {
  'use strict';
  var CLIENT_KEY = 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
  var C = window.AIDLC;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
  function img(u) { u = String(u || ''); return (/^https:\/\/[^\s"'<>]+$/i.test(u) || /^assets\/[\w\-./]+$/i.test(u)) ? u : ''; }
  var list = [], sdkP = null, cur = null, widgets = null;

  /* ---------- 상품 목록 ---------- */
  function renderShop() {
    var sec = $('#shop'), grid = $('#shopGrid'); if (!sec || !grid) return;
    sec.hidden = !list.length;
    grid.innerHTML = list.map(function (p) {
      var im = img(p.image);
      return '<article class="card prod rv in"><div class="pim">' + (im ? '<img src="' + esc(im) + '" alt="' + esc(p.title) + '" loading="lazy">' : '<span class="pph">E-BOOK</span>') + '</div>' +
        '<div class="ptx"><h3>' + esc(p.title) + '</h3>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
        '<div class="prow"><b class="pprice">' + won(p.price) + '</b><button class="btn primary" type="button" data-buy="' + esc(p.id) + '">구매하기</button></div></div></article>';
    }).join('');
  }
  function loadShop() {
    if (!C || !C.enabled) return;
    C.products().then(function (r) { list = r || []; renderShop(); }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-buy]'); if (!b) return;
    var p = list.filter(function (x) { return x.id === b.getAttribute('data-buy'); })[0]; if (p) openCheckout(p);
  });

  /* ---------- 토스 SDK ---------- */
  function sdk() {
    if (window.TossPayments) return Promise.resolve();
    if (sdkP) return sdkP;
    sdkP = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'https://js.tosspayments.com/v2/standard'; s.async = true;
      s.onload = ok; s.onerror = function () { sdkP = null; no(new Error('sdk')); }; document.head.appendChild(s);
    });
    return sdkP;
  }

  /* ---------- 공통 모달 ---------- */
  var ov = null;
  function open(html, cls) {
    close();
    ov = document.createElement('div'); ov.className = 'pay-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="pay-box ' + (cls || '') + '">' + html + '</div>';
    document.body.appendChild(ov); document.body.classList.add('pay-open');
    ov.addEventListener('click', function (e) { if (e.target === ov && !ov.dataset.lock) close(); });
    var x = ov.querySelector('[data-x]'); if (x) x.onclick = close;
    return ov;
  }
  function close() { if (ov) { ov.remove(); ov = null; } document.body.classList.remove('pay-open'); widgets = null; cur = null; }
  function cleanUrl() { try { history.replaceState(null, '', location.pathname + (location.hash || '')); } catch (e) {} }

  /* ---------- 결제창 ---------- */
  function openCheckout(p) {
    open('<button class="pay-x" type="button" data-x aria-label="닫기">×</button>' +
      '<div class="pay-hd"><span class="pay-tag">TEST MODE · 실제 결제 없음</span><h3>' + esc(p.title) + '</h3><div class="pay-amt">' + won(p.price) + '</div></div>' +
      '<p class="pay-msg" id="tpMsg">결제창을 불러오는 중…</p><div id="tpPm"></div><div id="tpAg"></div>' +
      '<button class="btn primary big pay-go" type="button" id="tpGo" disabled>결제하기</button>');
    cur = p;
    sdk().then(function () {
      var tp = window.TossPayments(CLIENT_KEY);
      widgets = tp.widgets({ customerKey: window.TossPayments.ANONYMOUS });
      return widgets.setAmount({ currency: 'KRW', value: p.price });
    }).then(function () {
      return Promise.all([widgets.renderPaymentMethods({ selector: '#tpPm', variantKey: 'DEFAULT' }), widgets.renderAgreement({ selector: '#tpAg', variantKey: 'AGREEMENT' })]);
    }).then(function () {
      var m = $('#tpMsg'); if (m) m.remove();
      var go = $('#tpGo'); if (go) { go.disabled = false; go.onclick = pay; }
    }).catch(function () { var m = $('#tpMsg'); if (m) m.textContent = '결제창을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'; });
  }
  function pay() {
    var go = $('#tpGo'), p = cur; if (!p || !widgets) return;
    go.disabled = true; go.textContent = '주문 만드는 중…';
    C.pay({ action: 'order', productId: p.id }).then(function (o) {
      if (Number(o.amount) !== Number(p.price)) { throw new Error('상품 가격이 바뀌었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.'); }
      var base = location.origin + location.pathname;
      return widgets.requestPayment({ orderId: o.orderId, orderName: o.orderName, successUrl: base + '?pay=ok', failUrl: base + '?pay=fail' });
    }).catch(function (e) {
      if (!$('#tpGo')) return;
      go.disabled = false; go.textContent = '결제하기';
      if (e && (e.code === 'USER_CANCEL' || e.code === 'PAY_PROCESS_CANCELED')) return;
      var m = document.createElement('p'); m.className = 'pay-msg bad'; m.textContent = (e && e.message) || '결제를 시작하지 못했어요.'; go.parentNode.insertBefore(m, go);
    });
  }

  /* ---------- 결제 후 돌아왔을 때 ---------- */
  function done(o) {
    var box = open('<div class="pay-ok"><div class="pay-chk" aria-hidden="true">✓</div><h3>결제가 완료되었습니다! 감사합니다.</h3>' +
      '<p class="pay-sum"><b>' + esc(o.orderName) + '</b><br>' + won(o.amount) + '</p>' +
      '<p class="pay-note">테스트 결제라 실제 금액은 청구되지 않았어요.</p><button class="btn primary big" type="button" data-x>확인</button></div>', 'ok');
    box.dataset.lock = '1';
  }
  function fail(msg) {
    open('<div class="pay-ok"><div class="pay-chk bad" aria-hidden="true">!</div><h3>결제가 완료되지 않았어요</h3><p class="pay-note">' + esc(msg || '다시 시도해 주세요.') + '</p><button class="btn primary big" type="button" data-x>확인</button></div>');
  }
  function back() {
    var q = new URLSearchParams(location.search), st = q.get('pay'); if (!st) return;
    if (st === 'ok' && q.get('paymentKey') && q.get('orderId')) {
      cleanUrl();
      open('<div class="pay-ok"><p class="pay-msg">결제를 확인하는 중입니다. 창을 닫지 말고 잠시만 기다려 주세요…</p></div>').dataset.lock = '1';
      C.pay({ action: 'confirm', paymentKey: q.get('paymentKey'), orderId: q.get('orderId'), amount: Number(q.get('amount')) })
        .then(done).catch(function (e) { fail(e && e.message); });
    } else if (st === 'fail') { cleanUrl(); fail(q.get('message') || '결제가 취소되었거나 실패했어요.'); }
  }
  function boot() { if (!C || !C.enabled) return; back(); loadShop(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
