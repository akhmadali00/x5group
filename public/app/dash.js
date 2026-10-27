// Kichik "dash" qatlami: ilova kodi (app.js) shu interfeys orqali ma'lumot oladi.
//  dash.data(id)  -> {status:'loading'|'ok'|'error', data:[...]}
//  dash.calc(id, {inputs, fn})  -> hisoblangan jadval (kesh bilan)
//  dash.onData(fn) -> ma'lumot o'zgarganda chaqiriladi
// Ma'lumot serverdan /api/data orqali keladi (boot.js), server har foydalanuvchiga ruxsat etilganini beradi.
(function () {
  var store = {};
  var ready = false;
  var failed = false;
  var calcs = {};
  var cache = {};
  var subs = [];

  function invalidate() { cache = {}; }
  function notify() { subs.slice().forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }

  function get(id, stack) {
    if (!ready) return { status: failed ? 'error' : 'loading', data: [] };
    if (Object.prototype.hasOwnProperty.call(store, id)) return { status: 'ok', data: store[id] };
    var c = calcs[id];
    if (!c) return { status: 'error', data: [], message: 'Noma\'lum jadval: ' + id };
    if (cache[id]) return { status: 'ok', data: cache[id] };
    stack = stack || [];
    if (stack.indexOf(id) >= 0) return { status: 'error', data: [], message: 'Aylanma bog\'liqlik: ' + id };
    var args = [];
    for (var i = 0; i < c.inputs.length; i++) {
      var r = get(c.inputs[i], stack.concat(id));
      if (r.status !== 'ok') return { status: r.status, data: [], message: c.inputs[i] + ' yuklanmadi' };
      args.push(r.data);
    }
    try {
      cache[id] = c.fn.apply(null, args);
    } catch (e) {
      console.error('calc ' + id, e);
      return { status: 'error', data: [], message: String(e && e.message) };
    }
    return { status: 'ok', data: cache[id] };
  }

  var dash = {
    calc: function (id, o) { calcs[id] = o; },
    data: function (id) { return get(id); },
    onData: function (fn) { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    setData: function (obj) { store = obj || {}; ready = true; failed = false; invalidate(); notify(); },
    setFailed: function () { ready = false; failed = true; notify(); },
    reset: function () { store = {}; ready = false; failed = false; invalidate(); notify(); },
    params: function () {
      var o = {};
      new URLSearchParams(location.search).forEach(function (v, k) { o[k] = v; });
      return o;
    },
    setParams: function (p) {
      var q = new URLSearchParams(location.search);
      Object.keys(p || {}).forEach(function (k) { if (p[k] == null || p[k] === '') q.delete(k); else q.set(k, p[k]); });
      var s = q.toString();
      try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* ixtiyoriy */ }
      notify();
    },
    setLink: function (id) {
      try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* ixtiyoriy */ }
    }
  };
  window.dash = dash;
})();
