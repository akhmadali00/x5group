// Ilovani ishga tushirish: sessiya -> (Admin yaratish | kirish | 2-bosqich | ma'lumot yuklash).
(function () {
  var X5 = (window.X5 = { state: 'loading', me: null });
  var $ = function (id) { return document.getElementById(id); };

  X5.api = function (method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-X5': '1' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'Xatolik yuz berdi');
          err.status = res.status;
          if (res.status === 401 && X5.state === 'ok') { X5.start(); }
          throw err;
        }
        return data;
      });
    });
  };

  X5.reload = function () {
    return X5.api('GET', '/api/data').then(function (d) {
      window.X5app.setMe(d.me.name);
      window.X5app.setArchived(d.archived || {});
      window.dash.setData(d.datasets);
    });
  };

  // O'zgartiruvchi so'rov: muvaffaqiyatda ma'lumotni qayta yuklaydi, xatoda xabar ko'rsatadi
  X5.mutate = function (method, url, body, okText) {
    return X5.api(method, url, body).then(function (r) {
      return X5.reload().then(function () {
        if (okText) window.X5app.toast(okText);
        return r;
      });
    }, function (e) {
      window.X5app.toast(e.message || 'Xatolik');
      throw e;
    });
  };

  var show = function (id) { window.X5app.showPage(id, false); };
  var err = function (id, msg) { var n = $(id); if (!n) return; n.hidden = !msg; n.textContent = msg || ''; };
  var busy = function (btn, on) { if (btn) btn.disabled = !!on; };

  X5.start = function () {
    return X5.api('GET', '/api/session').then(function (s) {
      X5.state = s.state;
      X5.me = s.me || null;
      if (s.state === 'ok') {
        return X5.reload().then(function () {
          var a = window.X5app;
          var cur = a.currentPage();
          if (cur === 'kirish' || cur === 'boshlash' || cur === 'mfa') a.showPage(a.firstPage(), true);
        });
      }
      window.dash.reset();
      show(s.state === 'setup' ? 'boshlash' : s.state === 'mfa' ? 'mfa' : 'kirish');
    }).catch(function () { window.dash.setFailed(); });
  };

  X5.doSetup = function () {
    var nm = $('setup-name').value.trim(), em = $('setup-email').value.trim(), pw = $('setup-pass').value, pw2 = $('setup-pass2').value;
    var msg = !nm ? 'Ismingizni kiriting' : !/^\S+@\S+\.\S+$/.test(em) ? "Email noto'g'ri" : pw.length < 8 ? "Parol kamida 8 belgidan iborat bo'lsin" : pw !== pw2 ? 'Parollar bir xil emas' : '';
    err('setup-err', msg);
    if (msg) return;
    var btn = document.querySelector('[data-act=setup-admin]');
    busy(btn, true);
    X5.api('POST', '/api/auth/setup', { name: nm, email: em, password: pw }).then(function () {
      ['setup-name', 'setup-email', 'setup-pass', 'setup-pass2'].forEach(function (i) { $(i).value = ''; });
      return X5.start();
    }).catch(function (e) { err('setup-err', e.message); }).then(function () { busy(btn, false); });
  };

  X5.doLogin = function () {
    var em = $('login-email').value.trim(), pw = $('login-pass').value;
    var msg = !em ? 'Emailni kiriting' : !pw ? 'Parolni kiriting' : '';
    err('login-err', msg);
    if (msg) return;
    var btn = document.querySelector('[data-act=login]');
    busy(btn, true);
    X5.api('POST', '/api/auth/login', { email: em, password: pw }).then(function () {
      $('login-pass').value = '';
      return X5.start();
    }).catch(function (e) { err('login-err', e.message); }).then(function () { busy(btn, false); });
  };

  X5.doMfa = function () {
    var code = $('mfa-code').value.trim();
    err('mfa-err', code.length < 6 ? '6 xonali kodni kiriting' : '');
    if (code.length < 6) return;
    var btn = document.querySelector('[data-act=mfa-verify]');
    busy(btn, true);
    X5.api('POST', '/api/auth/mfa', { code: code }).then(function () {
      $('mfa-code').value = '';
      return X5.start();
    }).catch(function (e) { err('mfa-err', e.message); }).then(function () { busy(btn, false); });
  };

  X5.doLogout = function () {
    X5.api('POST', '/api/auth/logout').catch(function () {}).then(function () {
      X5.state = 'loading';
      return X5.start();
    });
  };

  // Enter bosilganda yuborish
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || e.target.tagName !== 'INPUT') return;
    var id = e.target.id || '';
    if (id.indexOf('login-') === 0) X5.doLogin();
    else if (id.indexOf('setup-') === 0) X5.doSetup();
    else if (id === 'mfa-code') X5.doMfa();
  });

  X5.start();
})();
