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
    ['navBuy', 'heroBuy'].forEach(function (id) { var n = document.getElementById(id); if (n) n.hidden = !list.length; });
    grid.innerHTML = list.map(function (p) {
      var im = img(p.image), td = new Date(), today = td.getFullYear() + '-' + ('0' + (td.getMonth() + 1)).slice(-2) + '-' + ('0' + td.getDate()).slice(-2);
      var live = !p.sale_until || String(p.sale_until) >= today;                 // 특가 기간이 지나면 배지·할인 표시를 숨깁니다
      var off = live && p.list_price && p.list_price > p.price ? Math.round((1 - p.price / p.list_price) * 100) : 0;
      var bd = live && p.badge ? '<span class="pbadge">' + esc(p.badge) + '</span>' : '';
      var until = live && p.sale_until && (p.badge || off) ? '<p class="psale">특가는 ' + esc(String(p.sale_until).slice(5, 7).replace(/^0/, '')) + '월 ' + esc(String(p.sale_until).slice(8, 10).replace(/^0/, '')) + '일까지 · 마감 전 조기 종료될 수 있어요</p>' : '';
      var pr = (off ? '<s class="plist">' + won(p.list_price) + '</s> ' : '') + '<b class="pprice">' + won(p.price) + '</b>' + (off ? ' <em class="poff">' + off + '% 할인</em>' : '');
      return '<article class="card prod rv in"><div class="pim">' + bd + (im ? '<img src="' + esc(im) + '" alt="' + esc(p.title) + '" loading="lazy">' : '<span class="pph">E-BOOK</span>') + '</div>' +
        '<div class="ptx"><h3>' + esc(p.title) + '</h3>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
        (p.detail ? '<button class="btn sm ghost" type="button" data-more="' + esc(p.id) + '">자세히 보기</button>' : '') + '' + until + '<div class="prow"><span class="pwrap">' + pr + '</span><button class="btn primary" type="button" data-buy="' + esc(p.id) + '">구매하기</button></div></div></article>';
    }).join('');
  }
  function loadShop() {
    if (!C || !C.enabled) return;
    C.products().then(function (r) { list = r || []; renderShop(); }).catch(function () {});
  }
  function rich(t) {   // ## 제목 / - 목록 / > 인용 / 나머지는 문단 (모두 이스케이프 후 변환)
    var out = [], ul = false;
    String(t || '').split(/\r?\n/).forEach(function (ln) {
      var m;
      if (ul && !/^- /.test(ln)) { out.push('</ul>'); ul = false; }
      if ((m = /^## (.+)/.exec(ln))) out.push('<h4>' + esc(m[1]) + '</h4>');
      else if ((m = /^- (.+)/.exec(ln))) { if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + esc(m[1]) + '</li>'); }
      else if ((m = /^> (.+)/.exec(ln))) out.push('<blockquote>' + esc(m[1]) + '</blockquote>');
      else if (ln.trim()) out.push('<p>' + esc(ln) + '</p>');
    });
    if (ul) out.push('</ul>');
    return out.join('');
  }
  document.addEventListener('click', function (e) {
    var mo = e.target.closest && e.target.closest('[data-more]');
    if (mo) {
      var q = list.filter(function (x) { return x.id === mo.getAttribute('data-more'); })[0];
      if (q) { open('<button class="pay-x" type="button" data-x aria-label="닫기">×</button><div class="pay-hd"><h3>' + esc(q.title) + '</h3><div class="pay-amt">' + won(q.price) + '</div></div><div class="pay-detail">' + rich(q.detail) + '</div><button class="btn primary big pay-go" type="button" data-buy="' + esc(q.id) + '">구매하기</button>', 'wide'); }
      return;
    }
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
    [].forEach.call(ov.querySelectorAll('[data-x]'), function (x) { x.onclick = close; });
    return ov;
  }
  function close() { if (ov) { ov.remove(); ov = null; } document.body.classList.remove('pay-open'); widgets = null; cur = null; }
  function cleanUrl() { try { history.replaceState(null, '', location.pathname + (location.hash || '')); } catch (e) {} }

  /* ---------- 결제창 ---------- */
  function openCheckout(p) {
    open('<button class="pay-x" type="button" data-x aria-label="닫기">×</button>' +
      '<div class="pay-hd"><span class="pay-tag">TEST MODE · 실제 결제 없음</span><h3>' + esc(p.title) + '</h3><div class="pay-amt">' + won(p.price) + '</div></div>' +
      '<label class="pay-em">다운로드 링크를 받을 이메일<input id="tpEm" type="email" inputmode="email" autocomplete="email" placeholder="example@naver.com" maxlength="120"></label><p class="pay-priv">입력하신 이메일은 다운로드 링크 발송과 주문 확인에만 사용합니다.</p><p class="pay-priv"><b>디지털 상품 안내:</b> 다운로드가 시작된 뒤에는 청약철회(환불)가 제한될 수 있어요. <button type="button" class="pay-lk" data-legal="refund">환불·청약철회 안내</button> · <button type="button" class="pay-lk" data-legal="terms">이용약관</button></p>' +
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
    var em = ($('#tpEm').value || '').trim();
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(em)) { $('#tpEm').focus(); $('#tpEm').classList.add('bad'); return; }
    go.disabled = true; go.textContent = '주문 만드는 중…';
    C.pay({ action: 'order', productId: p.id, buyerEmail: em }).then(function (o) {
      if (Number(o.amount) !== Number(p.price)) { throw new Error('상품 가격이 바뀌었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.'); }
      var base = location.origin + location.pathname;
      return widgets.requestPayment({ orderId: o.orderId, orderName: o.orderName, customerEmail: em, successUrl: base + '?pay=ok', failUrl: base + '?pay=fail' });
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
      (o.downloadUrl ? '<a class="btn yellow big pay-dl" href="' + esc(o.downloadUrl) + '" rel="noopener">📥 전자책 다운로드</a>' + (o.mailed ? '<p class="pay-note">입력하신 이메일(' + esc(o.email || '') + ')로도 다운로드 링크를 보냈어요. (7일간 유효, 안 보이면 스팸함을 확인해 주세요)</p>' : '<p class="pay-note">다운로드 링크는 이 화면에서만 보여요. 창을 닫기 전에 꼭 저장해 주세요.</p>') : '') +
      '<p class="pay-note">테스트 결제라 실제 금액은 청구되지 않았어요.</p>' +
      '<div class="pay-next"><p>🎤 우리 기관·모임에서 직접 들으시려면?</p><a class="btn primary" href="#contact" data-x>강의 문의하기</a>' + (list.length > 1 ? ' <a class="btn ghost" href="#shop" data-x>다른 AI 자료 보기</a>' : '') + '</div>' +
      '<button class="btn primary big" type="button" data-x>확인</button></div>', 'ok');
    box.dataset.lock = '1';
    // 한글 파일명으로 저장: 파일을 받아 이름을 붙여 저장합니다. 실패하면 기본 다운로드로 넘어갑니다.
    var dl = box.querySelector('.pay-dl');
    if (dl && o.downloadUrl) {
      dl.addEventListener('click', function (e) {
        if (!window.fetch || !window.URL || !URL.createObjectURL) return;
        e.preventDefault();
        var nm = String(o.orderName || '전자책').replace(/\s*[\(\[（].*?[\)\]）]\s*/g, ' ').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || '전자책';
        var old = dl.textContent; dl.textContent = '다운로드 준비 중…';
        fetch(o.downloadUrl).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
          var u = URL.createObjectURL(b), a = document.createElement('a');
          a.href = u; a.download = nm + '.pdf'; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 2000);
          dl.textContent = old;
        }).catch(function () { dl.textContent = old; window.location.href = o.downloadUrl; });
      });
    }
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
