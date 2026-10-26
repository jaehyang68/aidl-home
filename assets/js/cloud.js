/* ============================================================
   AIDL 클라우드 연결 (Supabase) — 프로그램·구독자·이미지를 서버에 저장합니다.
   - 아래 URL과 KEY 는 "공개용"입니다. (secret 키는 절대 넣지 마세요)
   - 읽기는 누구나, 쓰기는 관리자 로그인 후에만 가능하도록 Supabase 쪽에서 막아 두었습니다.
   ============================================================ */
(function () {
  'use strict';
  var URL_ = 'https://kdlukljfxjaabkqmeeea.supabase.co';
  var KEY = 'sb_publishable_alnyNx12KxzxMU9BTWWzTg_08TnQqQ3';
  var SK = 'aidl_sb_session', BUCKET = 'program-images';
  var enabled = !!(window.fetch && URL_ && KEY);

  function readSess() { try { return JSON.parse(sessionStorage.getItem(SK) || 'null'); } catch (e) { return null; } }
  function writeSess(s) { try { if (s) sessionStorage.setItem(SK, JSON.stringify(s)); else sessionStorage.removeItem(SK); } catch (e) {} }
  function err(msg, extra) { var e = new Error(msg); if (extra) for (var k in extra) e[k] = extra[k]; return e; }

  function authReq(path, body) {
    return fetch(URL_ + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.access_token) throw err(j.error_description || j.msg || 'auth', { status: r.status }); return j; }); });
  }
  function keep(j) {
    var s = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, email: (j.user && j.user.email) || (readSess() || {}).email || '' };
    writeSess(s); return s;
  }
  function token() {
    var s = readSess(); if (!s) return Promise.reject(err('login', { status: 401 }));
    if (Date.now() < s.exp) return Promise.resolve(s.access);
    return authReq('token?grant_type=refresh_token', { refresh_token: s.refresh }).then(function (j) { return keep(j).access; }).catch(function (e) { writeSess(null); throw err('login', { status: 401 }); });
  }
  function call(method, path, opts) {
    opts = opts || {};
    var h = { apikey: KEY };
    function go(tok) {
      if (tok) h.Authorization = 'Bearer ' + tok;
      if (opts.json !== undefined) h['Content-Type'] = 'application/json';
      if (opts.type) h['Content-Type'] = opts.type;
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(URL_ + path, { method: method, headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body }).then(function (r) {
        if (r.ok) return r.status === 204 ? null : r.text().then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return t; } });
        return r.text().then(function (t) { var j = {}; try { j = JSON.parse(t); } catch (e) {} throw err(j.message || ('HTTP ' + r.status), { status: r.status, code: j.code }); });
      });
    }
    return opts.auth ? token().then(go) : go(null);
  }

  var C = {
    enabled: enabled,
    loggedIn: function () { var s = readSess(); return !!(s && s.refresh); },
    email: function () { return (readSess() || {}).email || ''; },
    login: function (email, pw) { return authReq('token?grant_type=password', { email: email, password: pw }).then(function (j) { keep(j); return true; }); },
    logout: function () { writeSess(null); },

    /* 프로그램: 누구나 읽기 */
    list: function () {
      return call('GET', '/rest/v1/programs?select=id,sort_order,data&order=sort_order.asc').then(function (rows) {
        return (rows || []).map(function (r) { var d = r.data || {}; d.id = r.id; return d; });
      });
    },
    /* 프로그램 전체 저장(관리자) : 추가·수정은 upsert, 목록에서 빠진 것은 삭제 */
    saveAll: function (list) {
      var rows = list.map(function (p, i) { return { id: p.id, sort_order: i, data: p, updated_at: new Date().toISOString() }; });
      var up = rows.length ? call('POST', '/rest/v1/programs?on_conflict=id', { auth: true, json: rows, prefer: 'resolution=merge-duplicates,return=minimal' }) : Promise.resolve();
      return up.then(function () {
        var q = rows.length ? 'id=not.in.(' + rows.map(function (r) { return '"' + String(r.id).replace(/"/g, '') + '"'; }).join(',') + ')' : 'id=neq.__none__';
        return call('DELETE', '/rest/v1/programs?' + q, { auth: true, prefer: 'return=minimal' });
      });
    },
    /* 이미지 업로드(관리자) : data:URL → 공개 주소 */
    upload: function (dataUrl) {
      var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl); if (!m) return Promise.reject(err('format'));
      var bin = atob(m[2]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
      var path = new Date().toISOString().slice(0, 7) + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
      return call('POST', '/storage/v1/object/' + BUCKET + '/' + path, { auth: true, body: arr, type: m[1] }).then(function () { return URL_ + '/storage/v1/object/public/' + BUCKET + '/' + path; });
    },

    /* 문의 통계: 누구나 기록(추가)만 / 집계 보기는 관리자 */
    track: function (rec) {
      try { if (C.loggedIn()) return Promise.resolve(); } catch (e) {}
      return call('POST', '/rest/v1/inquiry_events', { json: { program_id: String(rec.id || 'general').slice(0, 60), program_title: String(rec.title || '').slice(0, 120), kind: rec.kind, place: String(rec.place || '').slice(0, 20) }, prefer: 'return=minimal' }).catch(function () {});
    },
    stats: function () { return call('POST', '/rest/v1/rpc/inquiry_stats', { auth: true, json: {} }); },


    /* 상품·결제: 상품 읽기는 누구나(판매중만) / 등록·수정·삭제·주문내역은 관리자 */
    products: function () { return call('GET', '/rest/v1/products?select=id,title,price,description,detail,image,sort_order,list_price,badge,sale_until,sale_limit&active=eq.true&order=sort_order.asc,created_at.asc'); },
    sold: function () { return call('POST', '/rest/v1/rpc/sold_counts', { json: {} }); },
    allProducts: function () { return call('GET', '/rest/v1/products?select=*&order=sort_order.asc,created_at.asc', { auth: true }); },
    saveProduct: function (p) { p.updated_at = new Date().toISOString(); return call('POST', '/rest/v1/products?on_conflict=id', { auth: true, json: [p], prefer: 'resolution=merge-duplicates,return=minimal' }); },
    delProduct: function (id) { return call('DELETE', '/rest/v1/products?id=eq.' + encodeURIComponent(id), { auth: true, prefer: 'return=minimal' }); },
    orders: function () { return call('GET', '/rest/v1/orders?select=order_id,product_title,amount,status,method,created_at,paid_at&order=created_at.desc&limit=30', { auth: true }); },
    pay: function (body) {
      return fetch(URL_ + '/functions/v1/toss-pay', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw err(j.error || ('HTTP ' + r.status), { status: r.status }); return j; }); });
    },
    uploadEbook: function (file, pid) {
      var ext = (/\.([a-z0-9]{1,6})$/i.exec(file.name) || [0, 'bin'])[1].toLowerCase();
      var path = String(pid).replace(/[^\w-]/g, '') + '/' + Date.now().toString(36) + '.' + ext;
      return call('POST', '/storage/v1/object/ebooks/' + path, { auth: true, body: file, type: file.type || 'application/octet-stream' }).then(function () { return path; });
    },

    /* 구독자: 누구나 신청(추가)만 / 보기·삭제는 관리자 */
    addSub: function (rec) {
      return call('POST', '/rest/v1/subscribers', { json: { name: rec.name, phone: rec.phone, email: rec.email }, prefer: 'return=minimal' })
        .catch(function (e) { if (e.status === 409 || e.code === '23505') e.dup = true; throw e; });
    },
    listSubs: function () { return call('GET', '/rest/v1/subscribers?select=id,name,phone,email,created_at&order=created_at.desc', { auth: true }).then(function (r) { return (r || []).map(function (s) { s.createdAt = s.created_at; return s; }); }); },
    delSub: function (id) { return call('DELETE', '/rest/v1/subscribers?id=eq.' + encodeURIComponent(id), { auth: true, prefer: 'return=minimal' }); }
  };
  window.AIDLC = C;
})();
