/* ============================================================
   사업자 정보 · 이용약관 · 환불(청약철회) 안내
   - 아래 BIZ 의 빈 칸('')에 실제 정보를 넣고 저장하면, 값이 있는 항목만 홈페이지 맨 아래에 표시됩니다.
   - 약관·환불 문구는 일반적인 전자상거래 안내 초안입니다. 판매 시작 전 전문가(변호사·세무사) 확인을 권합니다.
   ============================================================ */
(function () {
  'use strict';
  var BIZ = {
    name: '인공지능디지털연구소(AIDL)',
    ceo: '최재향',
    bizNo: '',          // 사업자등록번호  예) 123-45-67890
    mailOrderNo: '',    // 통신판매업 신고번호  예) 제2026-충북보은-0000호
    address: '',        // 사업장 주소
    phone: '010-3420-2083',
    email: '80284@naver.com',
    privacyOfficer: '최재향',   // 개인정보 보호책임자
    hosting: 'GitHub Pages · Netlify · Supabase'   // 호스팅 서비스 제공자
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var DOCS = {
    terms: ['이용약관', [
      ['제1조 (목적)', '이 약관은 ' + BIZ.name + '(이하 "회사")가 홈페이지에서 제공하는 전자책·강의자료 등 디지털 상품의 구매와 이용에 관한 회사와 이용자의 권리·의무를 정합니다.'],
      ['제2조 (상품과 가격)', '상품의 이름, 가격, 내용은 각 상품 화면에 표시된 대로 합니다. 가격이나 내용이 바뀌어도 이미 결제가 완료된 주문에는 영향을 주지 않습니다.'],
      ['제3조 (주문과 결제)', '이용자는 상품 화면에서 [구매하기]를 눌러 결제수단을 선택하고 결제합니다. 결제는 결제대행사(토스페이먼츠)를 통해 처리되며, 회사는 카드번호 등 결제정보를 저장하지 않습니다.'],
      ['제4조 (상품 제공)', '결제가 승인되면 결제 완료 화면과 이용자가 입력한 이메일로 다운로드 링크를 제공합니다. 링크에는 유효기간이 있으며, 기간이 지났거나 받지 못한 경우 ' + BIZ.email + ' 으로 연락하시면 다시 안내해 드립니다.'],
      ['제5조 (저작권과 이용 범위)', '상품의 저작권은 저자에게 있습니다. 이용자는 구매한 상품을 개인적인 학습 목적으로만 이용할 수 있으며, 무단 복제·수정·재배포·판매 및 상업적 이용을 할 수 없습니다.'],
      ['제6조 (청약철회와 환불)', '청약철회와 환불은 별도의 "환불·청약철회 안내"를 따릅니다.'],
      ['제7조 (책임의 제한)', '회사는 천재지변, 결제대행사·통신망 장애 등 회사가 통제할 수 없는 사유로 인한 서비스 중단에 책임을 지지 않습니다. 단, 회사의 고의 또는 과실로 인한 손해는 관련 법령에 따라 책임집니다.'],
      ['제8조 (문의)', '구매·환불·이용 관련 문의는 ' + BIZ.email + ' 또는 ' + BIZ.phone + ' 으로 연락해 주세요.']
    ]],
    refund: ['환불·청약철회 안내', [
      ['디지털 상품(전자책 등)의 특성', '전자책·강의자료 같은 디지털 콘텐츠는 다운로드가 시작(제공 개시)되면 상품 가치가 크게 줄어듭니다. 이 때문에 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 제공이 개시된 디지털 콘텐츠는 청약철회가 제한될 수 있습니다. 이 내용은 결제 전에 구매 화면에서도 안내합니다.'],
      ['환불이 가능한 경우', '· 결제는 되었으나 다운로드 링크를 받지 못했고, 문의 후에도 상품을 제공받지 못한 경우\n· 파일이 열리지 않는 등 상품에 결함이 있고 교체로 해결되지 않는 경우\n· 상품 소개와 실제 내용이 현저히 다른 경우\n· 같은 상품이 중복 결제된 경우'],
      ['환불이 어려운 경우', '· 다운로드를 시작했거나 파일을 열람한 뒤 단순 변심으로 취소를 요청하는 경우'],
      ['환불 신청 방법', BIZ.email + ' 로 "주문번호, 구매한 이메일, 사유"를 보내 주세요. 확인 후 영업일 기준 3일 이내에 답변드리고, 환불이 결정되면 결제수단 취소는 결제대행사 처리 기간(통상 3~7영업일)이 걸릴 수 있습니다.']
    ]],
    privacy: ['개인정보 수집·이용 안내 (구매)', [
      ['수집 항목과 목적', '이메일 주소 — 구매한 상품의 다운로드 링크 발송과 주문 확인, 문의 응대. 카드번호 등 결제정보는 결제대행사가 처리하며 회사가 저장하지 않습니다.'],
      ['보유 기간', '전자상거래 등에서의 소비자보호에 관한 법률에 따라 계약·결제·상품 제공 기록은 5년, 소비자 불만·분쟁 처리 기록은 3년간 보관한 뒤 지체 없이 파기합니다.'],
      ['제3자 제공·처리 위탁', '결제 처리(토스페이먼츠), 파일 보관·서버(Supabase), 메일 발송(Resend)에 필요한 범위에서만 처리됩니다. 그 외 제3자에게 제공하지 않습니다.'],
      ['권리와 문의', '이용자는 언제든 열람·정정·삭제를 요청할 수 있습니다. 개인정보 보호책임자: ' + BIZ.privacyOfficer + ' (' + BIZ.email + ')']
    ]]
  };

  function open(key) {
    var d = DOCS[key]; if (!d) return;
    var ov = document.createElement('div'); ov.className = 'pay-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="pay-box wide"><button class="pay-x" type="button" aria-label="닫기">×</button><div class="pay-hd"><h3>' + esc(d[0]) + '</h3></div><div class="pay-detail legal">' +
      d[1].map(function (s) { return '<h4>' + esc(s[0]) + '</h4><p>' + esc(s[1]).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div><button class="btn primary big pay-go" type="button">확인</button></div>';
    document.body.appendChild(ov); document.body.classList.add('pay-open');
    function close() { ov.remove(); if (!document.querySelector('.pay-ov')) document.body.classList.remove('pay-open'); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('pay-x') || e.target.classList.contains('pay-go')) close(); });
  }
  window.AIDLLEGAL = { open: open, BIZ: BIZ };

  function boot() {
    var rows = [['상호', BIZ.name], ['대표', BIZ.ceo], ['사업자등록번호', BIZ.bizNo], ['통신판매업 신고번호', BIZ.mailOrderNo], ['주소', BIZ.address], ['전화', BIZ.phone], ['이메일', BIZ.email], ['개인정보 보호책임자', BIZ.privacyOfficer], ['호스팅 제공', BIZ.hosting]]
      .filter(function (r) { return r[1]; });
    var box = document.getElementById('bizInfo');
    if (box) box.innerHTML = rows.map(function (r) { return '<span>' + esc(r[0]) + ' ' + esc(r[1]) + '</span>'; }).join('');
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-legal]'); if (b) { e.preventDefault(); open(b.getAttribute('data-legal')); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
