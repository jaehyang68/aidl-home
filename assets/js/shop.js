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
  var PI = 'assets/img/programs/';
  var SEED_IMG = {
    'AI 업무혁신 MASTER': [PI + '01-work-master-cover.jpg', 'cover'],
    'AI CONTENT STUDIO': [PI + '02-content-studio-cover.jpg', 'cover'],
    'AI MOVIE STUDIO': [PI + '03-movie-studio-cover.jpg', 'cover'],
    '공공기관 AI 업무혁신': [PI + '04-public-work-cover.jpg', 'cover'],
    '농업인 AI 스마트마케팅': [PI + '05-farmer-marketing-cover.jpg', 'cover'],
    '교직원 생성형 AI': [PI + '06-teacher-ai-cover.jpg', 'cover'],
    '소상공인 AI 콘텐츠 마케팅': [PI + '07-smallbiz-content-cover.jpg', 'cover'],
    '바이브코딩 웹앱 실전교육': [PI + '08-vibe-webapp-cover.jpg', 'cover'],
    'AI 책쓰기·책출판': [PI + '09-book-writing-cover.jpg', 'cover'],
    'AI 자격증 과정': [PI + '10-ai-certificate-cover.jpg', 'cover']
  };
  var SEED_BODY = {"AI 업무혁신 MASTER": "<h2>이런 분께 추천합니다</h2><ul><li>보고서·기획서·회의록 작성에 매번 많은 시간이 드는 공공기관·기업 실무자</li><li>AI를 써 보긴 했지만 우리 업무에 어떻게 적용할지 막막한 분</li><li>부서 전체가 같은 방식으로 AI를 쓰게 하고 싶은 교육 담당자</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>내 업무에 바로 쓰는 프롬프트 세트</li><li>보고서·기획서·회의록 초안 작성 템플릿</li><li>반복 업무를 줄여 주는 자동화 템플릿</li><li>우리 부서 업무에 맞춘 AI 활용 체크리스트</li></ul><h2>이렇게 진행됩니다</h2><p>업무 정의, AI 업무흐름 설계, 결과물 제작, 반복업무 자동화, 성과 확산의 5단계(JH RESULT 5)로 진행합니다. 설명을 듣는 데서 끝나지 않고, 수강생이 자기 업무 자료로 직접 결과물을 만들어 가는 실습형입니다.</p><h2>현장에서는 이렇게 쓰였습니다</h2><p>여수산단 직장인 15명과 함께한 7시간 실습에서 챗GPT 활용부터 보고서·PPT 작성, 홍보영상 제작까지 하루 안에 결과물을 만들었습니다. 반나절 특강부터 종일 실습까지 일정에 맞춰 조정할 수 있습니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관 업무에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 업무와 수강생 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구는 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>우리 기관 업무에 맞춘 제안서가 필요하시면 아래 강의 문의를 남겨 주세요.</b></p>", "AI MOVIE STUDIO": "<h2>이런 분께 추천합니다</h2><ul><li>기관·매장·제품 홍보영상을 직접 만들고 싶은 홍보 담당자</li><li>영상 제작이 처음이라 어디서부터 시작할지 모르는 입문자</li><li>AI로 짧은 영화나 광고영상을 만들어 보고 싶은 분</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>AI 홍보영상 또는 숏폼 1편</li><li>영상 기획안과 장면 구성표</li><li>이미지·영상 생성용 프롬프트 모음</li><li>편집을 마친 영상 파일</li></ul><h2>AI 영화감독이 직접 알려 드립니다</h2><p>강사는 국내외 AI 영화제와 경진대회에서 6차례 수상한 AI 영화감독입니다. 대한민국 AI 영화제 우수상, 제주농산물 AI 홍보 마케팅 활성화 포럼 영상제작대회 우수상, 스킨에픽 AI 광고영상 경진대회 수상, 그리고 Indie Cine Tube Awards·BABUL ECO FILM FESTIVAL·Short Way International Short Film Festival에서 AI Award Winner를 받았습니다.</p><h2>이렇게 진행됩니다</h2><p>기획, 이미지 생성, 영상 생성, 음성·자막, 편집의 순서로 한 편을 직접 완성합니다. 어려운 용어 없이 단계별로 따라 하는 실습 중심이며, 수강 대상과 목적에 맞춰 홍보영상·숏폼·단편 영상 중에서 구성을 정합니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 영상 편집 경험이 없어도 되나요?</b><br>네. 처음 하시는 분도 따라올 수 있도록 단계별로 진행합니다.</p><p><b>Q. 어떤 장비가 필요한가요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>우리 기관의 홍보영상을 함께 만들어 보고 싶으시면 강의 문의를 남겨 주세요.</b></p>", "바이브코딩 웹앱 실전교육": "<h2>이런 분께 추천합니다</h2><ul><li>코딩을 모르지만 내 사업·기관의 웹앱이나 홈페이지를 직접 만들고 싶은 분</li><li>외주 없이 문의폼과 홍보 페이지를 빠르게 갖추고 싶은 사업자</li><li>AI 에이전트 활용법을 실무에 연결하고 싶은 기관 담당자</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>내 사업에 맞는 반응형 웹앱 또는 홈페이지</li><li>문의가 오면 내 이메일로 바로 받는 문의폼</li><li>AI로 만든 홍보영상이 들어간 소개 화면</li><li>누구나 접속하는 배포 주소(링크)</li></ul><h2>이렇게 진행됩니다</h2><ul><li>내 사업에 맞는 카테고리 정하기</li><li>AI로 홍보영상 만들기</li><li>AI 에이전트(Codex·Claude Code)로 반응형 웹앱 제작</li><li>문의폼과 자동 메일 연결</li><li>배포 후 단톡방에 링크 공유</li></ul><h2>바이브코딩이란?</h2><p>코드를 직접 쓰지 않고 AI 에이전트와 대화하며 원하는 화면과 기능을 만들고 고쳐 가는 방식입니다. 이 홈페이지의 3D 로봇과 인터랙션도 같은 방식으로 만들었습니다.</p><h2>현장 사례</h2><p>광주 편한마음힐링센터에서 코딩 없이 하루 만에 웹앱을 완성하는 실전 가이드 교육을 진행했습니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 코딩을 전혀 몰라도 되나요?</b><br>네. 대화로 만드는 방식이라 코딩 지식이 필요하지 않습니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 가입할 도구는 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>내 웹앱을 하루 만에 완성하고 싶으시면 강의 문의를 남겨 주세요.</b></p>", "AI 책쓰기·책출판": "<h2>이런 분께 추천합니다</h2><ul><li>내 경험과 전문 지식을 책으로 남기고 싶은 예비 작가·전문가·강사</li><li>쓰고 싶은 내용은 많은데 목차와 구성에서 막히는 분</li><li>출간 과정이 막막해 로드맵부터 알고 싶은 분</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>내 책의 주제와 독자를 정리한 기획서</li><li>목차(장·절 구성)</li><li>AI와 함께 쓴 원고 초안</li><li>출간까지의 로드맵</li></ul><h2>저서 11권 이상의 경험으로</h2><p>강사는 현장에서 검증한 AI 활용 노하우를 책으로 정리해 왔습니다. 『이것이 AI 리터러시다!』, 『이것이 AI 에이전트·챗봇이다』 등 공저를 포함한 저서가 11권 이상입니다. 내 이야기를 어떻게 책의 구조로 바꾸는지 실제 집필 경험을 바탕으로 알려 드립니다.</p><h2>이렇게 진행됩니다</h2><p>주제와 독자 정하기, 목차 설계, AI와 함께 초안 쓰기, 다듬기와 퇴고, 출간 준비의 순서로 진행합니다. AI가 글을 대신 쓰는 것이 아니라, 내 경험이 중심이 되도록 질문하고 정리하는 방법을 실습합니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 글쓰기 경험이 없어도 되나요?</b><br>네. 목차 설계부터 단계별로 함께 진행합니다.</p><p><b>Q. 출간까지 책임져 주나요?</b><br>출판 절차와 방향을 안내하며, 세부 범위는 상담 시 자세히 알려 드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>내 책의 첫 목차를 함께 만들어 보고 싶으시면 강의 문의를 남겨 주세요.</b></p>", "AI CONTENT STUDIO": "<h2>이런 분께 추천합니다</h2><ul><li>기관·매장의 카드뉴스, 블로그, 숏폼, 홍보영상을 직접 만들어야 하는 홍보·마케팅 담당자</li><li>외주 없이 콘텐츠를 꾸준히 올리고 싶은 소상공인</li><li>AI로 만든 콘텐츠를 일관된 브랜드 느낌으로 이어 가고 싶은 분</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>우리 기관 홍보 콘텐츠 세트(카드뉴스·블로그 글·숏폼 등)</li><li>콘텐츠 기획 틀과 프롬프트 모음</li><li>이미지·영상 제작용 작업 순서표</li></ul><h2>이렇게 진행됩니다</h2><p>콘텐츠 목적과 대상을 정하고, 글과 이미지, 짧은 영상 순으로 직접 만들어 봅니다. 하나의 주제를 여러 형태의 콘텐츠로 확장하는 방법까지 실습해서, 교육이 끝난 뒤에도 혼자 이어 갈 수 있게 구성합니다.</p><h2>현장에서는 이렇게 쓰였습니다</h2><p>여수산단 직장인 교육의 홍보 포스터도 AI로 제작했습니다. 기획부터 이미지 생성, 문구 정리까지 한 흐름으로 만드는 방식을 교육에서 그대로 알려 드립니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관·상황에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 대상과 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>우리 기관 콘텐츠를 직접 만들어 보고 싶으시면 강의 문의를 남겨 주세요.</b></p>", "공공기관 AI 업무혁신": "<h2>이런 분께 추천합니다</h2><ul><li>공문, 보고서, 민원 응대에 시간이 많이 드는 공공기관 공무원·직원</li><li>AI를 업무에 도입하고 싶지만 어디까지 써도 되는지 기준이 필요한 부서</li><li>부서 전체의 AI 활용 수준을 함께 끌어올리고 싶은 교육 담당자</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>부서별 업무 AI 활용 시나리오</li><li>공문·보고서·민원 답변 초안용 프롬프트</li><li>AI 활용 시 주의사항 체크리스트</li></ul><h2>이렇게 진행됩니다</h2><p>기관의 실제 업무 흐름을 기준으로 AI를 적용할 수 있는 지점을 찾고, 수강생이 자기 업무 예시로 직접 결과물을 만들어 봅니다. 개인정보와 내부 자료를 AI에 입력할 때의 주의점도 함께 다루어 안심하고 쓸 수 있게 안내합니다.</p><h2>실습 중심 운영</h2><p>설명을 듣는 데서 끝나지 않고 직접 해 보는 시간이 중심입니다. 반나절 특강부터 종일 실습까지 기관 일정에 맞게 조정할 수 있습니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관·상황에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 대상과 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>우리 기관 업무에 맞춘 교육안이 필요하시면 강의 문의를 남겨 주세요.</b></p>", "농업인 AI 스마트마케팅": "<h2>이런 분께 추천합니다</h2><ul><li>농산물 상세페이지와 SNS 홍보를 직접 하고 싶은 농업인</li><li>농업기술센터에서 교육생에게 실습형 AI 교육을 제공하려는 담당자</li><li>사진 한 장으로 판매 페이지와 홍보영상까지 만들어 보고 싶은 분</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>내 농산물 홍보 이미지</li><li>짧은 홍보영상</li><li>판매용 상세페이지 초안</li><li>SNS에 바로 올릴 홍보 문구</li></ul><h2>이렇게 진행됩니다</h2><p>내 농산물의 장점을 정리하고, 이미지와 문구, 영상 순서로 하나씩 만들어 봅니다. 어려운 용어 없이 따라 할 수 있는 눈높이 실습으로 진행하며, 처음 AI를 접하시는 분도 끝까지 완성할 수 있게 구성합니다.</p><h2>농산물 홍보 영상 수상 경력</h2><p>강사는 2024년 제주농산물 AI 홍보 마케팅 활성화 포럼 영상제작대회에서 우수상을 받았습니다. 농산물 홍보영상 제작 경험을 교육에 담았습니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 중장년·어르신도 따라올 수 있나요?</b><br>네. 눈높이에 맞춰 하나씩 따라 하는 방식으로 진행합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>지역 농업기술센터 교육이나 농가 교육을 계획 중이시면 강의 문의를 남겨 주세요.</b></p>", "교직원 생성형 AI": "<h2>이런 분께 추천합니다</h2><ul><li>수업 자료와 학습지 준비에 시간이 많이 드는 교사·교직원</li><li>학부모 안내문과 행정 업무를 더 빠르게 처리하고 싶은 분</li><li>학교 차원의 생성형 AI 활용 기준을 함께 세우고 싶은 관리자</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>수업용 AI 활용 자료</li><li>학부모 안내문·가정통신문 초안</li><li>행정 업무용 프롬프트 모음</li><li>AI 활용 시 유의사항 체크리스트</li></ul><h2>이렇게 진행됩니다</h2><p>교직원이 매일 하는 업무를 기준으로 AI를 쓰는 방법을 실습합니다. 학생 개인정보를 다룰 때 지켜야 할 점과 AI가 만든 결과를 확인하는 방법을 함께 다루어, 현장에서 안심하고 활용할 수 있도록 안내합니다.</p><h2>실습 중심 운영</h2><p>듣고 끝나는 교육이 아니라, 각자 수업과 업무 자료로 결과물을 만들어 가는 실습형입니다. 교직원 연수 시간과 인원에 맞춰 구성합니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관·상황에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 대상과 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>학교·교육청 연수를 계획 중이시면 강의 문의를 남겨 주세요.</b></p>", "소상공인 AI 콘텐츠 마케팅": "<h2>이런 분께 추천합니다</h2><ul><li>매장과 제품을 홍보할 콘텐츠를 혼자 만들어야 하는 소상공인·자영업자</li><li>외주 비용 없이 사진, 문구, 짧은 영상을 직접 만들고 싶은 분</li><li>SNS에 꾸준히 올릴 소재가 늘 부족한 분</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>매장·제품 홍보 이미지</li><li>홍보 영상 1편</li><li>SNS 게시물 문구와 게시 계획</li><li>콘텐츠 제작 순서표</li></ul><h2>이렇게 진행됩니다</h2><p>내 매장과 제품을 정리한 뒤, 이미지, 문구, 영상 순서로 단계별로 실습합니다. 혼자서도 다시 만들 수 있도록 따라 하기 쉬운 순서로 구성했습니다.</p><h2>혼자서도 이어 가는 힘</h2><p>교육 시간 안에 첫 결과물을 완성하고, 교육 후에도 같은 방법으로 콘텐츠를 계속 만들 수 있도록 프롬프트와 작업 순서를 정리해 드립니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관·상황에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 대상과 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>우리 가게에 맞춘 콘텐츠 교육이 궁금하시면 강의 문의를 남겨 주세요.</b></p>", "AI 자격증 과정": "<h2>이런 분께 추천합니다</h2><ul><li>AI 활용 역량을 공식적으로 증명하고 싶은 분</li><li>AI 강사로 활동하기 위한 역량 인증이 필요한 분</li><li>기관·단체 구성원에게 교육 이수와 자격 인증을 함께 제공하려는 담당자</li></ul><h2>교육을 마치면 남는 결과물</h2><ul><li>교육 이수 후 발급되는 AI 활용 역량 자격증</li><li>실습으로 만든 결과물</li><li>내 분야에 맞춘 AI 활용 계획</li></ul><h2>안내 사항</h2><p>자격의 종류, 발급 절차, 교육 시간, 비용은 대상과 목적에 따라 다르게 운영됩니다. 정확한 내용은 상담 시 자세히 안내드립니다.</p><h2>이렇게 진행됩니다</h2><p>기초 교육과 실습으로 AI 활용 역량을 쌓고, 정해진 절차에 따라 자격 심사와 발급까지 이어집니다. 단체·기관 단위 교육도 문의 가능합니다.</p><h2>자주 묻는 질문</h2><p><b>Q. 우리 기관·상황에 맞게 바꿀 수 있나요?</b><br>네. 사전 상담으로 대상과 수준을 점검한 뒤 커리큘럼을 맞춤 설계합니다.</p><p><b>Q. 무엇을 준비해야 하나요?</b><br>실습용 노트북 또는 PC와 인터넷 환경이 필요하며, 사용할 AI 도구와 가입 방법은 교육 전에 안내드립니다.</p><p><b>Q. 강의료와 일정은요?</b><br>시간·인원·지역에 따라 달라지므로 상담 후 맞춤 견적서를 보내드립니다.</p><p style=\"text-align:center\"><b>자격 과정이 궁금하시면 강의 문의에서 \"AI 자격증\"을 선택해 남겨 주세요.</b></p>"};
  /* 상세 이미지(5장)가 준비된 프로그램은 본문 맨 위에 이미지를 먼저 보여 줍니다 */
  var SEED_DETAIL = { 'AI 업무혁신 MASTER': ['01-work-master', 5], 'AI CONTENT STUDIO': ['02-content-studio', 5], 'AI MOVIE STUDIO': ['03-movie-studio', 5], '공공기관 AI 업무혁신': ['04-public-work', 5], '농업인 AI 스마트마케팅': ['05-farmer-marketing', 5], '교직원 생성형 AI': ['06-teacher-ai', 5], '소상공인 AI 콘텐츠 마케팅': ['07-smallbiz-content', 5], '바이브코딩 웹앱 실전교육': ['08-vibe-webapp', 5], 'AI 책쓰기·책출판': ['09-book-writing', 5], 'AI 자격증 과정': ['10-ai-certificate', 5] };
  Object.keys(SEED_DETAIL).forEach(function (t) {
    var d = SEED_DETAIL[t], h = '';
    for (var n = 1; n <= d[1]; n++) h += '<p><img src="' + PI + d[0] + '-' + n + '.jpg" alt="' + t + ' 상세 안내 ' + n + '" loading="lazy"></p>';
    SEED_BODY[t] = h + (SEED_BODY[t] || '');
  });
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
        bodyHtml: SEED_BODY[title] || '<h2>이런 분께 추천합니다</h2><p>' + esc(target) + '</p><h2>교육을 마치면</h2><p>' + esc(out) + '</p><h2>진행 방식</h2><p>기관의 업무와 수강 대상에 맞춰 반나절 특강부터 종일 실습까지 일정에 맞게 조정합니다. 설명을 듣는 데서 끝나지 않고, 직접 만들어 보는 실습 중심으로 진행합니다.</p>',
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
  /* ---------- 강의안 PDF 보기 / PPT 받기 버튼 (assets/decks/) ---------- */
  var DECKS = {
    'AI 업무혁신 MASTER': '01_AI_Work_Innovation_MASTER', 'AI CONTENT STUDIO': '02_AI_CONTENT_STUDIO', 'AI MOVIE STUDIO': '03_AI_MOVIE_STUDIO',
    '공공기관 AI 업무혁신': '04_Public_Agency_AI', '농업인 AI 스마트마케팅': '05_Farmer_AI_Marketing', '교직원 생성형 AI': '06_Teacher_GenAI',
    '소상공인 AI 콘텐츠 마케팅': '07_SmallBiz_AI_Content', '바이브코딩 웹앱 실전교육': '08_VibeCoding_WebApp', 'AI 책쓰기·책출판': '09_AI_Book_Writing',
    'AI 자격증 과정': '10_AI_Certificate_Course'
  };
  var EYE = '<svg class="i" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var DLI = '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>';
  function deckRow(title) {
    var k = DECKS[title]; if (!k) return '';
    return '<div class="dk-row"><button type="button" class="dk-btn dk-view" data-pdf="assets/decks/pdf/' + k + '.pdf" data-title="' + esc(title) + ' 강의안">' + EYE + '강의안 보기</button>' +
      '<a class="dk-btn dk-dl" href="assets/decks/pptx/' + k + '.pptx" download>' + DLI + 'PPT 받기</a></div>' +
      (k.indexOf('10_') === 0 ? '<a class="dk-link" href="#certs">5개 트랙 · 수료증·자격증 샘플 보기 →</a>' : '');
  }
  function card(p) {
    var c = CATS[p.category] || CATS.cus, href = '#/program/' + encodeURIComponent(p.id);
    var rows = '<dt>대상</dt><dd>' + esc(p.target || '-') + '</dd>';
    var second = p.output || p.duration;
    if (second) rows += '<dt>' + esc(p.outputLabel || (p.output ? '산출물' : '시간')) + '</dt><dd>' + esc(p.output || p.duration) + '</dd>';
    return '<article class="card hov prog' + (p.category === 'sig' ? ' sig' : '') + '" data-g="' + esc(p.category) + '" data-id="' + esc(p.id) + '">' +
      thumb(p) +
      '<div class="top"><span class="ic"><svg class="i"><use href="#' + esc(p.icon || c.icon) + '"/></svg></span><span class="tag' + (p.category === 'cus' ? ' b' : (p.category === 'pub' || p.category === 'cert' || p.category === 'free') ? ' g' : '') + '">' + esc(c.tag) + '</span></div>' +
      '<h3><a href="' + href + '">' + esc(p.title) + '</a></h3><p class="one">' + esc(p.summary) + '</p><dl>' + rows + '</dl>' + deckRow(p.title) +
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

  /* ---------- 문의 통계 기록 (방문자 → 서버, 이름·연락처 등 개인정보는 보내지 않음) ---------- */
  var seenTrack = {};
  function trackEv(p, kind, place) {
    var C = window.AIDLC; if (!C || !C.enabled || !C.track) return;
    var id = p ? p.id : 'general', key = id + '|' + kind + '|' + (place || '');
    var now = Date.now(); if (seenTrack[key] && now - seenTrack[key] < 2500) return; seenTrack[key] = now;
    if (kind === 'view') { try { if (sessionStorage.getItem('aidl_v_' + id)) return; sessionStorage.setItem('aidl_v_' + id, '1'); } catch (e) {} }
    C.track({ id: id, title: p ? p.title : '(일반 문의)', kind: kind, place: place || '' });
  }
  function progByCourse(name) { return getPrograms().filter(function (x) { return (x.course || x.title) === name || x.title === name; })[0] || null; }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-pdc]');
    if (a) { var place = a.closest('.pd-bar') ? 'bar' : a.closest('.pd-cta2') ? 'end' : a.closest('.pd-end') ? 'foot' : 'top'; trackEv(progByCourse(a.getAttribute('data-pdc')), 'inquiry', place); return; }
    var k = e.target.closest('#pdetail a.kakao'); if (k) { var pd = $('#pdetail'); trackEv(curDetail, 'kakao', k.closest('.pd-bar') ? 'bar' : k.closest('.pd-cta2') ? 'end' : 'top'); return; }
    var t = e.target.closest('[data-course]'); if (t && !t.closest('#pdetail')) trackEv(progByCourse(t.getAttribute('data-course')), 'inquiry', 'card');
  });
  document.addEventListener('aidl:sent', function (e) {
    var l = (e.detail && e.detail.courses) || [], any = false;
    l.forEach(function (n) { var p = progByCourse(n); if (p) { any = true; trackEv(p, 'submit', 'form'); } });
    if (!any) trackEv(null, 'submit', 'form');
  });

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
  var baseTitle = document.title, detailOpen = false, curDetail = null;
  function ensureDetail() {
    var d = $('#pdetail'); if (d) return d;
    d = document.createElement('div'); d.id = 'pdetail'; d.className = 'pd'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '프로그램 상세');
    document.body.appendChild(d); return d;
  }
  function openDetail(id) {
    var p = getPrograms().filter(function (x) { return x.id === id; })[0], d = ensureDetail();
    curDetail = p || null; if (p) trackEv(p, 'view', 'detail');
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
        '<section class="pd-cta2"><b>우리 기관·매장에 맞춘 교육안이 필요하신가요?</b><span>내용을 남겨 주시면 대상·시간·인원에 맞춰 상담 후 맞춤 견적서를 보내드립니다.</span>' +
        '<div class="pd-cta"><a class="btn primary big" href="#contact" data-pdc="' + esc(p.course || p.title) + '">이 프로그램 강의 문의하기 →</a>' +
        '<a class="btn kakao big" href="http://pf.kakao.com/_xcXRTX/chat" target="_blank" rel="noopener"><svg class="i"><use href="#i-chat"/></svg>카카오톡으로 바로 상담</a></div></section>' +
        '<div class="pd-end"><a class="btn sm" href="#programs">← 다른 프로그램 보기</a><a class="btn primary" href="#contact" data-pdc="' + esc(p.course || p.title) + '">강의 문의하기</a></div>' +
        '<div class="pd-bar" role="region" aria-label="강의 문의"><span class="pd-bar-t">' + esc(p.title) + '</span><a class="btn primary pulse" href="#contact" data-pdc="' + esc(p.course || p.title) + '">강의 문의하기</a>' +
        '<a class="btn kakao" href="http://pf.kakao.com/_xcXRTX/chat" target="_blank" rel="noopener">카톡 상담</a></div></div>';
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
  /* 대표 교육 배너의 카드 → 해당 프로그램 상세페이지 (제목에 키워드가 들어 있는 프로그램을 찾아 이동) */
  document.addEventListener('click', function (e) {
    var h = e.target.closest('.sc-multi .hit'); if (!h) return;
    e.preventDefault();
    var k = (h.getAttribute('data-pk') || '').toLowerCase();
    var p = getPrograms().filter(function (x) { return String(x.title).toLowerCase().indexOf(k) >= 0; })[0];
    location.hash = p ? '#/program/' + encodeURIComponent(p.id) : '#programs';
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
