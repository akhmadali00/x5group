(() => {
  // Bo'sh ma'lumot fayli platformada o'qilmaydi, shuning uchun har bir bo'sh jadvalda bitta texnik qator (_bosh) turadi.
  // Uni shu yerda hamma joydan olib tashlaymiz: sahifa va hisoblashlar uni umuman ko'rmaydi.
  const cleanRows = (v) => (Array.isArray(v) ? v.filter((x) => !(x && x._bosh)) : v);
  const rawCalc = dash.calc.bind(dash);
  dash.calc = (id, o) => rawCalc(id, Object.assign({}, o, { fn: (...a) => o.fn(...a.map(cleanRows)) }));
  const rawData = dash.data.bind(dash);
  dash.data = (id) => {
    const r = rawData(id);
    if (r.status === 'error' && /no rows/i.test(String(r.message || ''))) return { status: 'ok', data: [] };
    return Array.isArray(r.data) ? Object.assign({}, r, { data: cleanRows(r.data) }) : r;
  };
  // Bosh menu ko'rsatkichlari "Loyihalar" sahifasidagi bosqichlardan olinadi:
  // Bajarildi = Joylangan, Zaxira = Montaj tayyor, G'oyalar = G'oyalar.
  dash.calc('overview', {
    inputs: ['projects', 'profiles', 'stages', 'campaigns', 'contents'],
    title: 'Loyiha ko\'rsatkichlari',
    description: 'Loyiha ma\'lumotlaridagi kontentlar soni (reja), bosqichlar va kampaniyalarni birlashtiradi: Bajarildi = Joylangan, Zaxira = Montaj tayyor, Target = mijozning eng so\'nggi kampaniyasi holati (kampaniyasi yo\'q bo\'lsa "Yo\'q"). Target videolar = loyiha ma\'lumotlaridagi "Targetga kontentlar soni" ichidan joylangan (Post Joylandi) va rubrikasi "Target" bo\'lgan kontentlar.',
    fn: (projects, profiles, stages, campaigns, contents) => projects.map((p) => {
      const s = stages.find((x) => x.loyiha === p.loyiha) || {};
      const mine = campaigns
        .filter((c) => String(p.loyiha).toLowerCase().startsWith(String(c.mijoz).toLowerCase()))
        .sort((a, b) => String(b.sana).localeCompare(String(a.sana)));
      const b = Number(s.joylangan || 0);
      const prof = profiles.find((x) => x.loyiha === p.loyiha) || {};
      const j = Number(prof.kontentlar || 0);
      const tj = Number(prof.targetga || 0);
      const tb = contents.filter((c) => c.loyiha === p.loyiha && String(c.rubrika) === 'Target' && c.bosqich === 'Post Joylandi').length;
      return {
        loyiha: p.loyiha,
        target: mine.length ? (mine.find((k) => k.holati === 'Faol') || mine[0]).holati : "Yo'q",
        jami: j,
        bajarildi: b,
        zaxira: Number(s.montaj || 0),
        goyalar: Number(s.goyalar || 0),
        foiz: j ? b / j : 0,
        nisbat: b + '/' + j,
        targetjami: tj,
        targetbajarildi: tb,
        tfoiz: tj ? Math.min(1, tb / tj) : 0,
        tnisbat: tb + '/' + tj
      };
    })
  });

  dash.calc('totals', {
    inputs: ['overview'],
    title: 'Umumiy ko\'rsatkichlar',
    description: 'Barcha loyihalar bo\'yicha jami sonlar.',
    fn: (overview) => {
      const sum = (k) => overview.reduce((a, p) => a + Number(p[k] || 0), 0);
      const b = sum('bajarildi');
      const j = sum('jami');
      return [{
        loyihalar: overview.length,
        bajarildi: b,
        jami: j,
        foiz: j ? b / j : 0,
        zaxira: sum('zaxira'),
        goyalar: sum('goyalar')
      }];
    }
  });

  dash.calc('project_growth', {
    inputs: ['profiles'],
    title: "Obunachilar va qamrov o'sishi",
    description: "Hozirgi obunachilar soni va qamrovdan loyiha olingan paytdagi sonni ayiradi (+234 ko'rinishida chiqadi).",
    fn: (rows) => rows.map((r) => {
      const d = (a, b) => (r[a] === undefined || r[a] === '' || r[b] === undefined || r[b] === '' ? '' : Number(r[a]) - Number(r[b]));
      return { loyiha: r.loyiha, ig_delta: d('ig_hozir', 'ig_boshlang'), tg_delta: d('tg_hozir', 'tg_boshlang'), yt_delta: d('yt_hozir', 'yt_boshlang'), oxvat_delta: d('oxvat_hozir', 'oxvat_boshlang') };
    })
  });

  dash.calc('stage_totals', {
    inputs: ['stages'],
    title: 'Bosqichlar jami',
    description: 'Har bir bosqich bo\'yicha barcha loyihalar yig\'indisi.',
    fn: (stages) => {
      const sum = (k) => stages.reduce((a, p) => a + Number(p[k] || 0), 0);
      return [{
        goyalar: sum('goyalar'),
        skript: sum('skript'),
        montaj: sum('montaj'),
        joylangan: sum('joylangan'),
        rekda: sum('rekda')
      }];
    }
  });

  dash.calc('project_info', {
    inputs: ['profiles'],
    title: 'Shartnoma tugashi',
    description: "Shartnoma boshlangan sanaga muddatni (oy) qo'shib tugash sanasini topadi.",
    fn: (rows) => rows.map((r) => {
      const p = String(r.boshlangan || '').split('-').map(Number);
      const m = Number(r.muddat);
      if (p.length !== 3 || p.some((n) => isNaN(n)) || !(m > 0)) return { loyiha: r.loyiha, tugash: '' };
      const last = new Date(Date.UTC(p[0], p[1] - 1 + m + 1, 0)).getUTCDate();
      const d = new Date(Date.UTC(p[0], p[1] - 1 + m, Math.min(p[2], last)));
      return { loyiha: r.loyiha, tugash: d.toISOString().slice(0, 10) };
    })
  });

  dash.calc('project_stats', {
    inputs: ['projects', 'contents'],
    title: 'Loyiha kontent hisobi',
    description: 'Har bir loyiha bo\'yicha kiritilgan kontentlar, rekdadagilar va targetga ketganlar soni.',
    fn: (projects, contents) => projects.map((p) => {
      const mine = contents.filter((c) => c.loyiha === p.loyiha);
      return {
        loyiha: p.loyiha,
        kontent: mine.length,
        rekda: mine.filter((c) => Number(c.rekda) === 1).length,
        target: mine.filter((c) => Number(c.target) === 1).length
      };
    })
  });

  dash.calc('task_status', {
    inputs: ['tasks'],
    title: 'Vazifa muddati',
    description: 'Topshirish sanasidan bugungi kungacha qancha qolgani yoki necha kun kechikkanini hisoblaydi. Tayyor yoki tugatilgan vazifa kechikkan hisoblanmaydi.',
    fn: (tasks) => {
      const DAY = 86400000;
      const t = new Date();
      const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
      return tasks.map((x) => {
        const p = String(x.sana).split('-').map(Number);
        const due = Date.UTC(p[0], p[1] - 1, p[2]);
        if (isNaN(due)) return { id: x.id, tugash: '', qoldi: 0, kechikkan: 0, belgi: '' };
        const left = Math.round((due - today) / DAY);
        const done = /^(tayyor|tugat)/.test(String(x.holat).toLowerCase());
        return {
          id: x.id,
          tugash: new Date(due).toISOString().slice(0, 10),
          qoldi: left,
          kechikkan: !done && left < 0 ? 1 : 0,
          belgi: done ? '' : left < 0 ? (-left) + ' kun kechikdi' : left === 0 ? 'Bugun tugaydi' : left + ' kun qoldi'
        };
      });
    }
  });

  dash.calc('task_totals', {
    inputs: ['tasks', 'task_status'],
    title: 'Vazifalar jami',
    description: 'Vazifalarning umumiy soni, jarayondagilari, kechikkanlari va tasdiq kutayotganlari (Tayyor).',
    fn: (tasks, status) => [{
      jami: tasks.length,
      jarayonda: tasks.filter((x) => String(x.holat).toLowerCase() === 'jarayonda').length,
      kechikkan: status.reduce((a, s) => a + Number(s.kechikkan || 0), 0),
      tayyor: tasks.filter((x) => String(x.holat).toLowerCase() === 'tayyor').length
    }]
  });

  const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  dash.calc('shoot_status', {
    inputs: ['shoots'],
    title: 'Syomka muddati',
    description: "Har bir syomkaning hafta kunini va bugundan necha kun qolganini hisoblaydi. Faqat 'Rejada' va 'Ko'chirildi' holatidagi syomkalar uchun Bugun / Ertaga belgisi chiqadi.",
    fn: (rows) => {
      const DAY = 86400000;
      const t = new Date();
      const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
      return rows.map((x) => {
        const p = String(x.sana).split('-').map(Number);
        const d = Date.UTC(p[0], p[1] - 1, p[2]);
        if (isNaN(d)) return { id: x.id, hafta: '', qoldi: 0, belgi: '' };
        const left = Math.round((d - today) / DAY);
        const active = /^(rejada|ko)/.test(String(x.holat).toLowerCase());
        return {
          id: x.id,
          hafta: WEEKDAYS[new Date(d).getUTCDay()],
          qoldi: left,
          belgi: !active ? '' : left < 0 ? "Sana o'tib ketgan" : left === 0 ? 'Bugun' : left === 1 ? 'Ertaga' : left + ' kundan keyin'
        };
      });
    }
  });

  dash.calc('shoot_totals', {
    inputs: ['shoots', 'shoot_status'],
    title: 'Syomkalar jami',
    description: "Rejadagi syomkalardan bugungi, ertangi, shu haftadagi (bugundan 7 kun ichida) va jami soni.",
    fn: (rows, status) => {
      const st = new Map(status.map((s) => [s.id, s]));
      const act = rows.filter((x) => /^(rejada|ko)/.test(String(x.holat).toLowerCase()) && st.has(x.id));
      const q = (x) => st.get(x.id).qoldi;
      return [{
        bugun: act.filter((x) => q(x) === 0).length,
        ertaga: act.filter((x) => q(x) === 1).length,
        hafta: act.filter((x) => q(x) >= 0 && q(x) <= 6).length,
        rejada: act.length
      }];
    }
  });

  dash.calc('today_posts', {
    inputs: ['contents'],
    title: 'Bugungi joylashlar',
    description: "Joylash sanasi bugun bo'lgan (yoki namuna sifatida belgilangan) tasdiqlangan kontentlar, vaqt bo'yicha tartiblangan. Materiali (Telegram havolasi) yo'qlari ogohlantiriladi.",
    fn: (rows) => {
      const t = new Date();
      const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      return rows
        .filter((c) => (c.joylash === iso || Number(c.bugun_namuna) === 1) && ['Tasdiqlandi', 'Post Joylandi'].includes(c.bosqich))
        .map((c) => ({ id: c.id, loyiha: c.loyiha, nomi: c.nomi, vaqt: c.vaqt, platformalar: c.platformalar, avto: c.avto, material: c.material, joylandi: c.joylandi, izoh_instagram: c.izoh_instagram, izoh_telegram: c.izoh_telegram, izoh_youtube: c.izoh_youtube }))
        .sort((a, b) => String(a.vaqt).localeCompare(String(b.vaqt)));
    }
  });

  dash.calc('member_stats', {
    inputs: ['team', 'contents'],
    title: 'A\'zo hisobi',
    description: 'Har bir jamoa a\'zosi tayyorlagan kontentlar, rekdadagilar, targetga ketganlar va loyihalar soni.',
    fn: (team, contents) => team.map((m) => {
      const mine = contents.filter((c) => c.tayyorladi === m.ism);
      return {
        ism: m.ism,
        kontent: mine.length,
        rekda: mine.filter((c) => Number(c.rekda) === 1).length,
        target: mine.filter((c) => Number(c.target) === 1).length,
        loyihalar: new Set(mine.map((c) => c.loyiha)).size
      };
    })
  });

  dash.calc('campaign_rates', {
    inputs: ['campaigns'],
    title: 'CPR, Hook Rate, Hold Rate',
    description: "CPR = Amount Spent / Results. Hook Rate = 3 soniyalik video ko'rishlar / Impressions. Hold Rate = ThruPlay / 3 soniyalik video ko'rishlar. Natija yo'q yoki video bo'lmasa qiymat hisoblanmaydi.",
    fn: (campaigns) => campaigns.map((c) => ({
      kampaniya: c.kampaniya,
      cpr: Number(c.natija) ? Number(c.sarflandi) / Number(c.natija) : 0,
      hook: Number(c.korish) ? Number(c.video3s) / Number(c.korish) : 0,
      hold: Number(c.video3s) ? Number(c.thruplay) / Number(c.video3s) : 0
    }))
  });

  dash.calc('campaign_totals', {
    inputs: ['campaigns'],
    title: 'Kampaniyalar jami',
    description: "Mijoz bo'yicha barcha kampaniyalar (faol, to'xtatilgan, o'chirilgan, tugatilgan) yig'indisi. O'rtacha lid narxi = LID kampaniyalar sarfi / jami lidlar.",
    fn: (campaigns) => {
      const by = {};
      campaigns.forEach((c) => { (by[c.mijoz] = by[c.mijoz] || []).push(c); });
      const sum = (a, k) => a.reduce((t, c) => t + Number(c[k] || 0), 0);
      return Object.keys(by).map((m) => {
        const a = by[m];
        const lid = sum(a, 'lid');
        const lidSarf = sum(a.filter((c) => c.maqsad === 'LID'), 'sarflandi');
        return {
          mijoz: m,
          soni: a.length,
          faol: a.filter((c) => c.holati === 'Faol').length,
          sarflandi: sum(a, 'sarflandi'),
          lid,
          cpl: lid ? lidSarf / lid : 0,
          korish: sum(a, 'korish'),
          obunachi: sum(a, 'obunachi')
        };
      });
    }
  });

  dash.calc('daily_stats', {
    inputs: ['daily'],
    title: 'Kunlik natijalar',
    description: "Har bir LID mijozi uchun oxirgi to'liq kun (kecha) natijasini undan oldingi 7 kun o'rtachasi bilan solishtiradi. O'rtacha 3 lid/kundan kam bo'lsa 'kam' (ma'lumot yetarli emas), farq +10% dan baland bo'lsa 'yaxshi', -10% dan past bo'lsa 'yomon'. Bugungi (yakunlanmagan) kun alohida qaytariladi.",
    fn: (daily) => {
      const by = {};
      daily.forEach((r) => { (by[r.mijoz] = by[r.mijoz] || []).push(r); });
      const sum = (a, k) => a.reduce((s, r) => s + Number(r[k] || 0), 0);
      return Object.keys(by).map((m) => {
        const rows = by[m].slice().sort((a, b) => String(a.sana).localeCompare(String(b.sana)));
        const full = rows.filter((r) => Number(r.toliq) === 1);
        const part = rows.filter((r) => Number(r.toliq) !== 1);
        const y = full[full.length - 1];
        const prev = full.slice(-8, -1);
        const lid = y ? Number(y.lid) : 0;
        const sarf = y ? Number(y.sarf) : 0;
        const ortLid = prev.length ? sum(prev, 'lid') / prev.length : 0;
        const ortSarf = prev.length ? sum(prev, 'sarf') / prev.length : 0;
        const ortCpl = sum(prev, 'lid') ? sum(prev, 'sarf') / sum(prev, 'lid') : 0;
        const cpl = lid ? sarf / lid : 0;
        const pct = ortLid ? (lid - ortLid) / ortLid : 0;
        const cplPct = ortCpl && cpl ? cpl / ortCpl - 1 : 0;
        const p = part[part.length - 1];
        return {
          mijoz: m,
          sana: y ? y.sana : '',
          lid, sarf, cpl, ortLid, ortSarf, ortCpl, pct, cplPct,
          holat: ortLid < 3 ? 'kam' : pct >= 0.1 ? 'yaxshi' : pct <= -0.1 ? 'yomon' : 'orta',
          bugun: p ? Number(p.lid) : -1,
          kunlar: full.slice(-14).map((r) => Number(r.lid)).join(',')
        };
      });
    }
  });

  const root = document.getElementById('lx-app');
  const targetBox = document.querySelector('.lx-targetrows');
  const money = (n) => '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
  const pct1 = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%';
  const money2 = (n) => '$' + (n >= 1 ? n.toFixed(2) : n >= 0.1 ? n.toFixed(2) : n.toFixed(3)).replace('.', ',');
  const compact = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : String(n));
  const mkc = (src, field, key) => ({ 'data-source': src, 'data-field': field, 'data-where': 'kampaniya=' + enc(key) });
  const mki = (src, field, key) => ({ 'data-source': src, 'data-field': field, 'data-where': 'id=' + enc(key) });
  const detailBox = document.querySelector('.lx-detail');
  const ptab = { name: null, tab: 'kontent' };
  const exportSel = {};
  // Kim kirgani va ruxsatlar. Namuna: o'zgarishlar shu sahifada ishlaydi, yangilansa qaytadi.
  const view = { me: '' };
  const teamEdits = {};
  const teamAdded = [];
  const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const teamRowsAll = () => {
    const t = dash.data('team');
    const base = t.status === 'ok' ? t.data : [];
    return base.map((m) => Object.assign({}, m, teamEdits[m.ism] || {}, { _key: m.ism })).concat(teamAdded);
  };
  const accounts = () => teamRowsAll().filter((m) => m.tur !== 'frilans');
  const frilans = (kasb) => teamRowsAll().filter((m) => m.tur === 'frilans' && (!kasb || m.lavozim === kasb));
  const meRow = () => {
    const a = accounts();
    return a.find((m) => m._key === view.me) || a.find((m) => String(m.rol).toLowerCase() === 'admin') || a[0] || null;
  };
  const amAdmin = () => { const m = meRow(); return !!m && String(m.rol).toLowerCase() === 'admin'; };
  const isPM = () => { const m = meRow(); return !!m && m.lavozim === 'PM'; };
  const TARGET_ROLES = ['PM', 'Targetolog'];
  const PAGE_IDS = ['bosh', 'loyihalar', 'target', 'vazifalar', 'syomkalar', 'jamoa', 'arxiv'];
  // Sahifa yoki kartochka ko'rinishi: Admin hammasini ko'radi, Arxiv faqat Admin, Target faqat PM/Targetolog/Admin
  const can = (key) => {
    const m = meRow();
    if (!m) return false;
    const page = key.split('.')[0];
    if (page === 'arxiv') return amAdmin();
    if (amAdmin()) return true;
    if (page === 'target' && !TARGET_ROLES.includes(m.lavozim)) return false;
    return splitList(m.ruxsat).includes(key);
  };
  const firstPage = () => PAGE_IDS.find((p) => can(p)) || 'bosh';
  const myProjSet = () => {
    const m = meRow();
    return new Set(m ? memberProjects(m._key) : []);
  };
  const canProj = (name) => amAdmin() || myProjSet().has(name);
  const projActive = (name) => {
    const pf = dash.data('profiles');
    if (pf.status !== 'ok') return true;
    const p = pf.data.find((x) => x.loyiha === name);
    return !p || !p.holat || p.holat === 'Faol';
  };
  const daysTo = (iso) => {
    const q = String(iso || '').split('-').map(Number);
    if (q.length !== 3 || q.some((n) => isNaN(n))) return null;
    const t = new Date();
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  };
  const canClient = (mijoz) => amAdmin() || [...myProjSet()].some((n) => String(n).toLowerCase().startsWith(String(mijoz).toLowerCase()));
  const flagCheck = (c, f, label) => {
    const on = flagOn(c, f);
    const locked = f === 'target' && !amAdmin();
    if (locked) return el('span', 'lx-check lock' + (on ? ' on' : ''), on ? '✓' : '', { role: 'checkbox', 'aria-checked': String(on), 'aria-disabled': 'true', 'aria-label': label, title: "Targetga yuborishni faqat Admin o'zgartiradi" });
    return el('span', 'lx-check' + (on ? ' on' : ''), on ? '✓' : '', { role: 'checkbox', tabindex: '0', 'aria-checked': String(on), 'aria-label': label, 'data-flag': f, 'data-cid': c.id, 'data-source': 'contents' });
  };
  const detailState = { name: null, stage: '', person: '', key: 'tartib', dir: 1, orders: {} };
  const RUBRIKALAR = ['Interaktiv', 'Eksperiment', 'Syujetniy', 'Ekspertniy', 'Target', 'Informatsion'];
  const STAGE_ORDER = ['Tasdiqlandi', 'Montaj Tayyor', 'TZ Berildi', 'Syomka Qilindi', 'Skript Tayyor', 'Ijobiy', "G'oya", 'Post Joylandi'];
  const STAGE_FLOW = ["G'oya", 'Ijobiy', 'Skript Tayyor', 'Syomka Qilindi', 'TZ Berildi', 'Montaj Tayyor', 'Tasdiqlandi', 'Post Joylandi'];
  const POST_OPEN = ['Tasdiqlandi', 'Post Joylandi'];
  const isApproved = (stage) => POST_OPEN.includes(stage);
  const stageIdx = (s) => {
    const i = STAGE_ORDER.indexOf(s);
    return i < 0 ? 99 : i;
  };
  const flagOv = {};
  const postedOv = {};
  const doneSet = (c) => new Set(String(c.joylandi || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const isPosted = (c, k) => (postedOv[c.id + ':' + k] !== undefined ? postedOv[c.id + ':' + k] : doneSet(c).has(k));
  const flagOn = (c, f) => (flagOv[c.id + ':' + f] !== undefined ? flagOv[c.id + ':' + f] : Number(c[f]) === 1);
  const toggleFlag = (n) => {
    const on = !n.classList.contains('on');
    flagOv[n.getAttribute('data-cid') + ':' + n.getAttribute('data-flag')] = on;
    n.classList.toggle('on', on);
    n.textContent = on ? '✓' : '';
    n.setAttribute('aria-checked', String(on));
  };
  const flagClick = (n) => {
    toggleFlag(n);
    const on = n.classList.contains('on');
    X5.mutate('PATCH', '/api/contents/' + n.getAttribute('data-cid'), { [n.getAttribute('data-flag')]: on }).catch(() => X5.reload());
  };
  const archived = new Map();
  const ARCH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>';
  const archCell = (key, allowed) => {
    const c = el('div', 'lx-c lx-arch-c');
    if (allowed) {
      const b = el('button', 'lx-arch', null, { type: 'button', title: 'Arxivlash', 'aria-label': 'Arxivlash', 'data-arch': key });
      b.innerHTML = ARCH_SVG;
      c.append(b);
    }
    return c;
  };
  const link = (row, name) => {
    row.classList.add('lx-link');
    row.setAttribute('data-project', name);
    row.setAttribute('role', 'link');
    row.tabIndex = 0;
  };
  const SWATCHES = ['#30b457', '#0a84ff', '#ff9f0a', '#af52de', '#ff2d55', '#5ac8fa', '#00a99d', '#8e8e93'];
  const colorFor = (name) => {
    const tr = teamRowsAll().find((x) => x.ism === name);
    if (tr && tr.rang) return tr.rang;
    const fixed = { akhmadali: '#30b457', muhammadali: '#0a84ff', xojiakbar: '#ff9f0a' };
    const k = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (fixed[k]) return fixed[k];
    const pal = ['#af52de', '#ff2d55', '#5ac8fa', '#8e8e93'];
    let h = 0;
    for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return pal[h % pal.length];
  };
  const stageColor = (s) => ({ postjoylandi: '#ff9f0a', montajtayyor: '#af52de', tzberildi: '#5e5ce6', syomkaqilindi: '#0a84ff', skripttayyor: '#d9a400', ijobiy: '#00a99d', tasdiqlandi: '#30b457', goya: '#5ac8fa' }[String(s || '').toLowerCase().replace(/[^a-z]/g, '')] || '#8e8e93');
  const chip = (text, color, attrs) => {
    const c = el('span', 'lx-chip', text, attrs);
    c.style.setProperty('--c', color);
    return c;
  };
  const rowsBox = document.querySelector('.lx-rows');
  const stageBox = document.querySelector('.lx-projcards');
  const fmtInt = d3.format(',');
  const fmtPct = d3.format('.0%');
  const enc = (s) => String(s).replace(/[%&=]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const STAGES = [
    ['goyalar', "G'oyalar", '#8e8e93'],
    ['skript', 'Skript tayyor', '#34c759'],
    ['montaj', 'Montaj tayyor', '#0a84ff'],
    ['joylangan', 'Joylangan', '#af52de'],
    ['rekda', 'Rekda', '#ff9f0a']
  ];
  let animated = false;

  const el = (tag, cls, text, attrs) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const mk = (src, field, key) => ({ 'data-source': src, 'data-field': field, 'data-where': 'loyiha=' + enc(key) });
  const ICONS = {
    instagram: ['Instagram', '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'],
    telegram: ['Telegram', '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>'],
    youtube: ['YouTube', '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>'],
    phone: ['Telefon', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>']
  };
  const ico = (k) => {
    const [t, p] = ICONS[k];
    const s = el('span', 'lx-ico', null, { role: 'img', 'aria-label': t, title: t });
    s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
    return s;
  };
  document.querySelectorAll('[data-ico]').forEach((n) => {
    const i = ico(n.getAttribute('data-ico'));
    if (n.hasAttribute('data-only')) n.replaceChildren(i);
    else n.prepend(i);
  });
  const skeleton = (box) => {
    for (let i = 0; i < 4; i++) box.append(el('div', 'lx-skel-row dash-skeleton'));
  };

  const drawTotals = () => {
    let t = dash.data('totals');
    if (t.status === 'ok' && !amAdmin()) {
      const o = dash.data('overview');
      const mine = o.status === 'ok' ? o.data.filter((r) => canProj(r.loyiha)) : [];
      const sum = (k) => mine.reduce((a, r) => a + Number(r[k] || 0), 0);
      const b = sum('bajarildi');
      const j = sum('jami');
      t = { status: 'ok', data: [{ loyihalar: mine.length, bajarildi: b, jami: j, foiz: j ? b / j : 0, zaxira: sum('zaxira'), goyalar: sum('goyalar') }] };
    }
    const row = t.status === 'ok' && t.data.length ? t.data[0] : null;
    document.querySelectorAll('#umumiy [data-source="totals"]').forEach((n) => {
      const f = n.getAttribute('data-field');
      if (row) {
        n.textContent = f === 'foiz' ? fmtPct(row[f]) : fmtInt(row[f]);
        n.classList.remove('dash-skeleton');
      } else if (t.status === 'loading') {
        n.classList.add('dash-skeleton');
      } else {
        n.textContent = '—';
        n.classList.remove('dash-skeleton');
      }
    });
  };

  const drawRows = () => {
    const p = dash.data('overview');
    rowsBox.replaceChildren();
    if (p.status === 'loading') {
      skeleton(rowsBox);
      return;
    }
    if (p.status !== 'ok') {
      rowsBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    if (!p.data.some((r) => canProj(r.loyiha))) rowsBox.append(el('div', 'lx-empty', "Sizga hali loyiha biriktirilmagan."));
    p.data.filter((r) => canProj(r.loyiha)).forEach((r) => {
      const row = el('div', 'lx-row');
      link(row, r.loyiha);

      row.append(el('div', 'lx-c lx-name', null, { 'data-label': 'Loyiha' }));
      row.lastChild.append(el('span', null, r.loyiha, mk('overview', 'loyiha', r.loyiha)));

      const pr = el('div', 'lx-c lx-prog', null, { 'data-label': 'Bajarildi' });
      pr.append(el('span', 'lx-pct', fmtPct(r.foiz), mk('overview', 'foiz', r.loyiha)));
      const track = el('div', 'lx-track', null, { 'data-source': 'overview' });
      const fill = el('div', 'lx-fill');
      fill.style.width = Math.max(0, Math.min(1, r.foiz)) * 100 + '%';
      track.append(fill);
      pr.append(track);
      pr.append(el('span', 'lx-frac', r.nisbat, mk('overview', 'nisbat', r.loyiha)));
      row.append(pr);

      const tp = el('div', 'lx-c lx-prog', null, { 'data-label': 'Target videolar' });
      if (Number(r.targetjami) > 0) {
        tp.append(el('span', 'lx-pct', fmtPct(r.tfoiz), mk('overview', 'tfoiz', r.loyiha)));
        const tTrack = el('div', 'lx-track', null, { 'data-source': 'overview' });
        const tFill = el('div', 'lx-fill');
        tFill.style.width = Math.max(0, Math.min(1, r.tfoiz)) * 100 + '%';
        tTrack.append(tFill);
        tp.append(tTrack);
        tp.append(el('span', 'lx-frac', r.tnisbat, mk('overview', 'tnisbat', r.loyiha)));
      } else {
        tp.append(el('span', 'lx-note', '—'));
      }
      row.append(tp);

      const st = el('div', 'lx-c lx-stat', null, { 'data-label': 'Target' });
      st.append(el('span', 'lx-pill lx-s-' + norm(r.target), r.target, mk('overview', 'target', r.loyiha)));
      row.append(st);

      rowsBox.append(row);
    });
    if (!animated) {
      animated = true;
      root.classList.add('lx-anim');
    } else {
      root.classList.remove('lx-anim');
    }
  };

  const nTone = (n) => (n > 10 ? 'n-ok' : n >= 5 ? 'n-warn' : n >= 1 ? 'n-bad' : 'n-zero');

  const todayBox = document.querySelector('.lx-plist');
  const todaySum = document.getElementById('bugun-sum');
  const mkp = (id, field) => ({ 'data-source': 'today_posts', 'data-field': field, 'data-where': 'id=' + enc(id) });
  const platKeys = (c) => String(c.platformalar || '').split(',').map((x) => x.trim().toLowerCase()).filter((k) => ICONS[k]);
  const drawToday = () => {
    const d = dash.data('today_posts');
    todayBox.replaceChildren();
    todaySum.replaceChildren();
    if (d.status === 'loading') { skeleton(todayBox); return; }
    if (d.status !== 'ok') { todayBox.append(el('div', 'lx-fail', 'Failed to load')); return; }
    const todayList = d.data.filter((c) => canProj(c.loyiha) && projActive(c.loyiha));
    if (!todayList.length) { todayBox.append(el('div', 'lx-empty', "Bugun joylanadigan kontent yo'q.")); return; }
    const groups = new Map();
    todayList.forEach((c) => {
      if (!groups.has(c.loyiha)) groups.set(c.loyiha, []);
      groups.get(c.loyiha).push(c);
    });
    let manual = 0;
    let nomat = 0;
    groups.forEach((items, name) => {
      const g = el('div', 'lx-pgroup', null, { 'data-goto': name, role: 'link', tabindex: '0', title: name + ' kontentlariga o\'tish' });
      g.append(el('h3', null, name));
      items.forEach((c) => {
        const noMat = !String(c.material || '').trim();
        if (noMat) nomat++;
        const cont = el('div', 'lx-pcont');
        cont.append(el('div', 'lx-pname', c.nomi, mkp(c.id, 'nomi')));
        platKeys(c).slice(0, 3).forEach((k) => {
          const auto = k === 'telegram' && Number(c.avto) === 1;
          const done = isPosted(c, k);
          if (!auto) manual++;
          const row = el('div', 'lx-pitem');
          const pl = el('span', 'lx-plat' + (auto ? ' auto' : '') + (done ? ' done' : '') + (noMat ? ' nomat' : ''), null, noMat ? { title: "Material yo'q" } : null);
          pl.append(ico(k), document.createTextNode(' ' + ICONS[k][0]));
          row.append(pl, el('span', 'lx-ptime', c.vaqt || '—', mkp(c.id, 'vaqt')));
          if (auto) row.append(el('span', 'lx-pnote' + (done ? ' ok' : ''), done ? 'Avtomatik joylandi ✓' : 'Avtomatik joylanadi'));
          else row.append(el('button', 'lx-btn lx-pbtn' + (done ? ' primary' : ''), done ? 'Joylandi ✓' : 'Joylandi', { type: 'button', 'data-pdone': c.id + ':' + k, 'aria-pressed': String(done) }));
          cont.append(row);
        });
        g.append(cont);
      });
      todayBox.append(g);
    });
    todaySum.append(document.createTextNode("Qo'lda joylanadigan: " + manual + ' ta'));
    if (nomat) todaySum.append(document.createTextNode(' · '), el('span', 'bad', "Materiali yo'q kontent: " + nomat + ' ta'));
  };

  const projTabs = document.querySelector('.lx-ptabs');
  const projState = { tab: 'Faol' };
  projTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ptab]');
    if (!b) return;
    projState.tab = b.getAttribute('data-ptab');
    drawStages();
  });
  const spNum = (n) => fmtInt(Math.abs(Number(n))).replace(/,/g, ' ');
  const deltaEl = (d, attrs) => {
    const n = Number(d);
    const cls = n > 0 ? 'lx-delta up' : n < 0 ? 'lx-delta down' : 'lx-delta';
    return el('span', cls, (n > 0 ? '+' : n < 0 ? '-' : '') + spNum(n), attrs);
  };
  // Havola yoki @username'dan to'liq manzil yasaydi (faqat http/https qabul qilinadi)
  const socUrl = (k, v) => {
    const t = String(v || '').trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    if (/^(javascript|data|vbscript):/i.test(t)) return '';
    const u = t.replace(/^@/, '');
    if (/^(www\.)?(instagram\.com|t\.me|youtube\.com|youtu\.be)\//i.test(u)) return 'https://' + u;
    return k === 'ig' ? 'https://instagram.com/' + u : k === 'tg' ? 'https://t.me/' + u : 'https://youtube.com/' + (t.startsWith('@') ? t : '@' + u);
  };
  const SOCIALS = [['instagram', 'Instagram', 'ig'], ['telegram', 'Telegram', 'tg'], ['youtube', 'YouTube', 'yt']];
  const drawStages = () => {
    const pj = dash.data('projects');
    const pf = dash.data('profiles');
    const st = dash.data('stages');
    const gr = dash.data('project_growth');
    stageBox.replaceChildren();
    if ([pj, pf, st, gr].some((d) => d.status === 'loading')) {
      skeleton(stageBox);
      return;
    }
    if ([pj, pf, st, gr].some((d) => d.status !== 'ok')) {
      stageBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const has = (v) => v !== undefined && v !== null && v !== '';
    const HOLATLAR = ['Faol', 'Muzlatilgan', 'Tugagan'];
    const hol = (name) => (pf.data.find((x) => x.loyiha === name) || {}).holat || 'Faol';
    const mine = pj.data.filter((r) => canProj(r.loyiha));
    projTabs.replaceChildren(...HOLATLAR.map((h) => {
      const n = mine.filter((r) => hol(r.loyiha) === h).length;
      return el('button', null, h + ' · ' + n, { type: 'button', role: 'tab', 'data-ptab': h, 'aria-selected': String(projState.tab === h) });
    }));
    const pinfo = dash.data('project_info');
    const shown = mine.filter((r) => hol(r.loyiha) === projState.tab);
    if (!shown.length) stageBox.append(el('div', 'lx-empty', !mine.length ? (amAdmin() ? "Hali loyiha yo'q. «+ Yangi loyiha» tugmasi bilan birinchisini qo'shing." : "Sizga hali loyiha biriktirilmagan.") : "Bu holatda loyiha yo'q."));
    shown.forEach((r) => {
      const name = r.loyiha;
      const prof = pf.data.find((x) => x.loyiha === name) || {};
      const g = gr.data.find((x) => x.loyiha === name) || {};
      const s = st.data.find((x) => x.loyiha === name) || {};
      const card = el('div', 'lx-pgroup lx-pcard');
      card.setAttribute('data-project', name);
      card.setAttribute('role', 'link');
      card.tabIndex = 0;
      const hd = el('h3', null, null);
      hd.append(el('span', null, name, mk('projects', 'loyiha', name)));
      const h = prof.holat || 'Faol';
      if (h !== 'Faol') { card.classList.add('off'); hd.append(chip(h, h === 'Muzlatilgan' ? '#5ac8fa' : '#8e8e93', mk('profiles', 'holat', name))); }
      else if (pinfo.status === 'ok') {
        const pi = pinfo.data.find((x) => x.loyiha === name);
        const dl = pi && pi.tugash ? daysTo(pi.tugash) : null;
        if (dl !== null && dl <= 14) hd.append(el('span', 'lx-cstat ' + (dl <= 3 ? 'bad' : 'warn'), dl < 0 ? 'Shartnoma muddati tugagan' : dl === 0 ? 'Shartnoma bugun tugaydi' : 'Shartnoma: ' + dl + ' kun qoldi', mk('project_info', 'tugash', name)));
      }
      card.append(hd);
      const soc = el('div', 'lx-soc');
      SOCIALS.forEach(([ic, label, k]) => {
        if (!has(prof[k + '_hozir']) && !has(prof[k + '_boshlang'])) return;
        const row = el('div', 'lx-socrow');
        const lab = el('span', 'lx-soclab');
        const url = socUrl(k, prof[k + '_havola']);
        lab.append(ico(ic));
        if (url) lab.append(el('a', 'lx-soclink', label, { href: url, target: '_blank', rel: 'noopener noreferrer' }));
        else lab.append(document.createTextNode(label));
        row.append(lab);
        row.append(el('span', 'lx-socval', spNum(has(prof[k + '_hozir']) ? prof[k + '_hozir'] : prof[k + '_boshlang']), mk('profiles', k + '_hozir', name)));
        row.append(has(g[k + '_delta']) ? deltaEl(g[k + '_delta'], mk('project_growth', k + '_delta', name)) : el('span'));
        soc.append(row);
      });
      if (!soc.children.length) soc.append(el('div', 'lx-note', 'Obunachilar kiritilmagan'));
      card.append(soc);
      const nums = el('div', 'lx-pnums');
      const cell = (label, value, cls, attrs) => {
        const c = el('div', 'lx-pnum');
        c.append(el('div', 'lx-pnl', label), el('div', 'lx-pnv ' + (cls || ''), value, attrs));
        return c;
      };
      const jc = cell('Joylandi', fmtInt(s.joylangan || 0), '', mk('stages', 'joylangan', name));
      if (Number(prof.kontentlar) > 0) jc.lastChild.append(el('span', 'lx-pplan', '/' + fmtInt(prof.kontentlar), mk('profiles', 'kontentlar', name)));
      nums.append(jc, cell('Zaxira', fmtInt(s.montaj || 0), '', mk('stages', 'montaj', name)), cell('Rekda', fmtInt(s.rekda || 0), 'n-gold', mk('stages', 'rekda', name)));
      card.append(nums);
      if (has(prof.oxvat_hozir) || has(prof.oxvat_boshlang)) {
        const rc = el('div', 'lx-reach');
        rc.append(el('span', 'lx-soclab', "Oylik qamrov (ko'rishlar)"));
        rc.append(el('span', 'lx-socval', spNum(has(prof.oxvat_hozir) ? prof.oxvat_hozir : prof.oxvat_boshlang), mk('profiles', 'oxvat_hozir', name)));
        rc.append(has(g.oxvat_delta) ? deltaEl(g.oxvat_delta, mk('project_growth', 'oxvat_delta', name)) : el('span'));
        card.append(rc);
      }
      stageBox.append(card);
    });
  };

  const targetState = { proj: null };
  const tabBar = document.querySelector('.lx-ttabs');
  const tSum = document.querySelector('.lx-tsum');
  let syncAt = '';
  const tSync = document.getElementById('target-sync');
  const belongs = (k, loyiha) => String(loyiha).toLowerCase().startsWith(String(k.mijoz).toLowerCase());
  const mkt = (key, field) => ({ 'data-source': 'campaign_totals', 'data-field': field, 'data-where': 'mijoz=' + enc(key) });

  const drawTargetTabs = () => {
    const pj = dash.data('projects');
    const cp = dash.data('campaigns');
    tabBar.replaceChildren();
    const names = pj.status === 'ok' && cp.status === 'ok' ? pj.data.filter((p) => canProj(p.loyiha) && cp.data.some((k) => belongs(k, p.loyiha))).map((p) => p.loyiha) : [];
    if (!targetState.proj || !names.includes(targetState.proj)) targetState.proj = names[0] || null;
    names.forEach((n) => tabBar.append(el('button', null, n, { type: 'button', role: 'tab', 'data-ttab': 'kamp', 'data-tproj': n, 'aria-selected': String(targetState.proj === n) })));
  };

  const drawTarget = () => {
    const c = dash.data('campaigns');
    const r = dash.data('campaign_rates');
    const tt = dash.data('campaign_totals');
    drawTargetTabs();
    targetBox.replaceChildren();
    tSum.replaceChildren();
    tSync.textContent = '';
    if (c.status === 'loading' || r.status === 'loading' || tt.status === 'loading') {
      skeleton(tSum);
      skeleton(targetBox);
      return;
    }
    if (c.status !== 'ok' || r.status !== 'ok' || tt.status !== 'ok') {
      targetBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    document.getElementById('target-umumiy').classList.toggle('nodata', !targetState.proj);
    if (!targetState.proj) {
      targetBox.append(el('div', 'lx-empty', amAdmin() ? "Hozircha target yoqilgan loyiha yo'q." : "Mas'ul loyihalaringizda target yo'q."));
      return;
    }
    const rate = new Map(r.data.map((x) => [x.kampaniya, x]));
    const mine = c.data.filter((k) => belongs(k, targetState.proj));
    const tot = tt.data.find((x) => belongs(x, targetState.proj)) || { mijoz: '', soni: 0, faol: 0, sarflandi: 0, lid: 0, cpl: 0, korish: 0, obunachi: 0 };
    const metric = (label, valueText, field, note) => {
      const m = el('div', 'lx-tm');
      m.append(el('span', 'lx-lab', label), el('div', 'lx-tv', valueText, mkt(tot.mijoz, field)));
      if (note) m.append(el('div', 'lx-note', note));
      tSum.append(m);
    };
    metric('Jami sarflandi', money(Math.round(tot.sarflandi * 100) / 100), 'sarflandi');
    metric('Jami lidlar', fmtInt(tot.lid), 'lid');
    metric("O'rtacha lid narxi", tot.lid ? money(Math.round(tot.cpl * 100) / 100) : '—', 'cpl');
    metric("Jami ko'rishlar", compact(tot.korish), 'korish');
    metric("Qo'shilgan obunachilar", fmtInt(tot.obunachi), 'obunachi');
    metric('Kampaniyalar', fmtInt(tot.soni), 'soni', tot.faol + ' tasi faol');
    tSync.textContent = syncAt ? 'Oxirgi yangilanish: ' + syncAt + ' · Meta' : '';
    if (!mine.length) {
      targetBox.append(el('div', 'lx-empty', "Bu loyiha uchun yoqilgan target yo'q."));
      return;
    }
    const cprOf = (k) => { const x = rate.get(k.kampaniya); return x && x.cpr ? x.cpr : Infinity; };
    const goalIdx = (k) => { const i = ['LID', 'Obunachi', 'Prosmotr'].indexOf(k.maqsad); return i < 0 ? 9 : i; };
    mine.sort((a, b) => (goalIdx(a) - goalIdx(b)) || (cprOf(a) - cprOf(b)) || (Number(b.sarflandi) - Number(a.sarflandi)) || String(a.kampaniya).localeCompare(String(b.kampaniya)));
    mine.forEach((k) => {
      const row = el('div', 'lx-trow');
      const cell = (cls, label, valueEl) => {
        const d = el('div', 'lx-c ' + cls, null, { 'data-label': label });
        d.append(valueEl);
        row.append(d);
        return d;
      };
      const nm = cell('lx-name', 'Kampaniya', el('span', null, k.kampaniya, mkc('campaigns', 'kampaniya', k.kampaniya)));
      const LINKS = [
        ['havola', 'Ads Manager', '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'],
        ['havola_suite', 'Meta Business Suite', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>']
      ].filter(([f]) => k[f]);
      if (LINKS.length) {
        const box = el('div', 'lx-tlinks');
        LINKS.forEach(([f, label, path]) => {
          const a = el('a', 'lx-tl', null, Object.assign({ href: k[f], target: '_blank', rel: 'noopener noreferrer', title: label + "'da ochish", 'aria-label': k.kampaniya + ' — ' + label + "'da ochish (yangi oynada)" }, mkc('campaigns', f, k.kampaniya)));
          a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
          box.append(a);
        });
        row.append(box);
      }
      nm.append(el('span', 'lx-pill lx-s-' + norm(k.holati), k.holati, mkc('campaigns', 'holati', k.kampaniya)));
      nm.append(el('span', 'lx-tgoal', 'Maqsad: ' + k.maqsad, mkc('campaigns', 'maqsad', k.kampaniya)));
      const x = rate.get(k.kampaniya) || {};
      const rc = cell('', 'Results', el('span', null, fmtInt(Number(k.natija)), mkc('campaigns', 'natija', k.kampaniya)));
      rc.append(el('div', 'lx-note', k.natijaTuri, mkc('campaigns', 'natijaTuri', k.kampaniya)));
      cell('', 'CPR', el('span', null, x.cpr ? money2(x.cpr) : '—', mkc('campaign_rates', 'cpr', k.kampaniya)));
      cell('', 'Budget', el('span', null, money(Number(k.kunlik)) + '/kun', mkc('campaigns', 'kunlik', k.kampaniya)));
      cell('', 'Amount Spent', el('span', null, money(Number(k.sarflandi)), mkc('campaigns', 'sarflandi', k.kampaniya)));
      cell('', 'Impressions', el('span', null, compact(Number(k.korish)), mkc('campaigns', 'korish', k.kampaniya)));
      cell('', 'Reach', el('span', null, compact(Number(k.qamrov)), mkc('campaigns', 'qamrov', k.kampaniya)));
      cell('', 'Hook Rate', el('span', null, x.hook ? pct1(x.hook) : '—', mkc('campaign_rates', 'hook', k.kampaniya)));
      cell('', 'Hold Rate', el('span', null, x.hold ? pct1(x.hold) : '—', mkc('campaign_rates', 'hold', k.kampaniya)));
      targetBox.append(row);
    });
  };

  // Forma yordamchilari
  const mkField = (label, input, cls, key) => {
    const f = el('div', 'lx-field' + (cls ? ' ' + cls : ''));
    f.append(el('label', null, label), input);
    if (key) input.setAttribute('data-f', key);
    return f;
  };
  // data-f belgili maydonlarni yig'adi (flajoklar guruhi -> belgilanganlar ro'yxati)
  const collectF = (sheet) => {
    const o = {};
    sheet.querySelectorAll('[data-f]').forEach((n) => {
      const k = n.getAttribute('data-f');
      if (n.classList.contains('lx-check-row')) o[k] = [...n.querySelectorAll('input:checked')].map((i) => i.getAttribute('data-val') || i.getAttribute('aria-label'));
      else o[k] = String(n.value == null ? '' : n.value).trim();
    });
    return o;
  };
  const resetSheet = (sheet) => {
    sheet.querySelectorAll('[data-f]').forEach((n) => {
      if (n.classList.contains('lx-check-row')) n.querySelectorAll('input').forEach((i) => { i.checked = false; });
      else if (n.tagName === 'SELECT') n.selectedIndex = 0;
      else n.value = '';
    });
    sheet.querySelectorAll('input[readonly]').forEach((n) => { n.value = ''; });
    const h = sheet.querySelector('.lx-hint');
    if (h) { h.textContent = ''; h.classList.remove('bad'); }
  };
  const mkInput = (type, value, ph, extra) => {
    const i = el('input', null, null, Object.assign({ type, autocomplete: 'off' }, ph ? { placeholder: ph } : {}, extra || {}));
    if (value !== undefined && value !== null) i.value = value;
    return i;
  };
  const mkArea = (value, rows, ph) => {
    const a = el('textarea', null, null, Object.assign({ rows: String(rows) }, ph ? { placeholder: ph } : {}));
    a.value = value || '';
    return a;
  };
  const mkSelect = (values, current, placeholder) => {
    const s = el('select');
    const list = current && !values.includes(current) ? [current, ...values] : values;
    if (placeholder) s.append(new Option(placeholder, ''));
    if (!list.length && !placeholder) s.append(new Option("Hozircha ro'yxat bo'sh", ''));
    s.append(...list.map((v) => new Option(v, v)));
    if (current) s.value = current;
    return s;
  };
  const mkChecks = (names, checked) => {
    const cr = el('div', 'lx-check-row');
    const on = (checked || []).map((x) => String(x).toLowerCase());
    names.forEach((t) => {
      const l = el('label', 'lx-cb');
      const cb = el('input', null, null, { type: 'checkbox', 'aria-label': ICONS[t] ? ICONS[t][0] : t, 'data-val': t });
      cb.checked = on.includes(String(t).toLowerCase());
      l.append(cb);
      l.append(ICONS[t] ? ico(t) : document.createTextNode(' ' + t));
      cr.append(l);
    });
    return cr;
  };
  const teamNames = () => accounts().map((m) => m.ism);
  const pmNames = () => accounts().filter((m) => m.lavozim === 'PM').map((m) => m.ism);
  const sheetActions = (cancelAct, okText, okAct) => {
    const a = el('div', 'lx-actions');
    a.append(
      el('span', 'lx-hint'),
      el('button', 'lx-btn', 'Bekor qilish', { type: 'button', 'data-act': cancelAct }),
      el('button', 'lx-btn primary', okText, { type: 'button', 'data-act': okAct || 'save' })
    );
    return a;
  };

  // Xavfli amal tugmasi: birinchi bosishda "Tasdiqlang", 5 soniya ichida yana bosilsa bajariladi
  const dangerBtn = (text, armedText, run) => {
    const b = el('button', 'lx-btn danger', text, { type: 'button' });
    b.addEventListener('click', () => {
      if (!b.hasAttribute('data-armed')) {
        b.setAttribute('data-armed', '1');
        b.textContent = armedText;
        setTimeout(() => { if (b.isConnected) { b.removeAttribute('data-armed'); b.textContent = text; } }, 5000);
        return;
      }
      b.disabled = true;
      run().catch(() => { b.disabled = false; });
    });
    return b;
  };

  // Kontent formasi: yangi kontent va mavjud kontent ma'lumotlari
  const stageLocked = (st) => ((st === 'Tasdiqlandi' || st === 'Ijobiy') && !(amAdmin() || isPM()));
  const mkStageSelect = (current) => {
    const sel = el('select');
    STAGE_FLOW.forEach((st) => {
      const o = new Option(st, st);
      if (stageLocked(st) && st !== current) {
        o.disabled = true;
        o.title = 'Faqat Admin yoki PM belgilaydi';
      }
      sel.append(o);
    });
    sel.value = current;
    return sel;
  };
  const buildContentForm = (c) => {
    const isNew = !c;
    const sheet = el('div', 'lx-sheet');
    sheet.hidden = true;
    sheet.append(el('h3', null, isNew ? 'Yangi kontent' : "Kontent ma'lumotlari"));
    const cur = c ? c.bosqich || "G'oya" : "G'oya";
    const stageSel = mkStageSelect(cur);
    if (!isNew && !amAdmin() && isApproved(cur)) stageSel.disabled = true;
    const ok0 = !isNew && isApproved(c.bosqich);
    const matIn = mkInput('text', c ? c.material || '' : '', 'Telegram xabar havolasi yoki #Loyiha Kontent nomi');
    const me = meRow();
    const refLink = el('a', 'lx-reflink', 'Ochish ↗', { target: '_blank', rel: 'noopener noreferrer' });
    const refIn = mkInput('url', c ? c.reference || '' : '');
    const refField = mkField('Reference', refIn, 'lx-wide');
    refField.append(refLink);
    const syncRef = () => {
      const v = String(refIn.value).trim();
      if (/^https?:\/\//i.test(v)) { refLink.href = v; refLink.hidden = false; } else { refLink.removeAttribute('href'); refLink.hidden = true; }
    };
    refIn.addEventListener('input', syncRef);
    syncRef();
    const titleIn = mkInput('text', c ? c.nomi : '', isNew ? 'Masalan, Kontent 7' : '');
    const authorSel = mkSelect(teamNames(), isNew ? (me ? me.ism : '') : c.tayyorladi);
    const catSel = mkSelect(RUBRIKALAR, c ? c.rubrika : '', 'Tanlang');
    const editorSel = mkSelect(frilans('Montajor').map((m) => m.ism), c ? c.montajor : '', 'Tanlang');
    const hookIn = mkArea(c ? c.hook : '', 2);
    const bodyIn = mkArea(c ? c.mainbody : '', 5);
    const ctaIn = mkArea(c ? c.cta : '', 2);
    const fg = el('div', 'lx-fgrid');
    fg.append(
      mkField('Kontent nomi', titleIn, 'lx-wide'),
      mkField('Tayyorladi', authorSel),
      mkField('Rubrika', catSel),
      mkField('Montajor', editorSel),
      mkField('Bosqich', stageSel),
      mkField('Hook', hookIn, 'lx-wide'),
      mkField('Main Body', bodyIn, 'lx-wide'),
      mkField('CTA', ctaIn, 'lx-wide'),
      refField
    );
    sheet.append(fg);
    const post = el('fieldset', 'lx-post');
    post.append(el('legend', null, 'Joylash'));
    const pg = el('div', 'lx-fgrid');
    const platBox = mkChecks(['instagram', 'telegram', 'youtube'], ok0 ? String(c.platformalar || '').split(',').map((x) => x.trim()) : []);
    const autoBox = mkChecks(["Belgilangan vaqtda bot o'zi joylasin"], ok0 && Number(c.avto) === 1 ? ["Belgilangan vaqtda bot o'zi joylasin"] : []);
    const dateIn = mkInput('date', ok0 ? c.joylash || '' : '', null, { min: '2000-01-01', max: '2099-12-31' });
    const timeIn = mkInput('time', ok0 ? c.vaqt || '' : '');
    pg.append(
      mkField('Platformalar', platBox),
      mkField('Telegramga avtomatik joylash', autoBox),
      mkField('Joylash sanasi', dateIn),
      mkField('Joylash vaqti', timeIn),
      mkField('Material (video yoki rasm)', matIn, 'lx-wide')
    );
    const platChecks = platBox;
    const noteBox = el('div', 'lx-pnotes lx-wide');
    const noteFields = {};
    const noteIn = {};
    ['instagram', 'telegram', 'youtube'].forEach((k) => {
      noteIn[k] = mkArea(ok0 ? c['izoh_' + k] || '' : '', 3, ICONS[k][0] + ' postining izohi (caption)');
      const f = mkField(ICONS[k][0] + ' uchun izoh', noteIn[k], 'lx-wide');
      f.querySelector('label').prepend(ico(k));
      noteFields[k] = f;
      noteBox.append(f);
    });
    const syncNotes = () => {
      const on = [...platChecks.querySelectorAll('input')].filter((i) => i.checked).map((i) => String(i.getAttribute('aria-label')).toLowerCase());
      Object.keys(noteFields).forEach((k) => { noteFields[k].classList.toggle('lx-hidden', !on.includes(k)); });
      noteBox.hidden = !on.length;
    };
    platChecks.addEventListener('change', syncNotes);
    syncNotes();
    pg.append(noteBox);
    const pst = el('div', 'lx-pstats');
    pst.append(el('span', 'lx-lab', "Platformalar bo'yicha holat"));
    const doneChk = {};
    const linkIn = {};
    ['telegram', 'instagram', 'youtube'].forEach((k) => {
      const r = el('div', 'lx-pstat');
      const nm = el('span', 'lx-pn');
      nm.append(ico(k), document.createTextNode(ICONS[k][0]));
      doneChk[k] = mkChecks(['Joylandi'], ok0 && isPosted(c, k) ? ['Joylandi'] : []);
      linkIn[k] = mkInput('url', ok0 ? c['havola_' + k] || '' : '', 'Joylangan post havolasi');
      r.append(nm, doneChk[k], linkIn[k]);
      pst.append(r);
    });
    post.append(pg, pst);
    const note = el('p', 'lx-lock');
    const lock = () => {
      const open = isApproved(stageSel.value);
      post.disabled = !open;
      const noMat = !String(matIn.value).trim();
      note.textContent = !open
        ? "Joylash faqat kontent «Tasdiqlandi» bosqichiga yetganda ochiladi."
        : noMat
          ? "Material yo'q: bot Telegramga joylay olmaydi va Instagram/YouTube eslatmasida video bo'lmaydi."
          : 'Kontent tasdiqlangan: joylash ochiq.';
    };
    matIn.addEventListener('input', lock);
    stageSel.addEventListener('change', lock);
    lock();
    const cActs = sheetActions('cancel-content', isNew ? "Qo'shish" : 'Saqlash');
    if (!isNew && amAdmin()) {
      const del = el('button', 'lx-btn danger', "Kontentni o'chirish", { type: 'button' });
      let armed = false;
      del.addEventListener('click', () => {
        const hint = cActs.querySelector('.lx-hint');
        if (!armed) {
          armed = true;
          del.textContent = 'Tasdiqlang: arxivga yuborish';
          hint.classList.remove('bad');
          hint.textContent = "Kontent o'chmaydi, Arxivga ko'chadi va keyin qaytarish mumkin.";
          return;
        }
        del.disabled = true;
        X5.mutate('POST', '/api/archive', { kind: 'content', id: c.id }, 'Kontent arxivga yuborildi', true).then(() => closeSheet(), (e) => { hint.classList.add('bad'); hint.textContent = e.message; del.disabled = false; });
      });
      cActs.prepend(del);
    }
    sheet.append(post, note, cActs);
    sheet._submit = () => {
      const title = titleIn.value.trim();
      if (!title) return 'Kontent nomini kiriting';
      const body = {
        title, author: authorSel.value, editor: editorSel.value, category: catSel.value, stage: stageSel.value,
        hook: hookIn.value, mainBody: bodyIn.value, cta: ctaIn.value, reference: refIn.value, material: matIn.value
      };
      if (isApproved(stageSel.value)) {
        const tick = (box) => [...box.querySelectorAll('input:checked')].map((i) => i.getAttribute('data-val'));
        Object.assign(body, {
          platforms: tick(platBox), autoPost: tick(autoBox).length > 0, postDate: dateIn.value, postTime: timeIn.value,
          postedOn: ['telegram', 'instagram', 'youtube'].filter((k) => tick(doneChk[k]).length),
          linkInstagram: linkIn.instagram.value, linkTelegram: linkIn.telegram.value, linkYoutube: linkIn.youtube.value,
          noteInstagram: noteIn.instagram.value, noteTelegram: noteIn.telegram.value, noteYoutube: noteIn.youtube.value
        });
      }
      if (isNew) {
        const proj = dash.params().loyiha;
        if (!proj) return 'Loyiha tanlanmagan';
        return { method: 'POST', url: '/api/contents', body: Object.assign({ project: proj }, body), ok: "Kontent qo'shildi" };
      }
      return { method: 'PATCH', url: '/api/contents/' + c.id, body, ok: 'Saqlandi' };
    };
    return sheet;
  };
  const buildContentSheet = () => buildContentForm(null);
  const buildContentDetail = (id) => {
    const ct = dash.data('contents');
    const c = ct.status === 'ok' ? ct.data.find((x) => x.id === id) : null;
    return c ? buildContentForm(c) : null;
  };

  // Loyiha ma'lumotlarini tahrirlash oynasi (faqat Admin)
  const buildProjectEdit = (name) => {
    const pf = dash.data('profiles');
    const p = (pf.status === 'ok' ? pf.data.find((r) => r.loyiha === name) : null) || {};
    const sheet = el('div', 'lx-sheet');
    sheet.hidden = true;
    sheet.append(el('h3', null, "Loyiha ma'lumotlarini tahrirlash"));
    const start = mkInput('date', p.boshlangan || '', null, { min: '2000-01-01', max: '2099-12-31' });
    const months = mkInput('number', p.muddat || '', '3', { min: '1', max: '60' });
    const end = mkInput('text', '', 'Sana va muddatni kiriting', { readonly: '', tabindex: '-1' });
    const calcEnd = () => {
      const q = String(start.value).split('-').map(Number);
      const m = parseInt(months.value, 10);
      if (q.length !== 3 || q.some((n) => isNaN(n)) || !(m > 0)) { end.value = ''; return; }
      const last = new Date(Date.UTC(q[0], q[1] - 1 + m + 1, 0)).getUTCDate();
      const d = new Date(Date.UTC(q[0], q[1] - 1 + m, Math.min(q[2], last)));
      end.value = d.getUTCDate() + '-' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    };
    start.addEventListener('input', calcEnd);
    months.addEventListener('input', calcEnd);
    calcEnd();
    const lab = (iconKey, text) => {
      const l = el('label', null, text);
      l.prepend(ico(iconKey));
      return l;
    };
    const fg = el('div', 'lx-fgrid');
    const withIcon = (iconKey, text, input, key) => {
      const f = el('div', 'lx-field');
      f.append(lab(iconKey, text), input);
      if (key) input.setAttribute('data-f', key);
      return f;
    };
    start.setAttribute('data-f', 'contractStart');
    months.setAttribute('data-f', 'contractMonths');
    fg.append(
      mkField("Mas'ul PM", mkChecks(pmNames(), splitList(p.pm)), 'lx-wide', 'pms'),
      mkField('Loyiha holati', mkSelect(['Faol', 'Muzlatilgan', 'Tugagan'], p.holat || 'Faol'), null, 'status'),
      mkField('Shartnoma boshlangan sana', start),
      mkField('Muddat (oy)', months),
      mkField('Tugash sanasi (avtomatik)', end),
      mkField('Kontentlar soni', mkInput('number', p.kontentlar != null ? p.kontentlar : '', '30', { min: '0' }), null, 'planTotal'),
      mkField('Targetga kontentlar soni (ixtiyoriy)', mkInput('number', p.targetga != null ? p.targetga : '', '15', { min: '0' }), null, 'targetPlan'),
      mkField('Loyiha egasi: ism-familya', mkInput('text', p.ega || '', 'Ism Familya'), null, 'ownerName'),
      withIcon('phone', 'Telefon raqami', mkInput('tel', p.ega_telefon || '', '+998 90 123 45 67'), 'ownerPhone'),
      withIcon('telegram', 'Username', mkInput('text', p.ega_telegram || '', '@username'), 'ownerTelegram'),
      withIcon('instagram', "Username (agar bo'lsa)", mkInput('text', p.ega_instagram || '', '@username'), 'ownerInstagram'),
      (() => {
        const h = el('div', 'lx-field lx-wide lx-sechead');
        h.append(el('label', null, 'Ijtimoiy tarmoqlar va qamrov'), el('p', 'lx-hint2', "Faqat biz yuritadigan tarmoqlarni to'ldiring: sahifa havolasi va loyiha olingan paytdagi obunachilar soni. Hozirgi son shu havola orqali har kuni avtomatik yangilanadi."));
        return h;
      })(),
      withIcon('instagram', 'Instagram sahifa havolasi', mkInput('text', p.ig_havola || '', 'instagram.com/nom yoki @nom'), 'igLink'),
      withIcon('instagram', 'Instagram obunachilari', mkInput('number', p.ig_boshlang != null ? p.ig_boshlang : '', '12000', { min: '0' }), 'igStart'),
      withIcon('telegram', 'Telegram kanal havolasi', mkInput('text', p.tg_havola || '', 't.me/nom yoki @nom'), 'tgLink'),
      withIcon('telegram', 'Telegram obunachilari', mkInput('number', p.tg_boshlang != null ? p.tg_boshlang : '', '3000', { min: '0' }), 'tgStart'),
      withIcon('youtube', 'YouTube kanal havolasi', mkInput('text', p.yt_havola || '', 'youtube.com/@nom'), 'ytLink'),
      withIcon('youtube', 'YouTube obunachilari', mkInput('number', p.yt_boshlang != null ? p.yt_boshlang : '', '1000', { min: '0' }), 'ytStart'),
      mkField("Oylik qamrov (ko'rishlar soni)", mkInput('number', p.oxvat_boshlang != null ? p.oxvat_boshlang : '', '150000', { min: '0' }), null, 'reachStart'),
      (() => {
        const h = el('div', 'lx-field lx-wide lx-sechead');
        h.append(el('label', null, "Target ma'lumot manbasi"), el('p', 'lx-hint2', "Kampaniyalar va ko'rsatkichlar (Amount Spent, Results, Hook, Hold) shu manbadan olinadi. Token va parollar bu yerga yozilmaydi — ular serverda xavfsiz saqlanadi."));
        return h;
      })(),
      mkField('Manba', mkSelect(["Meta Ads API", "Google Sheets", "Boshqa API", "Qo'lda kiritaman"], p.manba || "Meta Ads API"), null, 'adsSource'),
      mkField('Reklama akkaunti ID (act_...) yoki havola', mkInput('text', p.akkaunt || '', 'act_1234567890'), null, 'adAccount'),
      mkField('Business portfolio nomi (ixtiyoriy)', mkInput('text', p.portfolio || '', 'Masalan, Mijoz Portfolio'), null, 'portfolio')
    );
    sheet.append(fg);
    if (p.id) {
      const dz = el('div', 'lx-dz');
      dz.append(
        el('label', null, 'Loyihani arxivlash'),
        el('p', 'lx-hint2', "Arxivlangan loyiha ro'yxatlardan, eslatmalar va reklama yangilanishidan yashiriladi; kontent va syomkalari saqlanadi. Arxiv → Loyihalar bo'limidan qaytarish yoki butunlay o'chirish mumkin.")
      );
      const row = el('div', 'lx-dzrow');
      row.append(dangerBtn('Arxivga yuborish', 'Tasdiqlang', () => X5.mutate('POST', '/api/archive', { kind: 'project', id: p.id }, 'Loyiha arxivga yuborildi').then(() => { closeSheet(); showPage('loyihalar', true); })));
      dz.append(row);
      sheet.append(dz);
    }
    sheet.append(sheetActions('cancel-content', 'Saqlash'));
    sheet._submit = () => {
      if (!p.id) return 'Loyiha topilmadi';
      return { method: 'PATCH', url: '/api/projects/' + p.id, body: collectF(sheet), ok: 'Loyiha saqlandi' };
    };
    return sheet;
  };

  // Joylash ustuni: sana va platformalar
  const joylashCell = (c) => {
    const box = el('div', 'lx-jcell');
    if (!isApproved(c.bosqich) || !c.joylash) {
      box.append(el('span', 'lx-due', '—'));
      return box;
    }
    box.append(el('span', null, fmtDay(c.joylash) + (c.vaqt ? ', ' + c.vaqt : ''), mki('contents', 'joylash', c.id)));
    const pr = el('div', 'lx-plats');
    const plats = String(c.platformalar || '').split(',').map((x) => x.trim()).filter(Boolean);
    plats.forEach((p) => {
      const k = p.toLowerCase();
      const isAuto = Number(c.avto) === 1 && k === 'telegram';
      const noMatP = !String(c.material || '').trim() && c.bosqich !== 'Post Joylandi';
      const pc = el('span', 'lx-plat' + (isAuto ? ' auto' : '') + (noMatP ? ' nomat' : ''), null, { title: p + (noMatP ? ": material yo'q" : isAuto ? ": bot o'zi joylaydi" : '') });
      pc.append(ICONS[k] ? ico(k) : document.createTextNode(p));
      pr.append(pc);
    });
    box.append(pr);
    return box;
  };

  const drawDetail = () => {
    detailBox.replaceChildren();
    const name = dash.params().loyiha;
    if (!name) return;
    const sets = ['projects', 'profiles', 'contents', 'project_stats'].map((id) => dash.data(id));
    if (sets.some((d) => d.status === 'loading')) {
      skeleton(detailBox);
      return;
    }
    if (sets.some((d) => d.status !== 'ok')) {
      detailBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const [pr, pf, ct, ps] = sets;
    const proj = pr.data.find((r) => r.loyiha === name);
    if (!proj) {
      detailBox.append(el('div', 'lx-empty', 'Loyiha topilmadi.'));
      return;
    }
    if (!canProj(name)) {
      detailBox.append(el('div', 'lx-empty', "Bu loyiha sizga biriktirilmagan. Faqat mas'ul loyihalaringizni ko'ra olasiz."));
      return;
    }
    const prof = pf.data.find((r) => r.loyiha === name);
    const items = ct.data.filter((r) => r.loyiha === name).sort((a, b) => Number(a.tartib) - Number(b.tartib));
    const stat = ps.data.find((r) => r.loyiha === name) || { kontent: 0, rekda: 0, target: 0 };

    detailBox.append(el('h1', null, proj.loyiha, mk('projects', 'loyiha', proj.loyiha)));

    const tiles = el('section', 'lx-tiles');
    const note = (value, src, field, suffix) => {
      const n = el('div', 'lx-note');
      n.append(el('span', null, fmtInt(value), mk(src, field, name)));
      n.append(document.createTextNode(suffix));
      return n;
    };
    const tile = (label, valueNode, noteNode) => {
      const t = el('div', 'lx-tile');
      t.append(el('div', 'lx-lab', label), valueNode);
      if (noteNode) t.append(noteNode);
      tiles.append(t);
    };
    tile('Kontentlar', el('div', 'lx-big', fmtInt(stat.kontent), mk('project_stats', 'kontent', name)), prof && prof.kontentlar !== undefined && prof.kontentlar !== '' && isFinite(Number(prof.kontentlar)) ? note(prof.kontentlar, 'profiles', 'kontentlar', ' ta rejadan') : null);
    tile('Rekda', el('div', 'lx-big n-gold', fmtInt(stat.rekda), mk('project_stats', 'rekda', name)));
    tile('Targetga', el('div', 'lx-big', fmtInt(stat.target), mk('project_stats', 'target', name)), prof && prof.targetga !== undefined && prof.targetga !== '' && isFinite(Number(prof.targetga)) ? note(prof.targetga, 'profiles', 'targetga', ' ta rejadan') : null);
    detailBox.append(tiles);

    // Loyiha ma'lumotlari kartasi
    const pi = dash.data('project_info');
    const piRow = pi.status === 'ok' ? pi.data.find((r) => r.loyiha === name) : null;
    const pget = (f) => (prof && prof[f] !== undefined && prof[f] !== '' ? prof[f] : null);
    const fmtFull = (iso) => {
      const p = String(iso).split('-').map(Number);
      return p.length === 3 && p[1] >= 1 && p[1] <= 12 ? p[2] + '-' + MONTHS[p[1] - 1] + ' ' + p[0] : String(iso);
    };
    const infoPanel = el('div', 'lx-ptab');
    const contentPanel = el('div', 'lx-ptab');
    if (ptab.name !== name) Object.assign(ptab, { name, tab: 'kontent' });
    const mountTabs = () => {
      const bar = el('div', 'lx-seg lx-ptabs', null, { role: 'tablist' });
      const defs = [['kontent', 'Kontentlar', contentPanel], ['info', "Loyiha ma'lumotlari", infoPanel]];
      const btns = [];
      const apply = () => defs.forEach(([k, , p], i) => {
        const on = ptab.tab === k;
        btns[i].setAttribute('aria-selected', String(on));
        p.hidden = !on;
      });
      defs.forEach(([k, t]) => {
        const b = el('button', null, t, { type: 'button', role: 'tab' });
        b.addEventListener('click', () => { ptab.tab = k; apply(); });
        btns.push(b);
        bar.append(b);
      });
      apply();
      detailBox.append(bar, contentPanel, infoPanel);
    };
    const pcard = el('div', 'lx-pcols');
    const group = (title) => {
      const g = el('div', 'lx-pinfo');
      g.append(el('div', 'lx-pgt', title));
      const gr = el('div', 'lx-pgrid');
      g.append(gr);
      pcard.append(g);
      return gr;
    };
    const item = (grid, label, text, attrs, iconKey) => {
      const d = el('div', 'lx-pk');
      const l = el('div', 'lx-pl');
      if (iconKey) l.append(ico(iconKey));
      else l.textContent = label;
      d.append(l, el('div', 'lx-pv', text == null ? '—' : text, text == null ? null : attrs));
      grid.append(d);
    };
    const g1 = group('Shartnoma');
    item(g1, 'Boshlangan sana', pget('boshlangan') ? fmtFull(pget('boshlangan')) : null, mk('profiles', 'boshlangan', name));
    item(g1, 'Muddati', pget('muddat') ? pget('muddat') + ' oy' : null, mk('profiles', 'muddat', name));
    item(g1, 'Tugash sanasi (avtomatik)', piRow && piRow.tugash ? fmtFull(piRow.tugash) : null, mk('project_info', 'tugash', name));
    item(g1, "Mas'ul PM", pget('pm'), mk('profiles', 'pm', name));
    item(g1, 'Kontentlar soni', pget('kontentlar') != null ? fmtInt(pget('kontentlar')) : null, mk('profiles', 'kontentlar', name));
    item(g1, 'Targetga kontentlar', pget('targetga') != null ? fmtInt(pget('targetga')) : null, mk('profiles', 'targetga', name));
    const g2 = group('Loyiha egasi');
    item(g2, 'Ism-familya', pget('ega'), mk('profiles', 'ega', name));
    item(g2, 'Telefon', pget('ega_telefon'), mk('profiles', 'ega_telefon', name), 'phone');
    item(g2, 'Telegram', pget('ega_telegram'), mk('profiles', 'ega_telegram', name), 'telegram');
    if (pget('ega_instagram')) item(g2, 'Instagram', pget('ega_instagram'), mk('profiles', 'ega_instagram', name), 'instagram');
    const isAdmin = amAdmin();
    const ph = el('div', 'lx-ptabhead');
    if (isAdmin) ph.append(el('button', 'lx-btn', 'Tahrirlash', { type: 'button', 'data-act': 'edit-project' }));
    else ph.append(document.createTextNode("Loyiha ma'lumotlarini faqat Admin tahrirlay oladi"));
    infoPanel.append(ph, pcard);

    // Bo'sh loyiha: kontent yo'q, ko'rsatkichlar 0, yangi kontent qo'shish tugmasi (namuna)
    if (!items.length) {
      const box = el('div', 'lx-emptybox');
      box.append(el('div', 'lx-empty', "Bu loyihada hali kontent yo'q."));
      box.append(el('button', 'lx-btn primary', "+ Yangi kontent qo'shish", { type: 'button', 'data-act': 'toggle-content' }));
      contentPanel.append(box);
      mountTabs();
      return;
    }

    const grid = el('div', 'lx-dgrid');


    const right = el('section', 'lx-board');
    const list = el('div', 'lx-list');

    // Filtr va saralash holati (loyiha almashganda tiklanadi)
    const fs = detailState;
    if (fs.name !== name) Object.assign(fs, { name, stage: '', person: '', plat: '', key: 'tartib', dir: 1 });
    const stageNames = [...new Set(items.map((c) => c.bosqich))].sort((a, b) => stageIdx(a) - stageIdx(b));
    const people = [...new Set(items.map((c) => c.tayyorladi))].sort((a, b) => String(a).localeCompare(String(b)));
    if (!stageNames.includes(fs.stage)) fs.stage = '';
    if (!people.includes(fs.person)) fs.person = '';

    const filters = el('div', 'lx-filters');
    const selStage = el('select', null, null, { 'aria-label': "Bosqich bo'yicha filtr" });
    selStage.append(new Option('Bosqich', ''), ...stageNames.map((s) => new Option('Bosqich: ' + s, s)));
    selStage.value = fs.stage;
    const selPerson = el('select', null, null, { 'aria-label': "Tayyorladi bo'yicha filtr" });
    selPerson.append(new Option('Tayyorladi', ''), ...people.map((p) => new Option('Tayyorladi: ' + p, p)));
    selPerson.value = fs.person;
    const selPlat = el('select', null, null, { 'aria-label': "Platformalar bo'yicha filtr" });
    selPlat.append(new Option('Platformalar', ''), ...['instagram', 'telegram', 'youtube'].map((k) => new Option('Platformalar: ' + ICONS[k][0], k)));
    selPlat.value = fs.plat || '';
    const cntPlat = el('span', 'lx-fcount', '0', { 'aria-live': 'polite' });
    const wrapPlat = el('span', 'lx-fwrap');
    wrapPlat.append(selPlat, cntPlat);
    const cntStage = el('span', 'lx-fcount', '0', { 'aria-live': 'polite' });
    const cntPerson = el('span', 'lx-fcount', '0', { 'aria-live': 'polite' });
    const wrapStage = el('span', 'lx-fwrap');
    wrapStage.append(selStage, cntStage);
    const wrapPerson = el('span', 'lx-fwrap');
    wrapPerson.append(selPerson, cntPerson);
    const selSet = exportSel[name] || (exportSel[name] = new Set());
    let shownIds = [];
    const selAllBtn = el('button', 'lx-btn lx-fsel', 'Hammasini belgilash', { type: 'button' });
    const expBtn = el('button', 'lx-btn lx-fexport', null, { type: 'button', title: 'Kontentlarni PDF, CSV yoki Excel ko\'rinishida yuklab olish' });
    const expCnt = el('span', 'lx-fcount', '0');
    expBtn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>');
    expBtn.append(document.createTextNode('Export'), expCnt);
    const syncSel = () => {
      const n = items.filter((c) => selSet.has(c.id)).length;
      expCnt.textContent = String(n);
      expCnt.hidden = n === 0;
      const all = shownIds.length > 0 && shownIds.every((id) => selSet.has(id));
      selAllBtn.textContent = all ? 'Belgilashni bekor qilish' : 'Hammasini belgilash';
      selAllBtn.hidden = n === 0;
    };
    const impBtn = el('button', 'lx-btn lx-fexport', null, { type: 'button', title: "Excel yoki CSV fayldan kontentlarni ko'plab qo'shish" });
    impBtn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>');
    impBtn.append(document.createTextNode('Import'));
    filters.append(wrapStage, wrapPerson, wrapPlat, selAllBtn, expBtn, impBtn, el('button', 'lx-btn primary', '+ Yangi kontent', { type: 'button', 'data-act': 'toggle-content' }));
    list.classList.add('lx-contentcard');
    list.append(filters);

    const head = el('div', 'lx-chead');
    const sortBtns = [];
    [['nomi', 'Kontent nomi'], ['tayyorladi', 'Tayyorladi'], ['rubrika', 'Rubrika'], ['montajor', 'Montajor'], ['bosqich', 'Bosqich']].forEach(([k, t]) => {
      const d = el('div');
      const b = el('button', 'lx-sort', t, { type: 'button' });
      b.setAttribute('data-key', k);
      sortBtns.push(b);
      d.append(b);
      head.append(d);
    });
    ['Joylash', 'Rekda', 'Target'].forEach((t) => head.append(el('div', null, t)));
    list.append(head);
    const body = el('div');
    list.append(body);

    const pos = (c) => {
      const o = fs.orders[name];
      const i = o ? o.indexOf(c.id) : -1;
      return i < 0 ? 1e6 + Number(c.tartib) : i;
    };
    const cmp = {
      tartib: (a, b) => (stageIdx(a.bosqich) - stageIdx(b.bosqich)) || (pos(a) - pos(b)),
      nomi: (a, b) => String(a.nomi).localeCompare(String(b.nomi), undefined, { numeric: true }),
      tayyorladi: (a, b) => String(a.tayyorladi).localeCompare(String(b.tayyorladi)),
      rubrika: (a, b) => String(a.rubrika || '').localeCompare(String(b.rubrika || '')),
      montajor: (a, b) => String(a.montajor || '').localeCompare(String(b.montajor || '')),
      bosqich: (a, b) => stageIdx(a.bosqich) - stageIdx(b.bosqich)
    };
    const renderBody = () => {
      body.replaceChildren();
      sortBtns.forEach((b) => {
        if (b.getAttribute('data-key') === fs.key) b.setAttribute('data-dir', fs.dir > 0 ? 'asc' : 'desc');
        else b.removeAttribute('data-dir');
      });
      const shown = items
        .filter((c) => (!fs.stage || c.bosqich === fs.stage) && (!fs.person || c.tayyorladi === fs.person) && (!fs.plat || platKeys(c).includes(fs.plat)))
        .sort((a, b) => cmp[fs.key](a, b) * fs.dir);
      cntStage.hidden = !fs.stage;
      cntPerson.hidden = !fs.person;
      cntPlat.hidden = !fs.plat;
      cntStage.textContent = cntPerson.textContent = cntPlat.textContent = String(shown.length);
      shownIds = shown.map((c) => c.id);
      const canDrag = fs.key === 'tartib' && fs.dir === 1 && !fs.stage && !fs.person && !fs.plat;
      const saveOrder = () => {
        fs.orders[name] = [...body.querySelectorAll('.lx-crow')].map((r) => r.getAttribute('data-content'));
        X5.mutate('PUT', '/api/contents/order', { project: name, ids: fs.orders[name] }).catch(() => X5.reload());
      };
      if (!items.length) body.append(el('div', 'lx-empty', 'Kontentlar hali kiritilmagan.'));
      else if (!shown.length) body.append(el('div', 'lx-empty', "Filtrga mos kontent yo'q."));
      shown.forEach((c) => {
        const row = el('div', 'lx-crow lx-link', null, { 'data-content': c.id, 'data-stage': c.bosqich, role: 'button', tabindex: '0' });
        const cell = (cls, label, node) => {
          const d = el('div', 'lx-c ' + cls, null, { 'data-label': label });
          d.append(node);
          row.append(d);
        };
        const check = flagCheck;
        const nameBox = el('span', 'lx-nm');
        if (canDrag) {
          const grip = el('span', 'lx-grip', null, { tabindex: '0', role: 'button', 'aria-label': "Tartibni o'zgartirish (yuqoriga yoki pastga)", title: "Sudrab tartibni o'zgartiring" });
          grip.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
          grip.addEventListener('mousedown', () => { row.draggable = true; });
          grip.addEventListener('mouseup', () => { row.draggable = false; });
          grip.addEventListener('keydown', (ev) => {
            if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
            ev.preventDefault();
            ev.stopPropagation();
            const sib = ev.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
            if (!sib || !sib.classList.contains('lx-crow') || sib.getAttribute('data-stage') !== c.bosqich) return;
            body.insertBefore(row, ev.key === 'ArrowUp' ? sib : sib.nextSibling);
            saveOrder();
            grip.focus();
          });
          row.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', c.id);
            row.classList.add('dragging');
          });
          row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            row.draggable = false;
            saveOrder();
          });
          nameBox.append(grip);
        }
        const isOn = selSet.has(c.id);
        const selBox = el('span', 'lx-check lx-sel' + (isOn ? ' on' : ''), isOn ? '✓' : '', { role: 'checkbox', tabindex: '0', 'aria-checked': String(isOn), 'aria-label': 'Export uchun belgilash: ' + c.nomi, 'data-sel': c.id });
        row.classList.toggle('sel', isOn);
        const flipSel = () => {
          const on = !selSet.has(c.id);
          if (on) selSet.add(c.id); else selSet.delete(c.id);
          selBox.classList.toggle('on', on);
          selBox.textContent = on ? '✓' : '';
          selBox.setAttribute('aria-checked', String(on));
          row.classList.toggle('sel', on);
          syncSel();
        };
        selBox.addEventListener('click', (ev) => { ev.stopPropagation(); flipSel(); });
        selBox.addEventListener('keydown', (ev) => {
          if (ev.key !== ' ' && ev.key !== 'Enter') return;
          ev.preventDefault();
          ev.stopPropagation();
          flipSel();
        });
        nameBox.append(selBox);
        nameBox.append(el('span', null, c.nomi, mki('contents', 'nomi', c.id)));
        cell('lx-name', 'Kontent nomi', nameBox);
        cell('', 'Tayyorladi', chip(c.tayyorladi, colorFor(c.tayyorladi), mki('contents', 'tayyorladi', c.id)));
        cell('', 'Rubrika', el('span', null, c.rubrika || '—', mki('contents', 'rubrika', c.id)));
        cell('', 'Montajor', el('span', null, c.montajor || '—', mki('contents', 'montajor', c.id)));
        cell('', 'Bosqich', chip(c.bosqich, stageColor(c.bosqich), mki('contents', 'bosqich', c.id)));
        cell('', 'Joylash', joylashCell(c));
        cell('lx-ck', 'Rekda', check(c, 'rekda', 'Rekda'));
        cell('lx-ck', 'Target', check(c, 'target', 'Target'));
        body.append(row);
      });
      syncSel();
    };
    body.addEventListener('dragover', (ev) => {
      const dragging = body.querySelector('.lx-crow.dragging');
      if (!dragging) return;
      ev.preventDefault();
      const t = ev.target.closest('.lx-crow');
      if (!t || t === dragging || t.getAttribute('data-stage') !== dragging.getAttribute('data-stage')) return;
      const r = t.getBoundingClientRect();
      body.insertBefore(dragging, ev.clientY > r.top + r.height / 2 ? t.nextSibling : t);
    });
    const buildExportSheet = () => {
      const nSel = items.filter((c) => selSet.has(c.id)).length;
      const filtered = !!(fs.stage || fs.person);
      const nShown = shownIds.length;
      const sheet = el('div', 'lx-sheet');
      sheet.hidden = true;
      sheet.append(el('h3', null, 'Kontentlarni export qilish'));
      const fg = el('div', 'lx-fgrid');
      const which = [['sel', 'Belgilanganlar (' + nSel + ')', nSel > 0]];
      if (filtered) which.push(['shown', 'Filtrdagi kontentlar (' + nShown + ')', nShown > 0]);
      which.push(['all', 'Loyihaning barcha kontentlari (' + items.length + ')', true]);
      const firstOn = nSel > 0 ? 'sel' : filtered ? 'shown' : 'all';
      const wbox = el('div', 'lx-xopt');
      which.forEach(([v, t, ok]) => {
        const l = el('label', 'lx-cb' + (ok ? '' : ' off'));
        const r = el('input', null, null, { type: 'radio', name: 'exp-which', value: v });
        r.checked = v === firstOn;
        r.disabled = !ok;
        l.append(r, document.createTextNode(' ' + t));
        wbox.append(l);
      });
      let fmt = 'PDF';
      const fseg = el('div', 'lx-seg lx-xfmt', null, { role: 'group', 'aria-label': 'Format' });
      const FMTS = [['PDF', 'pdf'], ['CSV', 'csv'], ['Excel', 'xlsx']];
      FMTS.forEach(([t]) => {
        const b = el('button', null, t, { type: 'button', 'aria-pressed': String(t === fmt) });
        b.addEventListener('click', () => {
          fmt = t;
          fseg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        fseg.append(b);
      });
      const COLS = ['Kontent nomi', 'Tayyorladi', 'Rubrika', 'Bosqich', 'Joylash vaqti', 'Platformalar', 'Material havolasi', 'Rekda', 'Target', 'Hook', 'Main Body', 'CTA', 'Reference'];
      const checks = mkChecks(COLS, COLS.slice(0, 9));
      checks.style.flexWrap = 'wrap';
      checks.style.gap = '.25rem 1.1rem';
      fg.append(mkField('Qaysi kontentlar', wbox, 'lx-wide'), mkField('Format', fseg), mkField('Ustunlar', checks, 'lx-wide'));
      const act = el('div', 'lx-actions');
      const hint = el('span', 'lx-hint');
      const go = el('button', 'lx-btn primary', 'Yuklab olish', { type: 'button' });
      go.addEventListener('click', () => {
        const pick = sheet.querySelector('input[name="exp-which"]:checked');
        const v = pick ? pick.value : 'all';
        const ext = FMTS.find((f) => f[0] === fmt)[1];
        const cols = [...checks.querySelectorAll('input[type=checkbox]')].filter((x) => x.checked).map((x) => x.getAttribute('data-val'));
        if (!cols.length) { hint.classList.add('bad'); hint.textContent = 'Kamida bitta ustunni tanlang'; return; }
        const ids = v === 'sel' ? items.filter((c) => selSet.has(c.id)).map((c) => c.id) : v === 'shown' ? shownIds.slice() : undefined;
        go.disabled = true;
        hint.classList.remove('bad');
        hint.textContent = 'Tayyorlanmoqda…';
        X5.download('POST', '/api/export/contents', { project: name, ids, columns: cols, format: ext }, name + '-kontentlar.' + ext)
          .then(() => { closeSheet(); toast('Fayl yuklab olindi'); })
          .catch((e) => { hint.classList.add('bad'); hint.textContent = e.message; go.disabled = false; });
      });
      act.append(hint, el('button', 'lx-btn', 'Bekor qilish', { type: 'button', 'data-act': 'cancel-export' }), go);
      sheet.append(fg, act);
      return sheet;
    };
    expBtn.addEventListener('click', () => openSheet(buildExportSheet()));
    const buildImportSheet = () => {
      const sheet = el('div', 'lx-sheet');
      sheet.hidden = true;
      sheet.append(el('h3', null, 'Kontentlarni fayldan yuklash'));
      const info = el('p', 'lx-hint', 'Excel (.xlsx) yoki CSV fayl. Birinchi qator — sarlavha. «Kontent nomi» ustuni majburiy; qolgan ustunlar: Tayyorladi, Rubrika, Bosqich, Hook, Main Body, CTA, Reference, Material havolasi. Bir martada 500 tagacha qator.');
      const tpl = el('div', 'lx-actions');
      const a1 = el('button', 'lx-btn', 'Namuna (Excel)', { type: 'button' });
      const a2 = el('button', 'lx-btn', 'Namuna (CSV)', { type: 'button' });
      a1.addEventListener('click', () => X5.download('GET', '/api/export/template?format=xlsx', undefined, 'kontent-namuna.xlsx').catch((e) => toast(e.message)));
      a2.addEventListener('click', () => X5.download('GET', '/api/export/template?format=csv', undefined, 'kontent-namuna.csv').catch((e) => toast(e.message)));
      tpl.append(a1, a2);
      const file = el('input', null, null, { type: 'file', accept: '.xlsx,.csv,.txt' });
      const res = el('div', 'lx-hint');
      const act = el('div', 'lx-actions');
      const hint = el('span', 'lx-hint');
      const go = el('button', 'lx-btn primary', 'Yuklash', { type: 'button' });
      go.addEventListener('click', () => {
        const f = file.files && file.files[0];
        if (!f) { hint.classList.add('bad'); hint.textContent = 'Avval fayl tanlang'; return; }
        if (f.size > 3 * 1024 * 1024) { hint.classList.add('bad'); hint.textContent = 'Fayl 3 MB dan oshmasligi kerak'; return; }
        go.disabled = true;
        hint.classList.remove('bad');
        hint.textContent = 'Yuklanmoqda…';
        res.textContent = '';
        X5.readFile(f)
          .then((data) => X5.api('POST', '/api/import/contents', { project: name, filename: f.name, data }))
          .then((r) => X5.reload().then(() => {
            hint.textContent = r.added + ' ta kontent qo\'shildi' + (r.failed.length ? ', ' + r.failed.length + ' ta qator o\'tmadi' : '');
            res.textContent = r.failed.slice(0, 15).map((x) => x.row + '-qator: ' + x.error).join('\n') + (r.failed.length > 15 ? '\n…' : '');
            res.style.whiteSpace = 'pre-wrap';
            if (!r.failed.length) { closeSheet(); toast(r.added + ' ta kontent qo\'shildi'); }
          }))
          .catch((e) => { hint.classList.add('bad'); hint.textContent = e.message; })
          .then(() => { go.disabled = false; });
      });
      act.append(hint, el('button', 'lx-btn', 'Yopish', { type: 'button', 'data-act': 'cancel-import' }), go);
      sheet.append(info, tpl, file, res, act);
      return sheet;
    };
    impBtn.addEventListener('click', () => openSheet(buildImportSheet()));
    selAllBtn.addEventListener('click', () => {
      const all = shownIds.length > 0 && shownIds.every((id) => selSet.has(id));
      shownIds.forEach((id) => { if (all) selSet.delete(id); else selSet.add(id); });
      renderBody();
    });
    selStage.addEventListener('change', () => { fs.stage = selStage.value; renderBody(); });
    selPerson.addEventListener('change', () => { fs.person = selPerson.value; renderBody(); });
    selPlat.addEventListener('change', () => { fs.plat = selPlat.value; renderBody(); });
    sortBtns.forEach((b) => b.addEventListener('click', () => {
      const k = b.getAttribute('data-key');
      if (fs.key === k) fs.dir = -fs.dir;
      else { fs.key = k; fs.dir = 1; }
      renderBody();
    }));
    renderBody();
    right.append(list);
    grid.append(right);
    contentPanel.append(grid);
    mountTabs();
  };

  const mkm = (src, field, key) => ({ 'data-source': src, 'data-field': field, 'data-where': 'ism=' + enc(key) });
  const tmk = (m, field) => (teamAdded.includes(m) ? {} : mkm('team', field, m._key));
  const avatar = (name, big) => el('span', 'lx-avatar' + (big ? ' big' : ''), String(name || '?').trim().charAt(0).toUpperCase(), { 'aria-hidden': 'true' });
  const roleColor = (rol) => (String(rol).toLowerCase() === 'admin' ? 'var(--lx-blue)' : 'var(--color-fg)');
  const acctAv = document.querySelector('.lx-acct-av');
  const acctName = document.querySelector('.lx-acct-name');
  const memRows = document.querySelector('.lx-memrows');
  const frilRows = document.querySelector('.lx-frilrows');
  const memberBox = document.querySelector('.lx-member');
  const toast = (text, ms) => {
    root.querySelectorAll('.lx-toast').forEach((n) => n.remove());
    const t = el('div', 'lx-toast', text);
    root.append(t);
    setTimeout(() => t.remove(), ms || 2200);
  };

  // Hisob chipi va menyu
  const drawAcct = () => {
    const t = dash.data('team');
    if (t.status !== 'ok' || !accounts().length) {
      acctAv.classList.toggle('dash-skeleton', t.status === 'loading');
      return;
    }
    const me = meRow();
    acctAv.classList.remove('dash-skeleton');
    acctAv.textContent = String(me.ism).trim().charAt(0).toUpperCase();
    acctName.textContent = me.ism;
    Object.entries(tmk(me, 'ism')).forEach(([k, v]) => acctName.setAttribute(k, v));
    acctName.setAttribute('data-me', me._key);
    document.querySelector('.lx-acct-role').textContent = amAdmin() ? 'Admin' : (me.lavozim || "A'zo");
    menu.replaceChildren(
      el('button', null, 'Mening sahifam', { type: 'button', role: 'menuitem', 'data-act': 'go-me' }),
      el('hr'),
      el('button', null, 'Chiqish', { type: 'button', role: 'menuitem', 'data-act': 'go-login' })
    );
    const pm = document.getElementById('proj-new-pm');
    if (pm) pm.replaceChildren(...mkChecks(pmNames(), []).children);
  };

  // A'zoning loyihalari: PM bo'lgan yoki unga biriktirilgan loyihalar
  const memberProjects = (key) => {
    const set = new Set();
    const pf = dash.data('profiles');
    if (pf.status === 'ok') pf.data.filter((p) => splitList(p.pm).includes(key)).forEach((p) => set.add(p.loyiha));
    const m = accounts().find((x) => x._key === key);
    if (m) splitList(m.loyihalar).forEach((n) => set.add(n));
    return [...set].sort((a, b) => String(a).localeCompare(String(b)));
  };

  const drawTeam = () => {
    const t = dash.data('team');
    memRows.replaceChildren();
    frilRows.replaceChildren();
    if (t.status === 'loading') {
      skeleton(memRows);
      skeleton(frilRows);
      return;
    }
    if (t.status !== 'ok') {
      memRows.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const admin = amAdmin();
    const me = meRow();
    accounts().forEach((m) => {
      const open = admin || (me && m._key === me._key);
      const row = el('div', 'lx-mrow' + (open ? ' lx-link' : ''), null, open ? { 'data-member': m._key, role: 'link', tabindex: '0' } : {});
      const who = el('div', 'lx-c lx-who');
      who.append(avatar(m.ism), el('span', null, m.ism, tmk(m, 'ism')));
      row.append(who);
      row.append(el('div', 'lx-c', m.lavozim || '—', Object.assign({ 'data-label': 'Lavozim' }, m.lavozim ? tmk(m, 'lavozim') : {})));
      const rc = el('div', 'lx-c', null, { 'data-label': 'Rol' });
      rc.append(chip(m.rol, roleColor(m.rol), tmk(m, 'rol'))); rc.firstChild.classList.add('soft');
      row.append(rc);
      const projs = memberProjects(m._key);
      row.append(el('div', 'lx-c lx-projs', projs.length ? projs.join(', ') : '—', { 'data-label': 'Loyihalar' }));
      row.append(el('div', 'lx-c', m.telefon || '—', Object.assign({ 'data-label': 'Telefon' }, m.telefon ? tmk(m, 'telefon') : {})));
      row.append(el('div', 'lx-c', m.telegram || '—', Object.assign({ 'data-label': 'Telegram' }, m.telegram ? tmk(m, 'telegram') : {})));
      row.append(el('span', 'lx-chev', open ? '›' : ''));
      memRows.append(row);
    });
    const KASB = ['Videograph', 'Montajor', 'Brandface'];
    const fl = frilans().sort((a, b) => (KASB.indexOf(a.lavozim) - KASB.indexOf(b.lavozim)) || String(a.ism).localeCompare(String(b.ism)));
    if (!fl.length) frilRows.append(el('div', 'lx-empty', "Hozircha frilans yo'q."));
    fl.forEach((m) => {
      const row = el('div', 'lx-frow' + (admin ? ' lx-link' : ''), null, admin ? { 'data-frilans': m._key, role: 'button', tabindex: '0' } : {});
      const who = el('div', 'lx-c lx-who');
      who.append(avatar(m.ism), el('span', null, m.ism, tmk(m, 'ism')));
      row.append(who);
      const kc = el('div', 'lx-c', null, { 'data-label': 'Kasbi' });
      kc.append(chip(m.lavozim || '—', 'var(--color-fg)', m.lavozim ? tmk(m, 'lavozim') : {})); kc.firstChild.classList.add('soft');
      row.append(kc);
      row.append(el('div', 'lx-c', m.telefon || '—', Object.assign({ 'data-label': 'Telefon' }, m.telefon ? tmk(m, 'telefon') : {})));
      row.append(el('div', 'lx-c', m.telegram || '—', Object.assign({ 'data-label': 'Telegram' }, m.telegram ? tmk(m, 'telegram') : {})));
      row.append(el('span', 'lx-chev', admin ? '›' : ''));
      frilRows.append(row);
    });
  };

  // Ruxsatlar: sahifalar va ichidagi kartochkalar
  const PERM = [
    ['bosh', 'Bosh menu', [['umumiy', "Umumiy ko'rsatkichlar"], ['bugun', 'Bugun joylanadiganlar'], ['loyihalar', 'Loyihalar']]],
    ['loyihalar', 'Loyihalar', [['royxat', "Loyihalar ro'yxati"]]],
    ['target', 'Target', [['umumiy', "Umumiy ko'rsatkichlar"], ['kampaniyalar', 'Kampaniyalar']]],
    ['vazifalar', 'Vazifalar', [['korsatkich', "Ko'rsatkichlar"], ['royxat', "Vazifalar ro'yxati"]]],
    ['syomkalar', 'Syomkalar', [['korsatkich', "Ko'rsatkichlar"], ['rejada', 'Barcha syomkalar']]],
    ['jamoa', 'Jamoa', [['azolar', "A'zolar"], ['frilans', 'Frilans']]]
  ];
  const defaultPerm = (lavozim) => PERM.filter(([p]) => p !== 'target' || TARGET_ROLES.includes(lavozim)).flatMap(([p, , cs]) => [p, ...cs.map(([c]) => p + '.' + c)]).join(', ');
  const buildPermTree = (cur) => {
    const wrap = el('div', 'lx-perms');
    const groups = PERM.map(([p, label, cards]) => {
      const g = el('div', 'lx-pgp');
      const pl = el('label', 'lx-cb');
      const pcb = el('input', null, null, { type: 'checkbox' });
      pl.append(pcb, document.createTextNode(' ' + label));
      g.append(pl);
      const row = el('div', 'lx-check-row');
      const kids = cards.map(([c, cl]) => {
        const l = el('label', 'lx-cb');
        const cb = el('input', null, null, { type: 'checkbox', 'data-perm': p + '.' + c });
        cb.checked = cur.has(p + '.' + c);
        l.append(cb, document.createTextNode(' ' + cl));
        row.append(l);
        return cb;
      });
      const sync = () => {
        const n = kids.filter((k) => k.checked).length;
        pcb.checked = n === kids.length;
        pcb.indeterminate = n > 0 && n < kids.length;
      };
      pcb.addEventListener('change', () => { kids.forEach((k) => { k.checked = pcb.checked; }); sync(); });
      kids.forEach((k) => k.addEventListener('change', sync));
      sync();
      g.append(row);
      wrap.append(g);
      return { p, kids, sync };
    });
    return {
      node: wrap,
      get: () => groups.flatMap((g) => { const on = g.kids.filter((k) => k.checked).map((k) => k.getAttribute('data-perm')); return on.length ? [g.p, ...on] : []; }).join(', '),
      set: (set) => groups.forEach((g) => { g.kids.forEach((k) => { k.checked = set.has(k.getAttribute('data-perm')); }); g.sync(); })
    };
  };
  const applyPatch = (m, patch) => {
    if (teamAdded.includes(m)) Object.assign(m, patch);
    else teamEdits[m._key] = Object.assign(teamEdits[m._key] || {}, patch);
  };
  const KASBLAR = ['Videograph', 'Montajor', 'Brandface'];
  const LAVOZIMLAR = ['PM', 'Kontent Maker', 'Targetolog'];

  // A'zo qo'shish / tahrirlash oynasi. mode: new | edit | self
  const buildMemberSheet = (m, mode) => {
    const isFril = !!m && m.tur === 'frilans';
    let kind = isFril ? 'frilans' : 'acct';
    const sheet = el('div', 'lx-sheet');
    sheet.hidden = true;
    sheet.append(el('h3', null, mode === 'new' ? "Yangi a'zo" : mode === 'self' ? "Shaxsiy ma'lumotlarim" : isFril ? "Frilans ma'lumotlari" : "A'zo ma'lumotlari"));
    const withIcon = (k, text, input) => { const f = mkField(text, input); f.querySelector('label').prepend(ico(k)); return f; };
    const nameIn = mkInput('text', m ? m.ism : '', 'Ism');
    const emailIn = mkInput('email', m ? m.email || '' : '', 'ism@pochta.uz');
    const phoneIn = mkInput('tel', m ? m.telefon || '' : '', '+998 90 123 45 67');
    const tgIn = mkInput('text', m ? m.telegram || '' : '', '@username');
    const kasbSel = mkSelect(KASBLAR, isFril ? m.lavozim : '');
    const lavSel = mkSelect(LAVOZIMLAR, !isFril && m ? m.lavozim : 'PM');
    const rolSel = mkSelect(["A'zo", 'Admin'], !isFril && m ? m.rol : "A'zo");
    const projNames = (dash.data('profiles').status === 'ok' ? dash.data('profiles').data : []).map((p) => p.loyiha);
    const projChecks = mkChecks(projNames, m ? splitList(m.loyihalar) : []);
    const tree = buildPermTree(new Set(splitList(m && !isFril ? m.ruxsat : defaultPerm('PM'))));
    let rang = (m && m.rang) || (m ? colorFor(m.ism) : (SWATCHES.find((c) => !teamRowsAll().some((x) => colorFor(x.ism) === c)) || SWATCHES[0]));
    const swBox = el('div', 'lx-swatches', null, { role: 'group', 'aria-label': 'Rang' });
    SWATCHES.forEach((c) => {
      const b = el('button', 'lx-sw', null, { type: 'button', 'aria-label': c, 'aria-pressed': String(c.toLowerCase() === String(rang).toLowerCase()) });
      b.style.setProperty('--c', c);
      b.addEventListener('click', () => { rang = c; swBox.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      swBox.append(b);
    });
    const passIn = mkInput('password', '', mode === 'new' ? 'Kamida 8 belgi' : "O'zgartirmaslik uchun bo'sh qoldiring", { autocomplete: 'new-password' });
    const curPassIn = mkInput('password', '', '', { autocomplete: 'current-password' });
    const newPassIn = mkInput('password', '', "Kamida 8 belgi (o'zgartirmasangiz bo'sh qoldiring)", { autocomplete: 'new-password' });
    const fPass = mkField(mode === 'new' ? "Boshlang'ich parol" : 'Yangi parol (Admin belgilaydi)', passIn);
    const fCur = mkField('Joriy parol', curPassIn);
    const fNew = mkField('Yangi parol', newPassIn);
    const fRang = mkField("Rang (Kontentlar va Vazifalarda ism rangi)", swBox, 'lx-wide');
    const fName = mkField('Ism', nameIn);
    const fEmail = mkField('Email (kirish uchun)', emailIn);
    const fKasb = mkField('Kasbi', kasbSel);
    const fPhone = withIcon('phone', 'Telefon raqami', phoneIn);
    const fTg = withIcon('telegram', 'Username', tgIn);
    const fLav = mkField('Lavozim', lavSel);
    const fRol = mkField('Rol', rolSel);
    const fProj = mkField('Loyihalar (Kontent Maker uchun)', projChecks, 'lx-wide');
    const permBox = el('div');
    const permNote = el('p', 'lx-permnote', "Admin uchun barcha sahifa va kartochkalar ochiq.");
    permBox.append(tree.node, permNote);
    const fPerm = mkField("Ko'rinadigan sahifalar va kartochkalar", permBox, 'lx-wide');
    const apply = () => {
      const acct = kind === 'acct';
      const self = mode === 'self';
      fRang.classList.toggle('lx-hidden', !acct);
      fEmail.classList.toggle('lx-hidden', !acct || self);
      fPass.classList.toggle('lx-hidden', !acct || self);
      fCur.classList.toggle('lx-hidden', !(acct && self));
      fNew.classList.toggle('lx-hidden', !(acct && self));
      fKasb.classList.toggle('lx-hidden', acct);
      fLav.classList.toggle('lx-hidden', !acct || self);
      fRol.classList.toggle('lx-hidden', !acct || self);
      fProj.classList.toggle('lx-hidden', !acct || self || lavSel.value !== 'Kontent Maker');
      const admin = rolSel.value === 'Admin';
      fPerm.classList.toggle('lx-hidden', !acct || self);
      tree.node.hidden = admin;
      permNote.hidden = !admin;
    };
    lavSel.addEventListener('change', () => {
      if (mode === 'new') tree.set(new Set(splitList(defaultPerm(lavSel.value))));
      apply();
    });
    rolSel.addEventListener('change', apply);
    if (mode === 'new') {
      const seg = el('div', 'lx-seg lx-typeseg', null, { role: 'group', 'aria-label': "A'zo turi" });
      [['acct', "Jamoa a'zosi (shaxsiy akkaunt)"], ['frilans', 'Frilans (akkauntsiz)']].forEach(([k, t]) => {
        const b = el('button', null, t, { type: 'button', 'aria-pressed': String(kind === k) });
        b.addEventListener('click', () => {
          kind = k;
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          apply();
        });
        seg.append(b);
      });
      sheet.append(seg);
    }
    // Telegramni ulash: bir martalik havola (24 soat)
    const fTgBot = el('div', 'lx-field lx-wide');
    if (m && m.id && mode !== 'new') {
      const st = String(m.tg_holat || 'none');
      const stText = el('span', 'lx-hint2', st === 'approved' ? 'Telegram ulangan ✓' : st === 'pending' ? 'Tasdiq kutilmoqda' : 'Telegram ulanmagan');
      const linkBtn = el('button', 'lx-btn', st === 'approved' ? 'Qayta ulash' : 'Telegramni ulash', { type: 'button' });
      const linkOut = el('div', 'lx-hint2');
      linkBtn.addEventListener('click', () => {
        linkBtn.disabled = true;
        X5.api('POST', '/api/telegram/link', { memberId: m.id }).then((r) => {
          linkOut.replaceChildren(document.createTextNode("Havolani shu odam Telegramda ochishi kerak (24 soat amal qiladi): "));
          const a = el('a', null, r.url, { href: r.url, target: '_blank', rel: 'noopener noreferrer' });
          linkOut.append(a);
        }).catch((e) => { linkOut.textContent = e.message; }).then(() => { linkBtn.disabled = false; });
      });
      fTgBot.append(el('label', null, 'Telegram bot'), stText, linkBtn, linkOut);
    }
    // Admin uchun 2 bosqichli kirish (Google Authenticator va shunga o'xshash ilovalar)
    const f2fa = el('div', 'lx-field lx-wide');
    if (mode === 'self' && m && m.rol === 'Admin') {
      f2fa.append(el('label', null, '2 bosqichli kirish (Admin)'));
      const out = el('div', 'lx-hint2');
      const draw2fa = () => {
        out.replaceChildren();
        if (Number(m.totp) === 1) {
          out.append(document.createTextNode('Yoqilgan ✓ — kirishda ilovadagi kod so\'raladi. '));
          const pw = mkInput('password', '', 'Parol', { autocomplete: 'current-password' });
          const cd = mkInput('text', '', '6 xonali kod', { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' });
          const off = el('button', 'lx-btn danger', "O'chirish", { type: 'button' });
          const msg = el('div', 'lx-hint2');
          off.addEventListener('click', () => {
            off.disabled = true;
            X5.api('POST', '/api/auth/totp/disable', { password: pw.value, code: cd.value }).then(() => X5.reload().then(() => { closeSheet(); toast("2 bosqichli kirish o'chirildi"); })).catch((e) => { msg.textContent = e.message; }).then(() => { off.disabled = false; });
          });
          out.append(pw, cd, off, msg);
        } else {
          const go = el('button', 'lx-btn', 'Yoqish', { type: 'button' });
          out.append(document.createTextNode("Yoqilmagan. Tavsiya etiladi: parol bilib olinsa ham, kod bo'lmasa kirib bo'lmaydi. "), go);
          go.addEventListener('click', () => {
            go.disabled = true;
            X5.api('POST', '/api/auth/totp/start').then((r) => {
              out.replaceChildren();
              const img = el('img', null, null, { src: r.qr, alt: 'QR kod', width: '220', height: '220' });
              const cd = mkInput('text', '', 'Ilovadagi 6 xonali kod', { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' });
              const ok2 = el('button', 'lx-btn primary', 'Tasdiqlash va yoqish', { type: 'button' });
              const msg = el('div', 'lx-hint2');
              out.append(
                document.createTextNode("1) Telefoningizda Google Authenticator (yoki Authy) ni oching, QR kodni skanerlang. Skaner ishlamasa, shu kalitni qo'lda kiriting: "),
                el('code', null, r.secret), el('br'), img, el('br'),
                document.createTextNode('2) Ilovada ko\'ringan 6 xonali kodni kiriting:'), cd, ok2, msg
              );
              ok2.addEventListener('click', () => {
                ok2.disabled = true;
                X5.api('POST', '/api/auth/totp/enable', { code: cd.value }).then(() => X5.reload().then(() => { closeSheet(); toast('2 bosqichli kirish yoqildi'); })).catch((e) => { msg.textContent = e.message; }).then(() => { ok2.disabled = false; });
              });
            }).catch((e) => { out.textContent = e.message; });
          });
        }
      };
      draw2fa();
      f2fa.append(out);
    } else f2fa.hidden = true;
    if (!fTgBot.childNodes.length) fTgBot.hidden = true;
    const fg = el('div', 'lx-fgrid');
    fg.append(fName, fEmail, fPass, fKasb, fPhone, fTg, fRang, fLav, fRol, fProj, fPerm, fCur, fNew, f2fa, fTgBot);
    sheet.append(fg);
    if (mode === 'self') sheet.append(el('p', 'lx-lock', "Boshqa ma'lumotlarni (lavozim, rol, ruxsatlar) faqat Admin o'zgartiradi."));
    if (mode === 'edit' && m && m.id && m._key !== meRow()._key) {
      const dz = el('div', 'lx-dz');
      dz.append(
        el('label', null, "Faolsizlantirish yoki o'chirish"),
        el('p', 'lx-hint2', "Faolsizlantirilgan a'zo tizimga kira olmaydi va botdan xabar olmaydi; kontent va tarixi saqlanadi, tugallanmagan vazifalari arxivga o'tadi. Keyin Arxiv → A'zolar bo'limidan qayta faollashtirish mumkin. Butunlay o'chirishda a'zoning vazifalari ham o'chadi va qaytarib bo'lmaydi (faqat zaxiradan tiklanadi).")
      );
      const row = el('div', 'lx-dzrow');
      const after = () => { closeSheet(); showPage('jamoa', true); };
      row.append(
        dangerBtn('Faolsizlantirish', 'Tasdiqlang', () => X5.mutate('POST', '/api/members/' + m.id + '/active', { active: false }, "A'zo faolsizlantirildi").then(after)),
        dangerBtn("Butunlay o'chirish", "Ha, butunlay o'chirilsin", () => X5.mutate('DELETE', '/api/members/' + m.id, undefined, "A'zo butunlay o'chirildi").then(after))
      );
      dz.append(row);
      sheet.append(dz);
    }
    sheet.append(sheetActions('cancel-member', mode === 'new' ? "Qo'shish" : 'Saqlash', 'save'));
    apply();
    sheet._submit = () => {
      const name = nameIn.value.trim();
      if (!name) return 'Ismni kiriting';
      const base = { name, phone: phoneIn.value, telegram: tgIn.value };
      if (mode === 'self') {
        Object.assign(base, { color: rang });
        const r = { method: 'PATCH', url: '/api/members/' + m.id, body: base, ok: 'Saqlandi' };
        if (newPassIn.value || curPassIn.value) {
          if (!curPassIn.value) return 'Joriy parolni kiriting';
          if (newPassIn.value.length < 8) return "Yangi parol kamida 8 belgidan iborat bo'lsin";
          r.pre = ['POST', '/api/auth/password', { current: curPassIn.value, next: newPassIn.value }];
        }
        return r;
      }
      if (kind === 'frilans') {
        if (!kasbSel.value) return 'Kasbini tanlang';
        const body = Object.assign(base, { position: kasbSel.value });
        return mode === 'new'
          ? { method: 'POST', url: '/api/members', body: Object.assign(body, { kind: 'freelance' }), ok: "Frilans qo'shildi" }
          : { method: 'PATCH', url: '/api/members/' + m.id, body, ok: 'Saqlandi' };
      }
      const email = emailIn.value.trim();
      if (!email) return 'Emailni kiriting';
      if (mode === 'new' && passIn.value.length < 8) return "Boshlang'ich parol kamida 8 belgi bo'lsin";
      const body = Object.assign(base, {
        email, color: rang, position: lavSel.value, role: rolSel.value === 'Admin' ? 'admin' : 'member',
        permissions: tree.get() ? tree.get().split(',').map((x) => x.trim()).filter(Boolean) : [],
        projects: [...projChecks.querySelectorAll('input')].filter((i) => i.checked).map((i) => i.getAttribute('aria-label'))
      });
      if (passIn.value) body.password = passIn.value;
      return mode === 'new'
        ? { method: 'POST', url: '/api/members', body: Object.assign(body, { kind: 'account' }), ok: "A'zo qo'shildi" }
        : { method: 'PATCH', url: '/api/members/' + m.id, body, ok: 'Saqlandi' };
    };
    return sheet;
  };

  const drawMember = () => {
    memberBox.replaceChildren();
    const name = dash.params().azo;
    if (!name) return;
    const sets = ['team', 'member_stats', 'contents', 'efficiency'].map((id) => dash.data(id));
    if (sets.some((d) => d.status === 'loading')) {
      skeleton(memberBox);
      return;
    }
    if (sets.some((d) => d.status !== 'ok')) {
      memberBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const [t, s, ct, ef] = sets;
    const m = accounts().find((x) => x._key === name);
    if (!m) {
      memberBox.append(el('div', 'lx-empty', "A'zo topilmadi."));
      return;
    }
    if (!amAdmin() && name !== meRow()._key) {
      memberBox.append(el('div', 'lx-empty', "Boshqa a'zolarning profilini faqat Admin ko'ra oladi."));
      return;
    }
    const x = s.data.find((r) => r.ism === name) || { kontent: 0, rekda: 0, target: 0, loyihalar: 0 };

    const hero = el('div', 'lx-mhero');
    hero.append(avatar(m.ism, true));
    const meta = el('div');
    meta.append(el('h1', null, m.ism, tmk(m, 'ism')));
    const mm = el('div', 'lx-mmeta');
    mm.append(chip(m.rol, roleColor(m.rol), tmk(m, 'rol')));
    if (m.lavozim) mm.append(el('span', null, m.lavozim, tmk(m, 'lavozim')));
    if (m.telefon) { const w = el('span', 'lx-iv'); w.append(ico('phone'), el('span', null, m.telefon, tmk(m, 'telefon'))); mm.append(w); }
    if (m.telegram) { const w = el('span', 'lx-iv'); w.append(ico('telegram'), el('span', null, m.telegram, tmk(m, 'telegram'))); mm.append(w); }
    meta.append(mm);
    hero.append(meta);
    hero.append(el('button', 'lx-btn lx-hbtn', 'Tahrirlash', { type: 'button', 'data-act': 'edit-member', 'data-key': m._key }));
    memberBox.append(hero);

    const tiles = el('section', 'lx-tiles');
    [['Kontentlar', 'kontent'], ['Rekdada', 'rekda']].forEach(([label, f]) => {
      const tl = el('div', 'lx-tile');
      tl.append(el('div', 'lx-lab', label), el('div', 'lx-big', fmtInt(x[f]), mkm('member_stats', f, name)));
      tiles.append(tl);
    });
    const pl = memberProjects(name);
    const ptile = el('div', 'lx-tile');
    ptile.append(el('div', 'lx-lab', 'Loyihalar'), el('div', 'lx-names', pl.length ? pl.join(', ') : '—'));
    tiles.append(ptile);
    memberBox.append(tiles);

    // Samaradorlik: oxirgi 30 kun
    const e = ef.data.find((r) => r.ism === name);
    if (e) {
      const es = el('section', 'lx-board');
      es.append(el('h2', null, 'Samaradorlik · oxirgi 30 kun'));
      const et = el('section', 'lx-tiles');
      const pct = e.bajarildi ? Math.round((e.vaqtida / e.bajarildi) * 100) + '%' : '—';
      [['Bajarilgan vazifa', fmtInt(e.bajarildi)], ["O'z vaqtida", pct], ['Kechikkan (hozir)', fmtInt(e.kechikkan)], ["O'rtacha muddat", e.bajarildi ? e.ortacha + ' kun' : '—'], ['Yangi kontent', fmtInt(e.kontent)], ['Joylangan', fmtInt(e.joylangan)], ['Syomka', fmtInt(e.syomka)]].forEach(([label, val]) => {
        const tl = el('div', 'lx-tile');
        tl.append(el('div', 'lx-lab', label), el('div', 'lx-big' + (label === 'Kechikkan (hozir)' && e.kechikkan ? ' n-gold' : ''), val));
        et.append(tl);
      });
      es.append(et);
      memberBox.append(es);
    }

    // Ruxsatlar (faqat Admin ko'radi)
    if (amAdmin()) {
      const ps = el('section', 'lx-board lx-psec');
      ps.append(el('h2', null, 'Ruxsatlar'));
      const card = el('div', 'lx-pinfo');
      const pv = el('div', 'lx-pview');
      if (String(m.rol).toLowerCase() === 'admin') pv.append(el('p', 'lx-pvoff', 'Admin: barcha sahifalar va kartochkalar ochiq.'));
      else {
        const have = new Set(splitList(m.ruxsat));
        PERM.forEach(([p, label, cards]) => {
          const blocked = p === 'target' && !TARGET_ROLES.includes(m.lavozim);
          const on = !blocked && have.has(p);
          const row = el('div', 'lx-pvrow' + (on ? '' : ' off'));
          row.append(el('b', null, label));
          if (blocked) row.append(el('span', 'lx-pvoff', 'Faqat PM va Targetologlarga ochiladi'));
          else if (!on) row.append(el('span', 'lx-pvoff', 'Ko\'rinmaydi'));
          else cards.forEach(([c, cl]) => row.append(el('span', 'lx-pvc' + (have.has(p + '.' + c) ? '' : ' off'), cl)));
          pv.append(row);
        });
        const arx = el('div', 'lx-pvrow off');
        arx.append(el('b', null, 'Arxiv'), el('span', 'lx-pvoff', 'Faqat Adminlarga'));
        pv.append(arx);
      }
      card.append(pv);
      ps.append(card);
      memberBox.append(ps);
    }

    const items = ct.data
      .filter((c) => c.tayyorladi === name)
      .sort((a, b) => String(a.loyiha).localeCompare(String(b.loyiha)) || Number(a.tartib) - Number(b.tartib));
    const right = el('section', 'lx-board');
    const own = name === meRow()._key;
    right.append(el('h2', null, own ? 'Mening kontentlarim' : m.ism + ' kontentlari'));
    const list = el('div', 'lx-list');
    const head = el('div', 'lx-chead');
    ['Kontent nomi', 'Loyiha', 'Rubrika', 'Montajor', 'Bosqich', 'Joylash', 'Rekda', 'Target'].forEach((h) => head.append(el('div', null, h)));
    list.append(head);
    if (!items.length) list.append(el('div', 'lx-empty', 'Hozircha kontent biriktirilmagan.'));
    items.forEach((c) => {
      const row = el('div', 'lx-crow');
      link(row, c.loyiha);
      const cell = (cls, label, node) => {
        const d = el('div', 'lx-c ' + cls, null, { 'data-label': label });
        d.append(node);
        row.append(d);
      };
      const check = flagCheck;
      cell('lx-name', 'Kontent nomi', el('span', null, c.nomi, mki('contents', 'nomi', c.id)));
      cell('', 'Loyiha', el('span', null, c.loyiha, mki('contents', 'loyiha', c.id)));
      cell('', 'Rubrika', el('span', null, c.rubrika || '—', mki('contents', 'rubrika', c.id)));
      cell('', 'Montajor', el('span', null, c.montajor || '—', mki('contents', 'montajor', c.id)));
      const st = chip(c.bosqich, stageColor(c.bosqich), mki('contents', 'bosqich', c.id));
      st.classList.add('lx-edit');
      cell('', 'Bosqich', st);
      cell('', 'Joylash', joylashCell(c));
      cell('lx-ck', 'Rekda', check(c, 'rekda', 'Rekda'));
      cell('lx-ck', 'Target', check(c, 'target', 'Target'));
      list.append(row);
    });
    right.append(list);
    memberBox.append(right);

    // Biriktirilgan vazifalar
    const tk = dash.data('tasks');
    const tst = dash.data('task_status');
    if (tk.status === 'ok') {
      const stat = new Map((tst.status === 'ok' ? tst.data : []).map((r) => [r.id, r]));
      const mine = tk.data.filter((r) => r.kimga === name)
        .sort((a, b) => (isDone(a.holat) - isDone(b.holat)) || ((stat.get(a.id) || { qoldi: 0 }).qoldi - (stat.get(b.id) || { qoldi: 0 }).qoldi));
      const sec = el('section', 'lx-board');
      sec.style.marginTop = '1rem';
      sec.append(el('h2', null, own ? 'Vazifalarim' : m.ism + ' vazifalari'));
      const tl = el('div', 'lx-list');
      if (!mine.length) tl.append(el('div', 'lx-empty', "Hozircha vazifa biriktirilmagan."));
      else {
        tl.append(Object.assign(el('div', 'lx-vhead nowho'), { innerHTML: '<div>Nima vazifa</div><div>Izoh</div><div class="r">Muddat</div><div class="r">Topshiriladi</div><div>Qolgan vaqt</div><div>Holat</div><div></div>' }));
        mine.filter((r) => !archived.has('task:' + r.id)).forEach((r) => tl.append(buildTaskRow(r, stat.get(r.id), false)));
      }
      sec.append(tl);
      memberBox.append(sec);
    }
  };

  // Vazifalar sahifasi
  const TASK_STATUSES = ['Boshlanmagan', 'Jarayonda', 'Tayyor', 'Tugatildi'];
  const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const taskBox = document.querySelector('.lx-taskrows');
  const selNew = document.getElementById('task-new-who');
  const isDone = (h) => /^(tayyor|tugat)/.test(String(h).toLowerCase());
  const fmtDay = (iso) => {
    const p = String(iso).split('-').map(Number);
    return p.length === 3 && p[1] >= 1 && p[1] <= 12 ? p[2] + '-' + MONTHS[p[1] - 1] : String(iso);
  };
  const taskColor = (h) => {
    const k = norm(h);
    return k === 'boshlanmagan' ? '#8e8e93' : k === 'jarayonda' ? '#0a84ff' : k === 'tayyor' ? '#ff9f0a' : k.startsWith('tugat') ? '#30b457' : '#af52de';
  };
  const fillSelect = (sel, allLabel, values, current) => {
    sel.replaceChildren(new Option(allLabel, ''), ...values.map((v) => new Option(v, v)));
    sel.value = values.includes(current) ? current : '';
    return sel.value;
  };

  const taskNotes = new Map();
  const taskNote = (x) => (taskNotes.has(x.id) ? taskNotes.get(x.id) : String(x.izoh || '')).trim();
  const buildTaskRow = (x, st, withWho) => {
    const row = el('div', 'lx-vrow lx-link' + (withWho ? '' : ' nowho'), null, { 'data-task': x.id, role: 'button', tabindex: '0' });
    if (withWho) {
      const who = el('div', 'lx-c lx-who', null, Object.assign({ 'data-label': 'Kimga' }, mki('tasks', 'kimga', x.id)));
      who.append(chip(x.kimga, colorFor(x.kimga)));
      row.append(who);
    }
    const task = el('div', 'lx-c lx-vtask', null, { 'data-label': 'Nima vazifa' });
    task.append(el('span', null, x.vazifa, mki('tasks', 'vazifa', x.id)));
    row.append(task);
    const nt = taskNote(x);
    row.append(el('div', 'lx-c lx-vnote' + (nt ? '' : ' empty'), nt || '—', { 'data-label': 'Izoh' }));
    const days = el('div', 'lx-c lx-num', null, { 'data-label': 'Muddat' });
    days.append(el('span', null, fmtInt(x.muddat), mki('tasks', 'muddat', x.id)), document.createTextNode(' kun'));
    row.append(days);
    const date = el('div', 'lx-c lx-num', null, { 'data-label': 'Topshiriladi' });
    date.append(el('span', null, fmtDay(x.sana), mki('tasks', 'sana', x.id)));
    row.append(date);
    const left = el('div', 'lx-c lx-vdue', null, { 'data-label': 'Qolgan vaqt' });
    if (st && st.belgi) {
      const q = Number(st.qoldi);
      const tone = Number(st.kechikkan) === 1 ? ' late' : q > 5 ? ' d-ok' : q >= 3 ? ' d-warn' : ' d-bad';
      left.append(el('span', 'lx-due' + tone, st.belgi, mki('task_status', 'belgi', x.id)));
    }
    else left.append(el('span', 'lx-due', '—'));
    row.append(left);
    const stc = el('div', 'lx-c lx-vstat', null, { 'data-label': 'Holat' });
    const pill = chip(x.holat, taskColor(x.holat), mki('tasks', 'holat', x.id));
    pill.classList.add('lx-edit');
    stc.append(pill);
    row.append(stc);
    row.append(archCell('task:' + x.id, amAdmin() && norm(x.holat).startsWith('tugat')));
    return row;
  };

  // Vazifani tahrirlash oynasi
  const buildTaskDetail = (id) => {
    const t = dash.data('tasks');
    const x = t.status === 'ok' ? t.data.find((r) => r.id === id) : null;
    if (!x) return null;
    const sheet = el('div', 'lx-sheet');
    sheet.hidden = true;
    sheet.append(el('h3', null, 'Vazifani tahrirlash'));
    const days = mkInput('number', x.muddat, null, { min: '1', max: '365' });
    const sp = String(x.sana).split('-').map(Number);
    const due = mkInput('text', sp.length === 3 && sp[1] >= 1 ? sp[2] + '-' + MONTHS[sp[1] - 1] + ' ' + sp[0] : String(x.sana), null, { readonly: '', tabindex: '-1' });
    days.addEventListener('input', () => {
      const n = parseInt(days.value, 10);
      if (!(n >= 1)) { due.value = ''; return; }
      const d = new Date();
      d.setDate(d.getDate() + n);
      due.value = d.getDate() + '-' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    });
    const fg = el('div', 'lx-fgrid');
    const statusSel = mkSelect(TASK_STATUSES, x.holat);
    const noteArea = mkArea(taskNote(x), 4, "Vazifa qanday bajarilgani, havolalar va boshqa kerakli ma'lumotlar");
    const whoSel = mkSelect(teamNames(), x.kimga);
    const titleIn = mkInput('text', x.vazifa);
    fg.append(
      mkField('Kimga', whoSel),
      mkField('Nima vazifa', titleIn, 'lx-wide'),
      mkField('Muddat (kun)', days),
      mkField('Topshiriladi (avtomatik)', due),
      mkField('Holat', statusSel),
      mkField('Izoh', noteArea, 'lx-wide')
    );
    sheet.append(fg);
    sheet.setAttribute('data-task-sheet', id);
    if (!amAdmin()) {
      fg.querySelectorAll('input,select').forEach((n) => { if (n !== statusSel) n.disabled = true; });
      sheet.querySelector('h3').textContent = 'Vazifa holati va izohi';
      sheet.append(el('p', 'lx-lock', "Siz faqat o'zingizga biriktirilgan vazifaning holatini o'zgartira olasiz."));
    }
    sheet.append(sheetActions('cancel-task', 'Saqlash', 'save'));
    sheet._submit = () => {
      const body = { status: statusSel.value, note: noteArea.value };
      if (amAdmin()) {
        if (!titleIn.value.trim()) return 'Vazifa nomini kiriting';
        Object.assign(body, { assignee: whoSel.value, title: titleIn.value });
        if (parseInt(days.value, 10) !== Number(x.muddat)) {
          if (!(parseInt(days.value, 10) >= 1)) return 'Muddatni kiriting';
          body.durationDays = parseInt(days.value, 10);
        }
      }
      return { method: 'PATCH', url: '/api/tasks/' + id, body, ok: 'Saqlandi' };
    };
    return sheet;
  };

  const drawTaskTotals = () => {
    let t = dash.data('task_totals');
    if (t.status === 'ok' && !amAdmin()) {
      const tk = dash.data('tasks');
      const ts = dash.data('task_status');
      const mine = tk.status === 'ok' ? tk.data.filter((x) => x.kimga === meRow()._key) : [];
      const ids = new Set(mine.map((x) => x.id));
      t = { status: 'ok', data: [{
        jami: mine.length,
        jarayonda: mine.filter((x) => String(x.holat).toLowerCase() === 'jarayonda').length,
        kechikkan: ts.status === 'ok' ? ts.data.filter((s) => ids.has(s.id)).reduce((a, s) => a + Number(s.kechikkan || 0), 0) : 0,
        tayyor: mine.filter((x) => String(x.holat).toLowerCase() === 'tayyor').length
      }] };
    }
    const row = t.status === 'ok' && t.data.length ? t.data[0] : null;
    document.querySelectorAll('#vazifa-jami [data-source="task_totals"]').forEach((n) => {
      const f = n.getAttribute('data-field');
      if (row) {
        n.textContent = fmtInt(row[f]);
        n.classList.remove('dash-skeleton');
        n.classList.toggle('late', f === 'kechikkan' && Number(row[f]) > 0);
      } else if (t.status === 'loading') {
        n.classList.add('dash-skeleton');
      } else {
        n.textContent = '—';
        n.classList.remove('dash-skeleton');
      }
    });
  };

  const drawTasks = () => {
    const t = dash.data('tasks');
    const s = dash.data('task_status');
    const tm = dash.data('team');
    if (tm.status === 'ok') selNew.replaceChildren(...accounts().map((m) => new Option(m.ism, m.ism)));
    taskBox.replaceChildren();
    if (t.status === 'loading' || (t.status === 'ok' && s.status === 'loading')) {
      skeleton(taskBox);
      return;
    }
    if (t.status !== 'ok') {
      taskBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const stat = new Map((s.status === 'ok' ? s.data : []).map((x) => [x.id, x]));
    const rows = t.data
      .filter((x) => !archived.has('task:' + x.id) && (amAdmin() || x.kimga === meRow()._key))
      .sort((a, b) => (isDone(a.holat) - isDone(b.holat)) || ((stat.get(a.id) || { qoldi: 0 }).qoldi - (stat.get(b.id) || { qoldi: 0 }).qoldi));
    if (!rows.length) taskBox.append(el('div', 'lx-empty', "Hozircha vazifa yo'q."));
    rows.forEach((x) => taskBox.append(buildTaskRow(x, stat.get(x.id), true)));
  };
  const projStart = document.getElementById('proj-start');
  const projMonths = document.getElementById('proj-months');
  const projEnd = document.getElementById('proj-end');
  const calcProjEnd = () => {
    const p = String(projStart.value).split('-').map(Number);
    const m = parseInt(projMonths.value, 10);
    if (p.length !== 3 || p.some((n) => isNaN(n)) || !(m > 0)) { projEnd.value = ''; return; }
    const last = new Date(Date.UTC(p[0], p[1] - 1 + m + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(p[0], p[1] - 1 + m, Math.min(p[2], last)));
    projEnd.value = d.getUTCDate() + '-' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  projStart.addEventListener('input', calcProjEnd);
  projMonths.addEventListener('input', calcProjEnd);
  const daysIn = document.getElementById('task-new-days');
  const dateIn = document.getElementById('task-new-date');
  daysIn.addEventListener('input', () => {
    const n = parseInt(daysIn.value, 10);
    if (!(n >= 1)) { dateIn.value = ''; return; }
    const t = new Date();
    t.setDate(t.getDate() + n);
    dateIn.value = t.getDate() + '-' + MONTHS[t.getMonth()] + ' ' + t.getFullYear();
  });

  // Syomkalar sahifasi
  const shootBox = document.querySelector('.lx-shootrows');
  const selShootNewClient = document.getElementById('shoot-new-client');
  const selShootNewOp = document.getElementById('shoot-new-op');
  const selShootNewBf = document.getElementById('shoot-new-bf');
  const shootColor = (h) => {
    const k = String(h).toLowerCase();
    return k === 'rejada' ? '#0a84ff' : k === 'tugatildi' ? '#30b457' : k.startsWith('bekor') ? '#ff453a' : k.startsWith('ko') ? '#ff9f0a' : '#af52de';
  };

  // Syomkani ko'rish va tahrirlash oynasi (Admin tahrirlaydi, A'zo faqat ko'radi)
  const buildShootDetail = (id) => {
    const d = dash.data('shoots');
    const x = d.status === 'ok' ? d.data.find((r) => r.id === id) : null;
    if (!x) return null;
    const admin = amAdmin();
    const pj = dash.data('projects');
    const clients = pj.status === 'ok' ? pj.data.map((p) => p.loyiha) : [];
    const ops = frilans('Videograph').map((m) => m.ism);
    const bfs = frilans('Brandface').map((m) => m.ism);
    const sheet = el('div', 'lx-sheet');
    sheet.hidden = true;
    sheet.append(el('h3', null, admin ? 'Syomkani tahrirlash' : "Syomka ma'lumotlari"));
    const req = (label, node, cls) => {
      const f = mkField(label, node, cls);
      f.querySelector('label').append(el('span', 'lx-req', '*'));
      node.setAttribute('data-req', '');
      return f;
    };
    const fg = el('div', 'lx-fgrid');
    const K = (node, key) => { node.setAttribute('data-f', key); return node; };
    fg.append(
      req('Mijoz', K(mkSelect(clients, x.mijoz), 'project')),
      req('Qayerda', K(mkInput('text', x.qayerda || '', 'Joy nomi'), 'place')),
      req('Sana', K(mkInput('date', x.sana || '', null, { min: '2000-01-01', max: '2099-12-31' }), 'date')),
      req('Soat', K(mkInput('time', x.soat || ''), 'time')),
      req('Operator', K(mkSelect(ops, x.operator), 'operator')),
      mkField('Brandface (ixtiyoriy)', K(mkSelect(bfs, x.brandface || '', '—'), 'brandface')),
      req('Holat', K(mkSelect(['Rejada', 'Tugatildi', "Bekor bo'ldi", "Ko'chirildi"], x.holat), 'status')),
      mkField("Qo'shimcha (ixtiyoriy)", K(mkInput('text', x.qoshimcha || '', 'Kerakli narsalar, esdan chiqmasin'), 'note'))
    );
    sheet._submit = () => ({ method: 'PATCH', url: '/api/shoots/' + id, body: collectF(sheet), ok: 'Saqlandi' });
    sheet.append(fg);
    if (admin) {
      const a = el('div', 'lx-actions');
      a.append(el('span', 'lx-hint'), el('button', 'lx-btn', 'Bekor qilish', { type: 'button', 'data-act': 'cancel-shoot' }), el('button', 'lx-btn primary', 'Saqlash', { type: 'button', 'data-act': 'save-shoot' }));
      sheet.append(a);
    } else {
      fg.querySelectorAll('input,select').forEach((n) => { n.disabled = true; });
      sheet.append(el('p', 'lx-lock', "Syomkani faqat Admin qo'sha va tahrirlay oladi."));
      const a = el('div', 'lx-actions');
      a.append(el('span', 'lx-hint'), el('button', 'lx-btn', 'Yopish', { type: 'button', 'data-act': 'cancel-shoot' }));
      sheet.append(a);
    }
    return sheet;
  };

  const drawShootTotals = () => {
    let t = dash.data('shoot_totals');
    if (t.status === 'ok' && !amAdmin()) {
      const sh = dash.data('shoots');
      const ss = dash.data('shoot_status');
      const st = new Map((ss.status === 'ok' ? ss.data : []).map((s) => [s.id, s]));
      const act = (sh.status === 'ok' ? sh.data : []).filter((x) => canClient(x.mijoz) && /^(rejada|ko)/.test(String(x.holat).toLowerCase()) && st.has(x.id));
      const q = (x) => st.get(x.id).qoldi;
      t = { status: 'ok', data: [{ bugun: act.filter((x) => q(x) === 0).length, ertaga: act.filter((x) => q(x) === 1).length, hafta: act.filter((x) => q(x) >= 0 && q(x) <= 6).length, rejada: act.length }] };
    }
    const row = t.status === 'ok' && t.data.length ? t.data[0] : null;
    document.querySelectorAll('#syomka-jami [data-source="shoot_totals"]').forEach((n) => {
      const f = n.getAttribute('data-field');
      if (row) {
        n.textContent = fmtInt(row[f]);
        n.classList.remove('dash-skeleton');
      } else if (t.status === 'loading') {
        n.classList.add('dash-skeleton');
      } else {
        n.textContent = '—';
        n.classList.remove('dash-skeleton');
      }
    });
  };

  const drawShoots = () => {
    const d = dash.data('shoots');
    const s = dash.data('shoot_status');
    const pj = dash.data('projects');
    const tm = dash.data('team');
    if (pj.status === 'ok') selShootNewClient.replaceChildren(...(pj.data.length ? pj.data.map((p) => new Option(p.loyiha, p.loyiha)) : [new Option("Avval loyiha qo'shing", '')]));
    selShootNewOp.replaceChildren(...(frilans('Videograph').length ? frilans('Videograph').map((m) => new Option(m.ism, m.ism)) : [new Option("Avval Videograph frilans qo'shing", '')]));
    selShootNewBf.replaceChildren(new Option('—', ''), ...frilans('Brandface').map((m) => new Option(m.ism, m.ism)));
    shootBox.replaceChildren();
    if (d.status === 'loading' || (d.status === 'ok' && s.status === 'loading')) {
      skeleton(shootBox);
      return;
    }
    if (d.status !== 'ok') {
      shootBox.append(el('div', 'lx-fail', 'Failed to load'));
      return;
    }
    const stat = new Map((s.status === 'ok' ? s.data : []).map((x) => [x.id, x]));
    const key = (x) => String(x.sana) + ' ' + String(x.soat);
    const isActive = (x) => /^(rejada|ko)/.test(String(x.holat).toLowerCase());
    const rows = d.data
      .filter((x) => !archived.has('shoot:' + x.id) && canClient(x.mijoz))
      .sort((a, b) => (isActive(b) - isActive(a)) || (isActive(a) ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
    if (!rows.length) shootBox.append(el('div', 'lx-empty', "Syomka yo'q."));
    rows.forEach((x) => {
      const st = stat.get(x.id);
      const row = el('div', 'lx-xrow lx-link' + (isActive(x) ? '' : ' past'), null, { 'data-shoot': x.id, role: 'button', tabindex: '0' });
      const cell = (cls, label, node) => {
        const c = el('div', 'lx-c ' + cls, null, { 'data-label': label });
        c.append(node);
        row.append(c);
        return c;
      };
      cell('lx-name', 'Mijoz', el('span', null, x.mijoz, mki('shoots', 'mijoz', x.id)));
      cell('', 'Qayerda', el('span', null, x.qayerda, mki('shoots', 'qayerda', x.id)));
      const wc = cell('', 'Qachon', el('span', null, fmtDay(x.sana) + (x.soat ? ', ' + x.soat : ''), mki('shoots', 'sana', x.id)));
      if (st && st.hafta) {
        const day = el('span', 'lx-xday');
        day.append(el('span', null, st.hafta, mki('shoot_status', 'hafta', x.id)));
        wc.append(day);
      }
      cell('', 'Operator', el('span', null, x.operator || '—', mki('shoots', 'operator', x.id)));
      cell('', 'Brandface', el('span', null, x.brandface || '—', mki('shoots', 'brandface', x.id)));
      const pill = chip(x.holat, shootColor(x.holat), mki('shoots', 'holat', x.id));
      pill.classList.add('lx-edit');
      cell('', 'Holat', pill);
      cell('lx-xnote', "Qo'shimcha", el('span', null, x.qoshimcha || '—', mki('shoots', 'qoshimcha', x.id)));
      row.append(archCell('shoot:' + x.id, amAdmin() && /^(tugat|bekor)/.test(String(x.holat).toLowerCase())));
      shootBox.append(row);
    });
  };

  // Arxiv sahifasi: har bir bo'lim uchun alohida tab
  const arxivState = { tab: 'syomkalar' };
  const arxivTabs = document.querySelector('.lx-atabs');
  const arxivBox = document.getElementById('arxiv-royxat');
  const cellTxt = (text, attrs) => el('span', null, text == null || text === '' ? '—' : text, attrs);
  const ARXIV = [
    {
      id: 'kontentlar', label: 'Kontentlar', prefix: 'content:', src: 'arch_contents', one: 'kontent',
      hint: "Kontentni «Kontentni o'chirish» tugmasi shu yerga yuboradi, keyin qaytarish mumkin.",
      grid: 'minmax(9rem,1.4fr) minmax(9rem,1.6fr) minmax(7rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) 14rem',
      cols: [
        ['Loyiha', (x) => cellTxt(x.loyiha, mki('arch_contents', 'loyiha', x.id)), 'lx-name'],
        ['Kontent', (x) => cellTxt(x.nomi, mki('arch_contents', 'nomi', x.id))],
        ['Tayyorladi', (x) => cellTxt(x.tayyorladi, mki('arch_contents', 'tayyorladi', x.id))],
        ['Bosqich', (x) => chip(x.bosqich, stageColor(x.bosqich), mki('arch_contents', 'bosqich', x.id))]
      ]
    },
    {
      id: 'syomkalar', label: 'Syomkalar', prefix: 'shoot:', src: 'shoots', one: 'syomka',
      hint: "Tugatildi yoki Bekor bo'lgan syomkani Syomkalar bo'limida arxiv ikoni bilan shu yerga ko'chirasiz.",
      grid: 'minmax(9rem,1.5fr) minmax(7rem,1.3fr) minmax(8rem,1.2fr) minmax(5.5rem,1fr) minmax(6.5rem,1fr) minmax(6rem,1fr) 14rem',
      cols: [
        ['Mijoz', (x) => cellTxt(x.mijoz, mki('shoots', 'mijoz', x.id)), 'lx-name'],
        ['Qayerda', (x) => cellTxt(x.qayerda, mki('shoots', 'qayerda', x.id))],
        ['Qachon', (x) => cellTxt(fmtDay(x.sana) + (x.soat ? ', ' + x.soat : ''), mki('shoots', 'sana', x.id))],
        ['Operator', (x) => cellTxt(x.operator, mki('shoots', 'operator', x.id))],
        ['Holat', (x) => chip(x.holat, shootColor(x.holat), mki('shoots', 'holat', x.id))]
      ]
    },
    {
      id: 'loyihalar', label: 'Loyihalar', prefix: 'project:', src: 'arch_projects', one: 'loyiha',
      hint: "Loyiha tahrirlash oynasidagi «Arxivga yuborish» tugmasi shu yerga ko'chiradi; kontent va syomkalari saqlanadi.",
      grid: 'minmax(10rem,2fr) minmax(6rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) 14rem',
      cols: [
        ['Loyiha', (x) => cellTxt(x.nomi), 'lx-name'],
        ['Holat', (x) => cellTxt(x.holat)],
        ['Kontent', (x) => cellTxt(x.kontent)],
        ['Syomka', (x) => cellTxt(x.syomka)]
      ],
      warn: (x) => "«" + x.nomi + "» loyihasi bilan birga uning " + x.kontent + " ta kontenti, " + x.syomka + " ta syomkasi, kampaniyalari va natijalari ham o'chadi."
    },
    {
      id: 'azolar', label: "A'zolar", prefix: 'member:', src: 'arch_members', one: "faolsiz a'zo",
      hint: "Jamoa → a'zo → Tahrirlash oynasidagi «Faolsizlantirish» tugmasi shu yerga ko'chiradi; qayta faollashtirish mumkin.",
      grid: 'minmax(10rem,2fr) minmax(6rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) 14rem',
      cols: [
        ['Ism', (x) => cellTxt(x.ism), 'lx-name'],
        ['Lavozim', (x) => cellTxt(x.lavozim)],
        ['Rol', (x) => cellTxt(x.rol)],
        ['Tur', (x) => cellTxt(x.tur)]
      ],
      warn: (x) => "«" + x.ism + "» butunlay o'chadi, uning vazifalari ham o'chadi; kontent va syomkalarda ismi bo'shab qoladi.",
      reactivate: true
    },
    {
      id: 'vazifalar', label: 'Vazifalar', prefix: 'task:', src: 'tasks', one: 'vazifa',
      hint: "Tugatildi holatidagi vazifani Vazifalar bo'limida arxiv ikoni bilan shu yerga ko'chirasiz.",
      grid: 'minmax(10rem,2fr) minmax(6rem,1fr) minmax(7rem,1fr) minmax(6rem,1fr) minmax(6rem,1fr) 14rem',
      cols: [
        ['Nima vazifa', (x) => cellTxt(x.vazifa, mki('tasks', 'vazifa', x.id)), 'lx-name'],
        ['Kimga', (x) => cellTxt(x.kimga, mki('tasks', 'kimga', x.id))],
        ['Topshirilgan', (x) => cellTxt(fmtDay(x.sana), mki('tasks', 'sana', x.id))],
        ['Holat', (x) => chip(x.holat, taskColor(x.holat), mki('tasks', 'holat', x.id))]
      ]
    }
  ];
  const drawArxiv = () => {
    const items = ARXIV.concat([{ id: 'tarix', label: 'Tarix', src: 'audit', custom: true }, { id: 'zaxira', label: 'Zaxira', src: 'backups', custom: true }, { id: 'bot', label: 'Bot', src: 'audit', custom: true }]).map((sec) => {
      const d = dash.data(sec.src);
      const rows = d.status === 'ok' ? (sec.custom ? d.data : d.data.filter((x) => archived.has(sec.prefix + x.id))) : [];
      return { sec, d, rows };
    });
    if (!items.some((i) => i.sec.id === arxivState.tab)) arxivState.tab = items[0].sec.id;
    arxivTabs.replaceChildren();
    items.forEach(({ sec, rows }) => {
      const b = el('button', null, sec.label, { type: 'button', role: 'tab', 'data-atab': sec.id, 'aria-selected': String(sec.id === arxivState.tab) });
      if (!sec.custom) b.append(el('span', 'lx-acnt', String(rows.length)));
      arxivTabs.append(b);
    });
    arxivBox.replaceChildren();
    const cur = items.find((i) => i.sec.id === arxivState.tab);
    const { sec, d, rows } = cur;
    if (d.status === 'loading') { skeleton(arxivBox); return; }
    if (d.status !== 'ok') { arxivBox.append(el('div', 'lx-fail', 'Failed to load')); return; }
    if (sec.id === 'bot') {
      arxivBox.append(el('h2', null, 'Telegram bot holati'));
      const box = el('div', 'lx-list');
      const note = el('p', 'lx-hint2', 'Yuklanmoqda…');
      box.append(note);
      arxivBox.append(box);
      X5.api('GET', '/api/telegram/webhook').then((i) => {
        box.replaceChildren();
        const row = (k, v, good) => { const r = el('div', 'lx-arow'); r.style.gridTemplateColumns = 'minmax(12rem,1fr) 3fr'; r.append(el('div', 'lx-c', k), el('div', 'lx-c', (good === undefined ? '' : good ? '✅ ' : '⚠️ ') + v)); box.append(r); };
        row('Bot', '@' + i.username);
        row('TELEGRAM_BOT_TOKEN', i.env.token ? "o'rnatilgan" : "yo'q", i.env.token);
        row('TELEGRAM_WEBHOOK_SECRET', i.env.secret ? "o'rnatilgan" : "yo'q", i.env.secret);
        row('CRON_SECRET (eslatmalar uchun)', i.env.cron ? "o'rnatilgan" : "yo'q", i.env.cron);
        row('Webhook', i.webhookUrl || "o'rnatilmagan", !!i.webhookUrl);
        row('Telegramda kutayotgan yangilanish', String(i.pending));
        row('Yuborilmagan xabarlar navbati', String(i.queue), i.queue === 0);
        if (i.lastError) row('Oxirgi xato', i.lastError, false);
        row('Zaxira fayl shifrlash (BACKUP_KEY)', i.env.backupKey ? 'yoqilgan' : "yo'q (fayl parol xeshlarisiz bo'ladi)");
        row('AI yordamchi kaliti', i.env.ai ? "o'rnatilgan" : "yo'q");
        const act = el('div', 'lx-actions');
        const hint = el('span', 'lx-hint');
        const b = el('button', 'lx-btn primary', i.webhookUrl ? 'Webhookni qayta o\'rnatish' : "Webhookni o'rnatish", { type: 'button' });
        b.addEventListener('click', () => {
          b.disabled = true;
          X5.api('POST', '/api/telegram/webhook').then((r) => { hint.classList.remove('bad'); hint.textContent = "O'rnatildi: " + r.url; }).catch((e) => { hint.classList.add('bad'); hint.textContent = e.message; }).then(() => { b.disabled = false; });
        });
        act.append(hint, b);
        arxivBox.append(act);
      }).catch((e) => { note.textContent = e.message; });
      return;
    }
    if (sec.id === 'zaxira') {
      arxivBox.append(el('h2', null, 'Zaxira nusxalar'));
      arxivBox.append(el('p', 'lx-hint2', "Har kuni ertalab avtomatik zaxira olinadi va Adminga Telegramda fayl sifatida yuboriladi. Oxirgi 30 kun saqlanadi. Tiklashdan oldin joriy holatning zaxirasi avtomatik olinadi."));
      const bar2 = el('div', 'lx-actions');
      const hint2 = el('span', 'lx-hint');
      const mkNow = el('button', 'lx-btn primary', 'Hozir zaxira olish', { type: 'button' });
      mkNow.addEventListener('click', () => { mkNow.disabled = true; X5.mutate('POST', '/api/backups', undefined, 'Zaxira olindi').catch(() => {}).then(() => { mkNow.disabled = false; }); });
      const fileIn = el('input', null, null, { type: 'file', accept: '.json,application/json', hidden: '' });
      const upBtn = el('button', 'lx-btn', 'Fayldan tiklash', { type: 'button' });
      upBtn.addEventListener('click', () => {
        if (!upBtn.hasAttribute('data-armed')) {
          upBtn.setAttribute('data-armed', '1');
          upBtn.textContent = "Tasdiqlang: hamma ma'lumot almashadi";
          hint2.textContent = 'Keyin faylni tanlang.';
          setTimeout(() => { upBtn.removeAttribute('data-armed'); upBtn.textContent = 'Fayldan tiklash'; hint2.textContent = ''; }, 6000);
          return;
        }
        upBtn.removeAttribute('data-armed');
        fileIn.click();
      });
      fileIn.addEventListener('change', () => {
        const f = fileIn.files && fileIn.files[0];
        if (!f) return;
        f.text().then((txt) => X5.mutate('POST', '/api/backups/restore', { file: txt }, 'Ma\'lumotlar tiklandi')).catch((e) => { hint2.classList.add('bad'); hint2.textContent = e.message; });
      });
      bar2.append(hint2, upBtn, fileIn, mkNow);
      arxivBox.append(bar2);
      if (!rows.length) { arxivBox.append(el('div', 'lx-empty', "Hozircha zaxira yo'q.")); return; }
      const bl = el('div', 'lx-list');
      const bh = el('div', 'lx-ahead');
      const bgrid = 'minmax(8rem,1.2fr) minmax(5rem,0.8fr) minmax(5rem,0.8fr) 15rem';
      bh.style.gridTemplateColumns = bgrid;
      ['Qachon', 'Turi', 'Yozuvlar'].forEach((t) => bh.append(el('div', null, t)));
      bh.append(el('div'));
      bl.append(bh);
      const KIND = { daily: 'Kunlik', manual: "Qo'lda", 'pre-restore': 'Tiklashdan oldin' };
      rows.forEach((x) => {
        const row = el('div', 'lx-arow');
        row.style.gridTemplateColumns = bgrid;
        [[x.vaqt, 'Qachon'], [KIND[x.tur] || x.tur, 'Turi'], [String(x.hajm), 'Yozuvlar']].forEach(([t, l]) => row.append(el('div', 'lx-c', t, { 'data-label': l })));
        const rc = el('div', 'lx-c lx-arest');
        rc.append(el('a', 'lx-btn', 'Yuklab olish', { href: '/api/backups/' + x.id, download: '' }), el('button', 'lx-btn', 'Tiklash', { type: 'button', 'data-restore-backup': x.id }));
        row.append(rc);
        bl.append(row);
      });
      arxivBox.append(bl);
      return;
    }
    if (sec.custom) {
      arxivBox.append(el('h2', null, "O'zgarishlar tarixi"));
      if (!rows.length) {
        const eb = el('div', 'lx-emptybox');
        eb.append(el('div', 'lx-empty', "Hozircha o'zgarish yo'q."), el('div', 'lx-awhen', "Platformadagi har bir o'zgarish shu yerda ko'rinadi va kerak bo'lsa qaytariladi."));
        arxivBox.append(eb);
        return;
      }
      const tl = el('div', 'lx-list');
      const th = el('div', 'lx-ahead');
      const grid = 'minmax(7rem,0.9fr) minmax(6rem,0.8fr) minmax(5.5rem,0.6fr) minmax(12rem,3fr) 7.5rem';
      th.style.gridTemplateColumns = grid;
      ['Qachon', 'Kim', 'Amal', "O'zgarish"].forEach((t) => th.append(el('div', null, t)));
      th.append(el('div'));
      tl.append(th);
      const ACT = { create: "Qo'shildi", update: "O'zgardi", delete: 'Arxivga', restore: 'Qaytarildi', revert: 'Bekor qilindi', login: 'Kirish', system: 'Tizim' };
      rows.forEach((x) => {
        const row = el('div', 'lx-arow');
        row.style.gridTemplateColumns = grid;
        [[x.vaqt, 'Qachon'], [x.kim, 'Kim'], [/butunlay o'chirildi/i.test(x.mazmun) ? "O'chirildi" : (ACT[x.amal] || x.amal), 'Amal'], [x.mazmun, "O'zgarish"]].forEach(([t, l]) => row.append(el('div', 'lx-c', t, { 'data-label': l })));
        const rc = el('div', 'lx-c lx-arest');
        if (Number(x.qaytarsa)) rc.append(el('button', 'lx-btn', 'Qaytarish', { type: 'button', 'data-revert': x.id }));
        else if (Number(x.qaytarilgan)) rc.append(el('span', 'lx-awhen', 'Qaytarilgan'));
        row.append(rc);
        tl.append(row);
      });
      arxivBox.append(tl);
      return;
    }
    arxivBox.append(el('h2', null, 'Arxivlangan ' + sec.label.toLowerCase()));
    if (!rows.length) {
      const eb = el('div', 'lx-emptybox');
      eb.append(el('div', 'lx-empty', 'Arxivda ' + sec.one + " yo'q."), el('div', 'lx-awhen', sec.hint));
      arxivBox.append(eb);
      return;
    }
    const list = el('div', 'lx-list');
    const head = el('div', 'lx-ahead');
    head.style.gridTemplateColumns = sec.grid;
    sec.cols.forEach((c) => head.append(el('div', null, c[0])));
    head.append(el('div', null, 'Arxivlangan'), el('div'));
    list.append(head);
    rows.forEach((x) => {
      const row = el('div', 'lx-arow');
      row.style.gridTemplateColumns = sec.grid;
      sec.cols.forEach((c) => {
        const cell = el('div', 'lx-c' + (c[2] ? ' ' + c[2] : ''), null, { 'data-label': c[0] });
        cell.append(c[1](x));
        row.append(cell);
      });
      row.append(el('div', 'lx-c lx-awhen', archived.get(sec.prefix + x.id), { 'data-label': 'Arxivlangan' }));
      const rc = el('div', 'lx-c lx-arest');
      rc.append(el('button', 'lx-btn', sec.reactivate ? 'Faollashtirish' : 'Qaytarish', { type: 'button', 'data-restore': sec.prefix + x.id }));
      const delBtn = el('button', 'lx-btn danger', "Butunlay o'chirish", { type: 'button', 'data-forever': sec.prefix + x.id });
      if (sec.warn) delBtn.setAttribute('data-warn', sec.warn(x));
      rc.append(delBtn);
      row.append(rc);
      list.append(row);
    });
    arxivBox.append(list);
  };

  // Rejim: Avto / Kunduzgi / Tungi
  const modeBtns = document.querySelectorAll('.lx-modes button');
  const setMode = (m) => {
    root.setAttribute('data-mode', m);
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)));
    try {
      const bg = m === 'dark' ? '#000' : '#f5f5f7';
      document.documentElement.style.background = bg;
      document.body.style.background = bg;
      document.body.style.margin = '0';
    } catch (e) { /* mavzu foni ixtiyoriy */ }
  };
  // Boshlang'ich rejim ilova mavzusiga qarab tanlanadi
  const hostIsDark = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--color-bg)';
    root.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const m = c.match(/[\d.]+/g);
    if (c.startsWith('rgb') && m && m.length >= 3 && !(m.length === 4 && Number(m[3]) === 0)) {
      return 0.299 * Number(m[0]) + 0.587 * Number(m[1]) + 0.114 * Number(m[2]) < 128;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.getAttribute('data-mode'))));
  let savedMode = null;
  try { savedMode = localStorage.getItem('x5mode'); } catch (e) { /* ixtiyoriy */ }
  setMode(savedMode === 'dark' || savedMode === 'light' ? savedMode : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  modeBtns.forEach((b) => b.addEventListener('click', () => { try { localStorage.setItem('x5mode', b.getAttribute('data-mode')); } catch (e) { /* ixtiyoriy */ } }));

  // Sahifalar: Bosh menu / Loyihalar
  const tabs = document.querySelectorAll('.lx-tabs button');
  const tabStrip = document.querySelector('.lx-tabs');
  const syncTabMore = () => tabStrip.classList.toggle('more', tabStrip.scrollWidth - tabStrip.scrollLeft - tabStrip.clientWidth > 4);
  tabStrip.addEventListener('scroll', syncTabMore);
  window.addEventListener('resize', syncTabMore);
  setTimeout(syncTabMore, 0);
  const pages = document.querySelectorAll('.lx-page');
  let current = 'bosh';
  let origin = 'bosh';
  const bar = document.querySelector('.lx-bar');
  const menu = document.querySelector('.lx-menu');
  const backBtn = document.querySelector('.lx-back');
  const navStack = [];
  let curEntry = { id: 'bosh', tabId: null, arg: null };
  const showPage = (id, setLink, tabId, arg, fromBack) => {
    if (PAGE_IDS.includes(id) && meRow() && !can(id)) { id = firstPage(); tabId = null; arg = null; }
    closeSheet();
    if (id === 'kirish' || id === 'boshlash') navStack.length = 0;
    if (!fromBack && curEntry.id !== 'kirish' && curEntry.id !== 'boshlash' && (curEntry.id !== id || curEntry.arg !== (arg || null))) {
      navStack.push(curEntry);
      if (navStack.length > 30) navStack.shift();
    }
    curEntry = { id, tabId: tabId || null, arg: arg || null };
    backBtn.hidden = id === 'kirish' || id === 'boshlash' || id === 'bosh';
    current = id;
    pages.forEach((pg) => { pg.hidden = pg.id !== id; });
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-page') === (tabId || id))));
    const actTab = [...tabs].find((b) => b.getAttribute('aria-selected') === 'true');
    if (actTab && tabStrip.scrollWidth > tabStrip.clientWidth) {
      const off = actTab.getBoundingClientRect().left - tabStrip.getBoundingClientRect().left + tabStrip.scrollLeft;
      tabStrip.scrollTo({ left: Math.max(0, off - (tabStrip.clientWidth - actTab.offsetWidth) / 2) });
    }
    syncTabMore();
    bar.hidden = id === 'kirish' || id === 'boshlash';
    bar.classList.remove('open');
    menu.hidden = true;
    if (setLink) dash.setLink(id);
  };
  const subPages = ['loyiha', 'azo'];
  const openProject = (name, setLink) => {
    if (!subPages.includes(current)) origin = current;
    if (setLink) dash.setParams({ loyiha: name });
    showPage('loyiha', setLink, origin, name);
    root.scrollIntoView({ block: 'start' });
  };
  const openMember = (name, setLink) => {
    if (!amAdmin() && name !== meRow()._key) return;
    if (!subPages.includes(current)) origin = current;
    if (setLink) dash.setParams({ azo: name });
    showPage('azo', setLink, origin, name);
    root.scrollIntoView({ block: 'start' });
  };
  // Oynalar (pop-up)
  let openSh = null;
  const closeSheet = () => {
    if (!openSh) return;
    const { sheet, ov } = openSh;
    openSh = null;
    sheet.hidden = true;
    sheet.style.marginTop = '';
    const home = sheet._home;
    if (home && home.parent && home.parent.isConnected) home.parent.insertBefore(sheet, home.next && home.next.parentNode === home.parent ? home.next : null);
    else sheet.remove();
    ov.remove();
    root.style.minHeight = '';
  };
  const openSheet = (sheet) => {
    if (!sheet) return;
    if (openSh) closeSheet();
    sheet._home = { parent: sheet.parentNode, next: sheet.nextSibling };
    const ov = el('div', 'lx-overlay', null, { role: 'dialog', 'aria-modal': 'true' });
    ov.append(sheet);
    root.append(ov);
    sheet.hidden = false;
    const top = Math.max(0, -root.getBoundingClientRect().top) + 16;
    sheet.style.marginTop = top + 'px';
    const need = top + sheet.offsetHeight + 32;
    if (need > root.offsetHeight) root.style.minHeight = need + 'px';
    ov.addEventListener('mousedown', (ev) => { if (ev.target === ov) closeSheet(); });
    openSh = { sheet, ov };
    const f = sheet.querySelector('input:not([readonly]):not([type=checkbox]):not(:disabled),select:not(:disabled),textarea:not(:disabled)');
    if (f) f.focus({ preventScroll: true });
    sheet.scrollIntoView({ block: 'nearest' });
  };
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });
  const sheets = {
    project: document.getElementById('project-sheet'),
    task: document.getElementById('task-sheet'),
    shoot: document.getElementById('shoot-sheet')
  };
  const doSave = (act) => {
    const sh = act.closest('.lx-sheet');
    const hint = sh.querySelector('.lx-hint');
    const setHint = (t, bad) => { hint.textContent = t || ''; hint.classList.toggle('bad', !!bad); };
    let miss = 0;
    sh.querySelectorAll('[data-req]').forEach((n) => {
      const bad = !String(n.value || '').trim();
      if (bad) miss++;
      const f = n.closest('.lx-field');
      if (f) f.classList.toggle('bad', bad);
    });
    if (miss) { setHint("Majburiy maydonlar to'ldirilmagan: " + miss + ' ta', true); return; }
    const r = sh._submit ? sh._submit() : "Bu oynani saqlab bo'lmaydi";
    if (typeof r === 'string') { setHint(r, true); return; }
    act.disabled = true;
    setHint('Saqlanmoqda…');
    (r.pre ? X5.api(r.pre[0], r.pre[1], r.pre[2]) : Promise.resolve())
      .then(() => X5.mutate(r.method, r.url, r.body, r.ok, true))
      .then(() => { closeSheet(); if (sh._after) sh._after(); }, (e) => { setHint(e.message || 'Xatolik', true); })
      .then(() => { act.disabled = false; });
  };
  // Doimiy (markupdagi) oynalar: yangi loyiha, vazifa, syomka
  sheets.project._submit = () => {
    const b = collectF(sheets.project);
    if (!b.name) return 'Loyiha nomini kiriting';
    return { method: 'POST', url: '/api/projects', body: b, ok: "Loyiha qo'shildi" };
  };
  sheets.task._submit = () => {
    const b = collectF(sheets.task);
    if (!b.assignee) return 'Kimga ekanini tanlang';
    if (!b.title) return 'Vazifa nomini kiriting';
    if (!(parseInt(b.durationDays, 10) >= 1)) return 'Muddatni kiriting';
    return { method: 'POST', url: '/api/tasks', body: b, ok: "Vazifa qo'shildi" };
  };
  sheets.shoot._submit = () => ({ method: 'POST', url: '/api/shoots', body: collectF(sheets.shoot), ok: "Syomka qo'shildi" });
  Object.keys(sheets).forEach((k) => { sheets[k]._after = () => resetSheet(sheets[k]); });
  tabs.forEach((b) => b.addEventListener('click', () => showPage(b.getAttribute('data-page'), true)));
  backBtn.addEventListener('click', () => {
    const e = navStack.pop();
    if (!e) { if (current !== 'bosh') showPage('bosh', true, null, null, true); return; }
    if (e.id === 'loyiha') { dash.setParams({ loyiha: e.arg }); showPage('loyiha', true, e.tabId, e.arg, true); }
    else if (e.id === 'azo') { dash.setParams({ azo: e.arg }); showPage('azo', true, e.tabId, e.arg, true); }
    else showPage(e.id, true, e.tabId, null, true);
    root.scrollIntoView({ block: 'start' });
  });
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!e.target.closest('.lx-right')) { menu.hidden = true; notifPanel.hidden = true; }
    if (!e.target.closest('.lx-bar')) { bar.classList.remove('open'); const bg = bar.querySelector('.lx-burger'); if (bg) bg.setAttribute('aria-expanded', 'false'); }
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'nav') {
        const o = bar.classList.toggle('open');
        act.setAttribute('aria-expanded', String(o));
        menu.hidden = true;
        notifPanel.hidden = true;
      } else if (a === 'notif') { notifPanel.hidden = !notifPanel.hidden; menu.hidden = true; } else if (a === 'menu') { menu.hidden = !menu.hidden; notifPanel.hidden = true; }
      else if (a === 'go-me') {
        const me = acctName.getAttribute('data-me');
        menu.hidden = true;
        if (me) openMember(me, true);
      } else if (a === 'go-login') {
        menu.hidden = true;
        X5.doLogout();
      } else if (a === 'setup-admin') { X5.doSetup();
      } else if (a === 'login') { X5.doLogin();
      } else if (a === 'mfa-verify') { X5.doMfa();
      } else if (a === 'mfa-back') { X5.doLogout();
      }
      else if (a === 'toggle-project') openSheet(sheets.project);
      else if (a === 'toggle-content') openSheet(buildContentSheet());
      else if (a === 'edit-project') openSheet(buildProjectEdit(dash.params().loyiha));
      else if (a === 'toggle-member') openSheet(buildMemberSheet(null, 'new'));
      else if (a === 'edit-member') {
        const mm = accounts().find((x) => x._key === act.getAttribute('data-key'));
        if (mm) openSheet(buildMemberSheet(mm, amAdmin() ? 'edit' : 'self'));
      } else if (/^save(-(member|task|project|newtask|shoot))?$/.test(a)) doSave(act);
      else if (a === 'toggle-task') openSheet(sheets.task);
      else if (a === 'toggle-shoot') openSheet(sheets.shoot);
      else if (/^cancel-/.test(a)) closeSheet();
      return;
    }
    const hrf = e.target.closest('[data-href]');
    if (hrf && !e.target.closest('a')) {
      window.open(hrf.getAttribute('data-href'), '_blank', 'noopener,noreferrer');
      return;
    }
    const tt = e.target.closest('[data-ttab]');
    if (tt) {
      targetState.proj = tt.getAttribute('data-tproj') || null;
      drawTarget();
      return;
    }
    const pd = e.target.closest('[data-pdone]');
    if (pd) {
      const key = pd.getAttribute('data-pdone');
      const cur = pd.getAttribute('aria-pressed') === 'true';
      postedOv[key] = !cur;
      drawToday();
      drawDetail();
      drawMember();
      const [cid, plat] = key.split(':');
      const ct = dash.data('contents');
      const cc = ct.status === 'ok' ? ct.data.find((x) => x.id === cid) : null;
      if (cc) {
        const set = doneSet(cc);
        if (!cur) set.add(plat); else set.delete(plat);
        X5.mutate('PATCH', '/api/contents/' + cid, { postedOn: [...set] }).catch(() => X5.reload());
      }
      return;
    }
    const gt = e.target.closest('[data-goto]');
    if (gt && !e.target.closest('button')) {
      ptab.tab = 'kontent';
      openProject(gt.getAttribute('data-goto'), true);
      return;
    }
    const fl = e.target.closest('[data-flag]');
    if (fl) {
      flagClick(fl);
      return;
    }
    const rb = e.target.closest('[data-restore-backup]');
    if (rb) {
      if (!rb.hasAttribute('data-armed')) {
        rb.setAttribute('data-armed', '1');
        rb.textContent = 'Tasdiqlang';
        setTimeout(() => { if (rb.isConnected) { rb.removeAttribute('data-armed'); rb.textContent = 'Tiklash'; } }, 5000);
        return;
      }
      rb.disabled = true;
      X5.mutate('POST', '/api/backups/' + rb.getAttribute('data-restore-backup'), undefined, "Ma'lumotlar tiklandi").catch(() => { rb.disabled = false; });
      return;
    }
    const rv = e.target.closest('[data-revert]');
    if (rv) {
      if (!rv.hasAttribute('data-armed')) {
        rv.setAttribute('data-armed', '1');
        rv.textContent = 'Tasdiqlang';
        setTimeout(() => { if (rv.isConnected) { rv.removeAttribute('data-armed'); rv.textContent = 'Qaytarish'; } }, 4000);
        return;
      }
      rv.disabled = true;
      X5.mutate('POST', '/api/audit/' + rv.getAttribute('data-revert'), undefined, "O'zgarish qaytarildi").catch(() => { rv.disabled = false; });
      return;
    }
    const rs = e.target.closest('[data-restore]');
    if (rs) {
      const [kind, rid] = rs.getAttribute('data-restore').split(':');
      if (kind === 'member') X5.mutate('POST', '/api/members/' + rid + '/active', { active: true }, "A'zo qayta faollashtirildi").catch(() => {});
      else X5.mutate('POST', '/api/archive', { kind, id: rid, restore: true }, 'Qaytarildi').catch(() => {});
      return;
    }
    const fv = e.target.closest('[data-forever]');
    if (fv) {
      // Ikki bosqich: birinchisida ogohlantirish matni ko'rsatiladi, ikkinchisida o'chiriladi
      if (!fv.hasAttribute('data-armed')) {
        fv.setAttribute('data-armed', '1');
        fv.textContent = 'Ha, butunlay';
        const wrn = fv.getAttribute('data-warn') || "Bu yozuv butunlay o'chadi.";
        toast(wrn + ' Qaytarib bo\'lmaydi (faqat zaxiradan). Tasdiqlash uchun yana bosing.', 7000);
        setTimeout(() => { if (fv.isConnected) { fv.removeAttribute('data-armed'); fv.textContent = "Butunlay o'chirish"; } }, 6000);
        return;
      }
      const [kind, rid] = fv.getAttribute('data-forever').split(':');
      fv.disabled = true;
      const req = kind === 'member' ? X5.mutate('DELETE', '/api/members/' + rid, undefined, "A'zo butunlay o'chirildi") : X5.mutate('POST', '/api/archive', { kind, id: rid, forever: true }, "Butunlay o'chirildi");
      req.catch(() => { fv.disabled = false; });
      return;
    }
    const at = e.target.closest('[data-atab]');
    if (at) {
      arxivState.tab = at.getAttribute('data-atab');
      drawArxiv();
      return;
    }
    const ab = e.target.closest('[data-arch]');
    if (ab) {
      const [kind, aid] = ab.getAttribute('data-arch').split(':');
      X5.mutate('POST', '/api/archive', { kind, id: aid }, 'Arxivga yuborildi — Arxiv sahifasida turadi').catch(() => {});
      return;
    }
    const tk = e.target.closest('[data-task]');
    if (tk) {
      openSheet(buildTaskDetail(tk.getAttribute('data-task')));
      return;
    }
    const sk = e.target.closest('[data-shoot]');
    if (sk) {
      openSheet(buildShootDetail(sk.getAttribute('data-shoot')));
      return;
    }
    const cr = e.target.closest('[data-content]');
    if (cr && !e.target.closest('.lx-grip')) {
      openSheet(buildContentDetail(cr.getAttribute('data-content')));
      return;
    }
    const fr = e.target.closest('[data-frilans]');
    if (fr) {
      const fm = frilans().find((x) => x._key === fr.getAttribute('data-frilans'));
      if (fm && amAdmin()) openSheet(buildMemberSheet(fm, 'edit'));
      return;
    }
    const m = e.target.closest('[data-member]');
    if (m) {
      openMember(m.getAttribute('data-member'), true);
      return;
    }
    const r = e.target.closest('[data-project]');
    if (r) openProject(r.getAttribute('data-project'), true);
  });
  root.addEventListener('keydown', (e) => {
    const fl = e.target.closest && e.target.closest('[data-flag]');
    if (fl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      flagClick(fl);
      return;
    }
    if (e.key !== 'Enter') return;
    const gt = e.target.closest('[data-goto]');
    if (gt && e.target === gt) { ptab.tab = 'kontent'; openProject(gt.getAttribute('data-goto'), true); return; }
    const tk = e.target.closest('[data-task]');
    if (tk && e.target === tk) {
      openSheet(buildTaskDetail(tk.getAttribute('data-task')));
      return;
    }
    const sk = e.target.closest('[data-shoot]');
    if (sk && e.target === sk) {
      openSheet(buildShootDetail(sk.getAttribute('data-shoot')));
      return;
    }
    const cr = e.target.closest('[data-content]');
    if (cr && e.target === cr) {
      openSheet(buildContentDetail(cr.getAttribute('data-content')));
      return;
    }
    const fr = e.target.closest('[data-frilans]');
    if (fr && e.target === fr) {
      const fm = frilans().find((x) => x._key === fr.getAttribute('data-frilans'));
      if (fm && amAdmin()) openSheet(buildMemberSheet(fm, 'edit'));
      return;
    }
    const m = e.target.closest('[data-member]');
    if (m && e.target === m) {
      openMember(m.getAttribute('data-member'), true);
      return;
    }
    const r = e.target.closest('[data-project]');
    if (r && e.target === r) openProject(r.getAttribute('data-project'), true);
  });
  const hash = location.hash.slice(1);
  if (hash === 'loyiha' && dash.params().loyiha) openProject(dash.params().loyiha, false);
  else if (hash === 'azo' && dash.params().azo) openMember(dash.params().azo, false);
  else if (['loyihalar', 'target', 'vazifalar', 'syomkalar', 'jamoa', 'arxiv', 'kirish'].includes(hash)) showPage(hash, false);

  const applyRole = () => {
    root.setAttribute('data-role', amAdmin() ? 'admin' : 'azo');
    tabs.forEach((b) => { b.hidden = !can(b.getAttribute('data-page')); });
    root.querySelectorAll('[data-card]').forEach((n) => { n.hidden = !can(n.getAttribute('data-card')); });
    setTimeout(syncTabMore, 0);
    if (PAGE_IDS.includes(current) && meRow() && !can(current)) showPage(firstPage(), true);
  };
  const notifPanel = document.querySelector('.lx-notifs');
  const bellCount = document.querySelector('.lx-bcount');
  const notifSeen = new Set();
  let notifList = [];
  const nameOfKey = (k) => { const m = teamRowsAll().find((x) => x._key === k); return m ? m.ism : k; };
  const notifItems = () => {
    const items = [];
    const me = meRow();
    if (!me) return items;
    const t = dash.data('tasks'), ts = dash.data('task_status'), sh = dash.data('shoots'), ss = dash.data('shoot_status'), tp = dash.data('today_posts'), pi = dash.data('project_info');
    if (t.status === 'ok' && ts.status === 'ok') {
      const st = new Map(ts.data.map((x) => [x.id, x]));
      t.data.filter((x) => !archived.has('task:' + x.id) && (amAdmin() || x.kimga === me._key) && !isDone(x.holat)).forEach((x) => {
        const q = st.get(x.id);
        if (!q || q.qoldi > 0) return;
        const who = amAdmin() ? ' · ' + nameOfKey(x.kimga) : '';
        items.push(q.qoldi < 0
          ? { id: 't-' + x.id, tone: 'bad', rank: 0, title: "Vazifa muddati o'tgan", desc: x.vazifa + ' · ' + (-q.qoldi) + ' kun kechikdi' + who, page: 'vazifalar' }
          : { id: 'tb-' + x.id, tone: 'warn', rank: 1, title: 'Vazifa bugun tugaydi', desc: x.vazifa + who, page: 'vazifalar' });
      });
    }
    if (sh.status === 'ok' && ss.status === 'ok') {
      const sm = new Map(ss.data.map((x) => [x.id, x]));
      sh.data.filter((x) => /^(rejada|ko)/.test(String(x.holat).toLowerCase()) && canClient(x.mijoz)).forEach((x) => {
        const q = sm.get(x.id);
        if (!q || (q.qoldi !== 0 && q.qoldi !== 1)) return;
        items.push({ id: 's-' + x.id + '-' + q.qoldi, tone: q.qoldi === 0 ? 'warn' : 'info', rank: 2, title: q.qoldi === 0 ? 'Bugun syomka' : 'Ertaga syomka', desc: x.mijoz + ' · ' + x.qayerda + (x.soat ? ', ' + x.soat : ''), page: 'syomkalar' });
      });
    }
    if (tp.status === 'ok') {
      tp.data.filter((c) => canProj(c.loyiha) && projActive(c.loyiha) && !String(c.material || '').trim() && !c.joylandi).forEach((c) => {
        items.push({ id: 'm-' + c.id, tone: 'bad', rank: 1, title: "Materiali yo'q", desc: c.loyiha + ' · ' + c.nomi + (c.vaqt ? ', ' + c.vaqt : ''), proj: c.loyiha });
      });
    }
    if (pi.status === 'ok') {
      pi.data.filter((x) => x.tugash && canProj(x.loyiha) && projActive(x.loyiha)).forEach((x) => {
        const dl = daysTo(x.tugash);
        if (dl === null || dl > 14) return;
        items.push({ id: 'c-' + x.loyiha + '-' + x.tugash, tone: dl <= 3 ? 'bad' : 'warn', rank: dl <= 3 ? 0 : 3, title: dl < 0 ? 'Shartnoma muddati tugagan' : 'Shartnoma tugashiga ' + dl + ' kun qoldi', desc: x.loyiha, proj: x.loyiha });
      });
    }
    return items.sort((a, b) => a.rank - b.rank);
  };
  const drawNotifs = () => {
    notifList = notifItems();
    const unseen = notifList.filter((n) => !notifSeen.has(n.id)).length;
    bellCount.textContent = unseen > 9 ? '9+' : String(unseen);
    bellCount.hidden = unseen === 0;
    notifPanel.replaceChildren();
    const head = el('div', 'lx-nhead');
    head.append(el('span', null, 'Bildirishnomalar'));
    if (unseen) head.append(el('button', null, "Hammasi o'qildi", { type: 'button', 'data-nall': '1' }));
    notifPanel.append(head);
    if (!notifList.length) notifPanel.append(el('div', 'lx-nempty', "Yangi bildirishnoma yo'q."));
    notifList.forEach((n) => {
      const b = el('button', 'lx-nitem ' + n.tone + (notifSeen.has(n.id) ? ' seen' : ''), null, { type: 'button', 'data-nid': n.id });
      const tx = el('span');
      tx.append(el('div', 'lx-nt', n.title), el('div', 'lx-nd', n.desc));
      b.append(el('span', 'lx-ndot'), tx);
      notifPanel.append(b);
    });
  };
  notifPanel.addEventListener('click', (e) => {
    if (e.target.closest('[data-nall]')) { notifList.forEach((n) => notifSeen.add(n.id)); drawNotifs(); return; }
    const b = e.target.closest('[data-nid]');
    if (!b) return;
    const n = notifList.find((x) => x.id === b.getAttribute('data-nid'));
    if (!n) return;
    notifSeen.add(n.id);
    notifPanel.hidden = true;
    if (n.proj) openProject(n.proj, true); else showPage(n.page, true);
    drawNotifs();
  });
  const redrawAll = () => {
    applyRole();
    drawToday();
    drawTaskTotals();
    drawShootTotals();
    drawShoots();
    drawTasks();
    drawArxiv();
    drawAcct();
    drawTeam();
    drawMember();
    drawDetail();
    drawTotals();
    drawRows();
    drawStages();
    drawTarget();
    drawNotifs();
  };
  dash.onData(redrawAll);
  window.X5app = {
    setMe: (n) => { view.me = n; },
    clearOverrides: () => {
      [flagOv, postedOv, teamEdits].forEach((o) => Object.keys(o).forEach((k) => delete o[k]));
      taskNotes.clear();
      teamAdded.length = 0;
    },
    setSync: (t) => { syncAt = t || ''; },
    setArchived: (o) => { archived.clear(); Object.keys(o || {}).forEach((k) => archived.set(k, o[k])); },
    showPage,
    firstPage,
    redrawAll,
    toast: (t) => { root.querySelectorAll('.lx-toast').forEach((n) => n.remove()); const n = el('div', 'lx-toast', t); root.append(n); setTimeout(() => n.remove(), 2600); },
    currentPage: () => current
  };
})();
