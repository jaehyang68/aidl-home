/* ============================================================
   AIDL 관리자 대시보드 (PIN 확인 후에만 불러옵니다)
   - 프로그램 등록·수정·삭제 / 이미지 자동 압축 / 블로그형 에디터
   - 뉴스레터 구독자 표 / 백업(JSON)·가져오기
   ============================================================ */
(function () {
  'use strict';
  var A = window.AIDL, esc = A.esc, CATS = A.CATS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = null, tab = 'prog', q = '', CL = A.cloud, cloudSubs = null;
  function loadCloudSubs() { return; if (!CL) return; CL.listSubs().then(function (l) { cloudSubs = l; if (root && !root.hidden) draw(); }).catch(function (e) { if (e && e.status === 401) { CL.logout(); toast('로그인이 만료되었어요. 다시 로그인해 주세요.', true); closeAdmin(); } }); }
  function saveFail(r) { toast(r && r.login ? '로그인이 만료되었어요. 홈에서 다시 로그인해 주세요.' : '저장에 실패했어요. 인터넷 연결과 이미지 크기를 확인해 주세요.', true); }

  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB'; }
  function fmt(d) { try { var t = new Date(d); return t.getFullYear() + '.' + ('0' + (t.getMonth() + 1)).slice(-2) + '.' + ('0' + t.getDate()).slice(-2) + ' ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2); } catch (e) { return ''; } }
  function toast(msg, bad) {
    var t = document.createElement('div'); t.className = 'ad-toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.classList.add('on'); }, 10); setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 300); }, 2800);
  }

  /* ---------- 이미지 자동 압축 엔진 (Canvas) ---------- */
  var MAX_SIDE = 800, MAX_BYTES = 10 * 1024 * 1024, TARGET = 120 * 1024;
  /* mode 'body' : 상세 본문 이미지(가로 1200px까지, 세로로 긴 이미지도 선명하게)  /  기본 : 대표 이미지(긴 변 800px) */
  function compress(file, mode) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return reject(new Error('JPG, PNG, WEBP 이미지만 올릴 수 있어요.'));
      if (file.size > MAX_BYTES) return reject(new Error('이미지는 10MB 이하만 올릴 수 있어요.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, body = mode === 'body';
        var k = body ? Math.min(1, 1200 / w, 4000 / h) : Math.min(1, MAX_SIDE / Math.max(w, h)), target = body ? 380 * 1024 : TARGET, floor = body ? 0.62 : 0.5;
        var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var qlt = 0.72, out = c.toDataURL('image/jpeg', qlt);
        while (out.length * 0.75 > target && qlt > floor) { qlt -= 0.1; out = c.toDataURL('image/jpeg', qlt); }
        resolve({ dataUrl: out, before: file.size, after: Math.round(out.length * 0.75), w: cw, h: ch });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요. 다른 파일로 시도해 주세요.')); };
      img.src = url;
    });
  }

  /* ---------- 화면 뼈대 ---------- */
  function openAdmin() {
    if (root) { root.hidden = false; document.body.classList.add('ad-open'); draw(); loadCloudSubs(); return; }
    root = document.createElement('div'); root.id = 'adminRoot'; root.className = 'ad';
    document.body.appendChild(root); document.body.classList.add('ad-open'); draw(); loadCloudSubs();
  }
  function closeAdmin() {
    if (root) root.hidden = true; document.body.classList.remove('ad-open');
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
    A.refresh();
  }
  function draw() {
    var subs = CL ? (cloudSubs || []) : A.subs();
    root.innerHTML =
      '<div class="ad-bar"><b>🛠 관리자 모드</b>' + (CL ? '<span class="ad-note">☁ 클라우드에 연결됨 · 저장하면 <u>모든 방문자</u>에게 바로 보입니다. (' + esc(CL.email()) + ')</span><button class="btn sm" type="button" id="adOut">로그아웃</button>' : '<span class="ad-note">여기서 바꾼 내용은 <u>이 브라우저</u>에 저장됩니다. 모든 방문자에게 보이려면 [백업·가져오기]에서 내려받은 파일을 올려 주세요.</span>') + '<button class="btn sm yellow" type="button" id="adHome">홈 화면으로 돌아가기</button></div>' +
      '<div class="ad-in"><div class="ad-tabs" role="tablist">' +
      tabBtn('prog', '프로그램 관리 (' + A.getPrograms().length + ')') + tabBtn('bak', '백업·가져오기') + '</div>' +
      '<div id="adBody"></div></div>';
    $('#adHome', root).onclick = closeAdmin;
    var ao = $('#adOut', root); if (ao) ao.onclick = function () { CL.logout(); cloudSubs = null; closeAdmin(); toast('로그아웃했어요.'); };
    $$('.ad-tabs button', root).forEach(function (b) { b.onclick = function () { tab = b.dataset.t; draw(); }; });
    if (tab === 'prog') drawProg(); else if (tab === 'subs') drawSubs(); else drawBak();
  }
  function tabBtn(t, label) { return '<button type="button" role="tab" data-t="' + t + '" aria-selected="' + (tab === t) + '">' + label + '</button>'; }

  /* ---------- 프로그램 관리 표 ---------- */
  function drawProg() {
    var list = A.getPrograms(), src = A.source();
    var srcMsg = src === 'cloud' ? '☁ 클라우드에 저장된 목록이에요. 저장·삭제하면 모든 방문자 화면에 바로 반영됩니다.' : (CL ? '아직 클라우드에 올리지 않은 기본 프로그램이에요. [목록 클라우드에 올리기]를 누르면 지금 목록이 모든 방문자에게 보입니다.' : (src === 'local' ? '이 브라우저에 저장된 목록을 쓰고 있어요.' : (src === 'published' ? '올려 둔 programs.json 을 보고 있어요. 수정하면 이 브라우저에만 저장됩니다.' : '기본(시작) 프로그램을 보고 있어요. 수정·등록하면 이 브라우저에 저장됩니다.')));
    var rows = list.map(function (p, i) {
      var th = A.safeSrc(p.image) ? '<img src="' + esc(p.image) + '" alt="">' : '<span class="ad-noimg">없음</span>';
      return '<tr><td class="ad-th">' + th + '</td><td>' + esc((CATS[p.category] || {}).label || p.category) + '</td><td><b>' + esc(p.title) + '</b><br><small>' + esc(p.summary) + '</small></td><td>' + fmt(p.updatedAt || p.createdAt) + '</td>' +
        '<td class="ad-act"><button type="button" data-up="' + i + '" aria-label="위로" ' + (i === 0 ? 'disabled' : '') + '>▲</button><button type="button" data-dn="' + i + '" aria-label="아래로" ' + (i === list.length - 1 ? 'disabled' : '') + '>▼</button>' +
        '<button type="button" data-ed="' + i + '" aria-label="수정">✏️ 수정</button><button type="button" class="del" data-rm="' + i + '" aria-label="삭제">🗑 삭제</button></td></tr>';
    }).join('');
    $('#adBody', root).innerHTML = '<div class="ad-head"><div><h2>프로그램 관리</h2><p>' + srcMsg + '</p></div><div class="ad-hbtn">' + (CL && src !== 'cloud' ? '<button class="btn" type="button" id="adUp">목록 클라우드에 올리기</button>' : '') + '<button class="btn primary" type="button" id="adNew">+ 새 프로그램 등록</button></div></div>' +
      '<div class="ad-tw"><table class="ad-t"><thead><tr><th>이미지</th><th>분류</th><th>프로그램</th><th>수정일</th><th>관리</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="ad-empty">등록된 프로그램이 없습니다.</td></tr>') + '</tbody></table></div>';
    $('#adNew', root).onclick = function () { editor(null); };
    var au = $('#adUp', root); if (au) au.onclick = function () { au.disabled = true; au.textContent = '올리는 중…'; A.savePrograms(A.getPrograms()).then(function (r) { if (r.ok) toast('클라우드에 올렸어요. 이제 모든 방문자에게 보입니다.'); else saveFail(r); draw(); }); };
    $('#adBody', root).onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var l = A.getPrograms(), d = b.dataset;
      if (d.ed != null) return editor(l[+d.ed]);
      if (d.rm != null) { if (!confirm('"' + l[+d.rm].title + '" 프로그램을 삭제할까요?')) return; l.splice(+d.rm, 1); return A.savePrograms(l).then(function (r) { if (!r.ok) saveFail(r); else toast('삭제했어요.'); draw(); }); }
      if (d.up != null || d.dn != null) { var i = +(d.up != null ? d.up : d.dn), j = d.up != null ? i - 1 : i + 1; var t = l[i]; l[i] = l[j]; l[j] = t; A.savePrograms(l).then(function (r) { if (!r.ok) saveFail(r); draw(); }); }
    };
  }

  /* ---------- 등록·수정 전체화면 모달 + 블로그형 에디터 ---------- */
  function editor(p) {
    var isNew = !p; p = p || { id: A.uid(), category: 'cus', title: '', summary: '', target: '', output: '', outputLabel: '산출물', duration: '', image: '', imageFit: 'contain', bodyHtml: '', course: '' };
    var m = document.createElement('div'); m.className = 'ad-full'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    var opts = Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (p.category === k ? ' selected' : '') + '>' + CATS[k].label + '</option>'; }).join('');
    m.innerHTML = '<div class="ad-full-in"><div class="ad-full-bar"><h2>' + (isNew ? '새 프로그램 등록' : '프로그램 수정') + '</h2><div><button class="btn sm" type="button" id="edCancel">취소</button> <button class="btn sm primary" type="button" id="edSave">저장하기</button></div></div>' +
      '<div class="ad-form">' +
      '<div class="ad-g2"><label>분류<select id="fCat">' + opts + '</select></label><label>제목 *<input id="fTitle" maxlength="60" value="' + esc(p.title) + '" placeholder="예) AI 업무혁신 MASTER"></label></div>' +
      '<label>한 줄 요약 *<input id="fSum" maxlength="100" value="' + esc(p.summary) + '" placeholder="카드에 보이는 한 줄 설명"></label>' +
      '<div class="ad-g3"><label>대상<input id="fTarget" value="' + esc(p.target) + '" placeholder="공공기관 실무자"></label><label>시간<input id="fDur" value="' + esc(p.duration) + '" placeholder="예) 3시간 / 하루 7시간"></label><label>산출물·안내<input id="fOut" value="' + esc(p.output) + '" placeholder="교육 후 남는 결과물"></label></div>' +
      '<div class="ad-box"><div class="ad-lbl">대표 이미지 (카드·상세 상단 1:1 정사각)</div>' +
      '<div class="ad-itabs"><button type="button" data-it="file" aria-selected="true">파일 업로드</button><button type="button" data-it="url" aria-selected="false">웹 링크 입력</button></div>' +
      '<div id="itFile"><div class="ad-drop" id="fDrop" tabindex="0" role="button" aria-label="이미지 파일 선택"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5 4.5 4.5 0 0 1 17.5 18H7z"/><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5"/></svg><b>여기로 끌어다 놓거나 클릭해서 선택</b><small>JPG·PNG·WEBP, 10MB 이하 · 자동으로 압축됩니다</small></div><input type="file" id="fFile" accept="image/jpeg,image/png,image/webp" hidden></div>' +
      '<div id="itUrl" hidden><div class="ad-url"><input id="fUrl" placeholder="https://… 로 시작하는 이미지 주소"><button class="btn sm" type="button" id="fUrlBtn">불러오기</button></div></div>' +
      '<div class="ad-prev" id="fPrev"></div>' +
      '<div class="ad-fit">표시 방식: <label><input type="radio" name="fit" value="contain"' + (p.imageFit !== 'cover' ? ' checked' : '') + '> 전체 보이기(글자·포스터 추천)</label> <label><input type="radio" name="fit" value="cover"' + (p.imageFit === 'cover' ? ' checked' : '') + '> 꽉 채우기(사진 추천)</label></div></div>' +
      '<div class="ad-lbl">상세 내용 (블로그처럼 작성)</div>' +
      '<div class="ad-ed"><div class="ad-tool" id="edTool">' +
      '<select id="tSize" aria-label="글자 크기"><option value="">Tt 글자 크기</option><option value="h2">제목 1</option><option value="h3">제목 2</option><option value="p">본문</option></select><i></i>' +
      '<button type="button" data-c="justifyLeft" title="왼쪽 정렬" aria-label="왼쪽 정렬">⬅︎</button><button type="button" data-c="justifyCenter" title="가운데 정렬" aria-label="가운데 정렬">↔︎</button><button type="button" data-c="justifyRight" title="오른쪽 정렬" aria-label="오른쪽 정렬">➡︎</button><i></i>' +
      '<button type="button" class="hl y" data-h="#FFF3A3" title="노란 형광펜" aria-label="노란 형광펜">형광펜</button><button type="button" class="hl g" data-h="#C9F2D6" title="초록 형광펜" aria-label="초록 형광펜">형광펜</button><button type="button" data-h="transparent" title="형광펜 지우기" aria-label="형광펜 지우기">✕</button><i></i>' +
      '<button type="button" id="tImg" title="이미지 넣기" aria-label="이미지 넣기">📷 이미지</button><input type="file" id="tFile" accept="image/jpeg,image/png,image/webp" hidden multiple></div>' +
      '<div class="ad-body pbody" id="edBody" contenteditable="true" role="textbox" aria-multiline="true" aria-label="상세 내용"></div></div>' +
      '<p class="ad-err" id="edErr" role="alert"></p></div></div>';
    document.body.appendChild(m); document.body.classList.add('ad-modal-open');
    var img = { src: A.safeSrc(p.image), info: '' }, body = $('#edBody', m);
    body.innerHTML = A.sanitize(p.bodyHtml) || '<p><br></p>';
    function prev() {
      $('#fPrev', m).innerHTML = img.src ? '<div class="ad-pv"><img src="' + esc(img.src) + '" alt="미리보기"><div><small>' + esc(img.info) + '</small><button type="button" class="del" id="fDel">🗑 삭제</button></div></div>' : '';
      var d = $('#fDel', m); if (d) d.onclick = function () { img.src = ''; img.info = ''; prev(); };
    }
    prev();
    function setImgFile(file) {
      compress(file).then(function (r) { img.src = r.dataUrl; img.info = (kb(r.before) + ' → ' + kb(r.after) + ' · ' + r.w + '×' + r.h); prev(); }).catch(function (e) { toast(e.message, true); });
    }
    var drop = $('#fDrop', m), ff = $('#fFile', m);
    drop.onclick = function () { ff.click(); }; drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ff.click(); } };
    ff.onchange = function () { if (ff.files[0]) setImgFile(ff.files[0]); ff.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('on'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) setImgFile(f); });
    $$('.ad-itabs button', m).forEach(function (b) { b.onclick = function () { $$('.ad-itabs button', m).forEach(function (x) { x.setAttribute('aria-selected', x === b); }); $('#itFile', m).hidden = b.dataset.it !== 'file'; $('#itUrl', m).hidden = b.dataset.it !== 'url'; }; });
    $('#fUrlBtn', m).onclick = function () {
      var u = $('#fUrl', m).value.trim(); if (!/^https:\/\//i.test(u)) return toast('https:// 로 시작하는 주소를 넣어 주세요.', true);
      var t = new Image(); t.onload = function () { img.src = u; img.info = '웹 링크 이미지'; prev(); }; t.onerror = function () { toast('이미지를 불러오지 못했어요. 주소를 확인해 주세요.', true); }; t.src = u;
    };

    /* 에디터 툴바 */
    var saved = null;
    function saveSel() { var s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); }
    function restore() { body.focus(); if (saved) { var s = getSelection(); s.removeAllRanges(); s.addRange(saved); } }
    ['keyup', 'mouseup', 'input', 'blur'].forEach(function (ev) { body.addEventListener(ev, saveSel); });
    $('#edTool', m).addEventListener('mousedown', function (e) { if (!e.target.closest('select,input')) e.preventDefault(); });
    $('#edTool', m).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'tImg') { $('#tFile', m).click(); return; }
      restore();
      if (b.dataset.c) document.execCommand(b.dataset.c, false, null);
      if (b.dataset.h) { if (!document.execCommand('hiliteColor', false, b.dataset.h)) document.execCommand('backColor', false, b.dataset.h); }
      saveSel();
    });
    $('#tSize', m).onchange = function (e) { var v = e.target.value; e.target.value = ''; if (!v) return; restore(); document.execCommand('formatBlock', false, v); saveSel(); };
    function insertImages(files) {
      var arr = [].slice.call(files); (function next() {
        var f = arr.shift(); if (!f) return;
        compress(f, 'body').then(function (r) { restore(); document.execCommand('insertHTML', false, '<p style="text-align:center"><img src="' + r.dataUrl + '" alt=""></p><p><br></p>'); saveSel(); }).catch(function (e) { toast(e.message, true); }).then(next);
      })();
    }
    $('#tFile', m).onchange = function (e) { insertImages(e.target.files); e.target.value = ''; };
    body.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, 'Files') >= 0) e.preventDefault(); });
    body.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); insertImages(e.dataTransfer.files); } });
    body.addEventListener('paste', function (e) {   // 붙여넣기는 글자만(서식·악성 코드 차단), 이미지 파일은 압축 삽입
      var cd = e.clipboardData; if (!cd) return;
      if (cd.files && cd.files.length) { e.preventDefault(); insertImages(cd.files); return; }
      e.preventDefault(); document.execCommand('insertText', false, cd.getData('text/plain'));
    });

    function close() { m.remove(); document.body.classList.remove('ad-modal-open'); }
    $('#edCancel', m).onclick = function () { if (confirm('작성 중인 내용이 사라집니다. 닫을까요?')) close(); };
    $('#edSave', m).onclick = function () {
      var err = $('#edErr', m), title = $('#fTitle', m).value.trim(), sum = $('#fSum', m).value.trim();
      if (!title) { err.textContent = '제목을 입력해 주세요.'; $('#fTitle', m).focus(); return; }
      if (!sum) { err.textContent = '한 줄 요약을 입력해 주세요.'; $('#fSum', m).focus(); return; }
      var now = new Date().toISOString(), out = $('#fOut', m).value.trim();
      var np = {
        id: p.id, category: $('#fCat', m).value, title: title, summary: sum, target: $('#fTarget', m).value.trim(), duration: $('#fDur', m).value.trim(),
        output: out, outputLabel: p.outputLabel || '산출물', icon: p.icon || '', course: p.course || title, image: img.src, imageFit: ($('input[name=fit]:checked', m) || {}).value || 'contain',
        bodyHtml: A.sanitize(body.innerHTML), createdAt: p.createdAt || now, updatedAt: now
      };
      var l = A.getPrograms(), i = l.map(function (x) { return x.id; }).indexOf(p.id);
      if (i >= 0) l[i] = np; else l.push(np);
      var sb = $('#edSave', m); sb.disabled = true; sb.textContent = CL ? '올리는 중…' : '저장 중…'; err.textContent = '';
      A.savePrograms(l).then(function (r) {
        sb.disabled = false; sb.textContent = '저장하기';
        if (!r.ok) { err.textContent = r.login ? '로그인이 만료되었어요. 편집 내용을 복사해 두고 홈에서 다시 로그인해 주세요.' : (CL ? '저장에 실패했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.' : '저장 공간이 부족합니다. 이미지를 줄이거나, [백업·가져오기]에서 내려받은 뒤 오래된 프로그램을 삭제해 주세요.'); return; }
        close(); toast(isNew ? '등록했어요. 홈 화면에 바로 진열됩니다.' : '수정했어요.'); draw();
      });
    };
    $('#fTitle', m).focus();
  }

  /* ---------- 구독자 표 ---------- */
  function drawSubs() {
    var all = CL ? (cloudSubs || []) : A.subs(), l = all.filter(function (s) { var t = (s.name + s.phone + s.email).toLowerCase(); return !q || t.indexOf(q.toLowerCase()) >= 0; });
    var rows = l.map(function (s) {
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.phone) + '</td><td>' + esc(s.email) + '</td><td>' + fmt(s.createdAt) + '</td><td class="ad-act"><button type="button" class="del" data-id="' + esc(s.id) + '">🗑 삭제</button></td></tr>';
    }).join('');
    $('#adBody', root).innerHTML = '<div class="ad-head"><div><h2>뉴스레터 구독자 (' + all.length + '명)</h2><p>' + (CL ? (cloudSubs ? '☁ 클라우드에 모인 모든 구독자예요. 신청 알림은 80284@naver.com 메일로도 도착합니다.' : '불러오는 중…') : '이 브라우저에 신청된 구독자만 보입니다. 다른 사람의 브라우저에서 신청한 내용은 <b>80284@naver.com 메일</b>로 도착합니다.') + '</p></div><div class="ad-hbtn"><input id="adQ" type="search" placeholder="이름·전화·이메일 검색" value="' + esc(q) + '"><button class="btn sm" type="button" id="adCsv">CSV 내려받기</button></div></div>' +
      '<div class="ad-tw"><table class="ad-t"><thead><tr><th>이름</th><th>전화번호</th><th>이메일</th><th>신청일시</th><th>관리</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="ad-empty">구독자가 없습니다.</td></tr>') + '</tbody></table></div>';
    $('#adQ', root).oninput = function (e) { q = e.target.value; var pos = e.target.selectionStart; drawSubs(); var n = $('#adQ', root); n.focus(); n.setSelectionRange(pos, pos); };
    $('#adCsv', root).onclick = function () {
      var csv = '﻿이름,전화번호,이메일,신청일시\r\n' + all.map(function (s) { return [s.name, s.phone, s.email, fmt(s.createdAt)].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
      download('aidl-subscribers-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
    };
    $('#adBody', root).onclick = function (e) { var b = e.target.closest('[data-id]'); if (!b) return; if (!confirm('이 구독자를 삭제할까요?')) return;
      if (CL) { CL.delSub(b.dataset.id).then(function () { cloudSubs = cloudSubs.filter(function (s) { return s.id !== b.dataset.id; }); toast('삭제했어요.'); draw(); }).catch(function () { toast('삭제에 실패했어요.', true); }); return; }
      A.saveSubs(A.subs().filter(function (s) { return s.id !== b.dataset.id; })); toast('삭제했어요.'); draw(); };
  }

  /* ---------- 백업·가져오기 ---------- */
  function download(name, text, type) {
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: type })); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function drawBak() {
    var u = A.usage(), pct = Math.min(100, Math.round(u / (5 * 1024 * 1024) * 100));
    $('#adBody', root).innerHTML = '<div class="ad-head"><div><h2>백업·가져오기</h2><p>모든 방문자에게 보이게 하는 방법: ① [프로그램 내보내기] → ② 내려받은 파일 이름을 <b>programs.json</b>으로 → ③ GitHub의 <b>assets/data</b> 폴더에 올리기(덮어쓰기).</p></div></div>' +
      '<div class="ad-cards"><div class="ad-card"><h3>저장 공간</h3><div class="ad-meter"><i style="width:' + pct + '%"></i></div><p>' + kb(u) + ' 사용 중 (약 5MB 중 ' + pct + '%)</p></div>' +
      '<div class="ad-card"><h3>프로그램</h3><button class="btn primary" type="button" id="bkExp">프로그램 내보내기 (programs.json)</button><label class="btn" style="margin-top:10px">프로그램 가져오기<input type="file" id="bkImp" accept="application/json,.json" hidden></label>' + (CL ? '' : '<button class="btn sm" type="button" id="bkReset" style="margin-top:10px">기본 프로그램으로 되돌리기</button>') + '</div>' +
      '<div class="ad-card"><h3>구독자</h3><button class="btn" type="button" id="bkSub">구독자 JSON 내려받기</button><p style="margin-top:8px">엑셀용은 [뉴스레터 구독자] 탭의 CSV를 쓰세요.</p></div>' +
      '' + (CL ? '<div class="ad-card"><h3>클라우드</h3><p>프로그램·이미지·구독자가 Supabase에 저장되고 있어요. 이 파일 내보내기는 <b>백업용</b>이에요. 비밀번호 변경은 Supabase 대시보드의 Authentication → Users에서 합니다.</p></div>' : '<div class="ad-card"><h3>관리자 PIN</h3><button class="btn sm" type="button" id="bkPin">PIN 다시 설정하기</button><p style="margin-top:8px">누르면 현재 PIN이 지워지고, 다음에 들어갈 때 새로 정합니다.</p></div>') + '</div>';
    $('#bkExp', root).onclick = function () { download('programs.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), programs: A.getPrograms() }, null, 1), 'application/json'); toast('programs.json 을 내려받았어요.'); };
    $('#bkImp', root).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () {
        try { var j = JSON.parse(r.result); if (!j || !Array.isArray(j.programs)) throw 0;
          var ok = j.programs.every(function (p) { return p && p.id && p.title; }); if (!ok) throw 0;
          if (!confirm('프로그램 ' + j.programs.length + '개를 가져와 현재 목록을 바꿀까요?')) return;
          A.savePrograms(j.programs.map(function (p) { p.bodyHtml = A.sanitize(p.bodyHtml); p.image = A.safeSrc(p.image); return p; })).then(function (res) { if (res.ok) toast('가져왔어요.'); else saveFail(res); draw(); });
        } catch (x) { toast('올바른 programs.json 파일이 아니에요.', true); }
      };
      r.readAsText(f);
    };
    var br = $('#bkReset', root); if (br) br.onclick = function () { if (!confirm('이 브라우저에 저장한 프로그램을 지우고 기본 목록으로 되돌릴까요? (구독자는 그대로)')) return; try { localStorage.removeItem(A.KEYS.programs); } catch (x) {} location.reload(); };
    $('#bkSub', root).onclick = function () { download('subscribers.json', JSON.stringify(CL ? (cloudSubs || []) : A.subs(), null, 1), 'application/json'); };
    var bp = $('#bkPin', root); if (bp) bp.onclick = function () { if (!confirm('PIN을 지우고 새로 정할까요?')) return; try { localStorage.removeItem(A.KEYS.pin); sessionStorage.removeItem('aidl_admin_ok'); } catch (x) {} closeAdmin(); toast('PIN을 지웠어요. 다음에 들어갈 때 새로 정합니다.'); };
  }

  A.openAdmin = openAdmin;
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && root && !root.hidden && !$('.ad-full')) closeAdmin(); });
})();
