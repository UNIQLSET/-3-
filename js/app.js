
import { findScheduleRow, isCalendarDate, scheduleDays as DAYS, scheduleMaxWeek as MAX, scheduleStart } from './schedule.js';

(() => {
  const pageLinks = document.querySelectorAll('.page-nav a');

  function updatePageNavigation() {
    const activeHash = location.hash === '#attendance' ? '#attendance' : '#timetable';

    for (const link of pageLinks) {
      const active = link.hash === activeHash;
      document.getElementById(link.getAttribute('aria-controls')).hidden = !active;
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  updatePageNavigation();
  window.addEventListener('hashchange', updatePageNavigation);

  const headerMenu = document.getElementById('header-menu');
  const menuToggle = document.getElementById('header-menu-toggle');
  const menuItems = document.getElementById('header-menu-items');

  function closeMenu(restoreFocus = false) {
    if (menuItems.inert) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuItems.inert = true;
    if (restoreFocus) menuToggle.focus();
  }

  menuToggle.addEventListener('click', () => {
    if (!menuItems.inert) {
      closeMenu(true);
      return;
    }
    menuToggle.setAttribute('aria-expanded', 'true');
    menuItems.inert = false;
    menuItems.querySelector('button').focus();
  });
  menuItems.addEventListener('click', event => {
    if (event.target.closest('button')) closeMenu(true);
  }, true);
  headerMenu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menuItems.inert) return;
    event.preventDefault();
    closeMenu(true);
  });
  headerMenu.addEventListener('focusout', event => {
    if (event.relatedTarget && !headerMenu.contains(event.relatedTarget)) closeMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (!headerMenu.contains(event.target)) closeMenu();
  });

  const infoButton = document.getElementById('app-info-button');
  const infoDialog = document.getElementById('app-info');
  infoButton.addEventListener('click', () => infoDialog.showModal());
  infoDialog.addEventListener('click', event => {
    if (event.target !== infoDialog) return;
    const { top, right, bottom, left } = infoDialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right ||
        event.clientY < top || event.clientY > bottom) infoDialog.close();
  });

  // ─── КОНФИГУРАЦИЯ ФАКУЛЬТЕТОВ ───────────────────────────────────
  const FACULTIES = [
    //   {
    //   id: 'police',
    //   label: 'ФКМ',
    //   fullLabel: 'факультет криминальной милиции',
    //   courses: [
    //     { id: '1', label: '1 курс', groups: ['6601','6602'] },
    //     { id: '2', label: '2 курс', groups: ['5601','5602'] }
    //   ]
    // },

    {
      id: 'law',
      label: 'ФП',
      fullLabel: 'факультет права',
      courses: [
        { id: '1', label: '1', groups: ['6501', '6502', '6503', '6504'] },
        { id: '2', label: '2', groups: ['5501', '5502', '5503'] },
        { id: '3', label: '3', groups: ['4501', '4502', '4503'] },
        { id: '4', label: '4', groups: ['3501', '3502'] }
      ]
    }
  ];

  const [startYear, startMonth, startDay] = scheduleStart.split('-').map(Number);
  const START = new Date(startYear, startMonth - 1, startDay);

  const TIME = { '1 пара':'8.30–<br/>9.50', '2 пара':'10.00–<br/>11.20', '3 пара':'11.30–<br/>12.50', '4 пара':'14.20–<br/>15.40', '5 пара':'15.50–<br/>17.10', '6 пара':'17.20–<br/>18.40' };
  const AUD = { '3501':'ауд. 3-403', '3502':'ауд. 3-405' };

  const TIMES = { '1 пара': [510, 590], '2 пара': [600, 680], '3 пара': [690, 770], '4 пара': [860, 940], '5 пара': [950, 1030], '6 пара': [1040, 1120] };

  // ─── СОСТОЯНИЕ ─────────────────────────────────────────────────
  const state = { faculty: FACULTIES[0].id, course: null, group: null };
  let slideDir = null;
  (function loadState() {
    try {
      const f = localStorage.getItem('schedule-faculty');
      const c = localStorage.getItem('schedule-course');
      const g = localStorage.getItem('schedule-group');
      if (f && FACULTIES.some(x => x.id === f)) state.faculty = f;
      if (c) state.course = c;
      if (g) state.group = g;

      // Миграция со старого формата (schedule-selected-course / schedule<N>_group)
      if (!c) {
        const oldCourse = localStorage.getItem('schedule-selected-course');
        if (oldCourse) state.course = oldCourse;
      }
      if (!g && state.course) {
        const oldG = localStorage.getItem('schedule' + state.course + '_group');
        if (oldG) state.group = oldG;
      }
    } catch (e) { }
  })();

  function saveState() {
    try {
      localStorage.setItem('schedule-faculty', state.faculty);
      localStorage.setItem('schedule-course', state.course);
      localStorage.setItem('schedule-group', state.group);
    } catch (e) { }
  }

  // ─── УТИЛИТЫ ───────────────────────────────────────────────────
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const checked = n => { const v = $(`input[name="${n}"]:checked`); return v ? v.id.replace(n + '-', '') : ''; };
  const set = id => { const e = document.getElementById(id); if (e) e.checked = true; };

  function week(d) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(0, Math.min(MAX, Math.floor(((d - START) / 86400000) / 7)));
  }
  function day(d) {
    return d.getDay() > 0 && d.getDay() < 7 ? DAYS[d.getDay() - 1] : 'sat';
  }

  const dayMs = 86400000;
  const scheduleStartTime = Date.parse(scheduleStart);

  function selectSharedSchedule() {
    if (location.hash === '#attendance') return false;
    const params = new URLSearchParams(location.search);
    const group = params.get('group');
    const date = params.get('date');
    if (!group || !isCalendarDate(date)) return false;

    const elapsed = (Date.parse(date) - scheduleStartTime) / dayMs;
    const sharedWeek = Math.floor(elapsed / 7);
    const sharedDay = DAYS[elapsed % 7];
    if (sharedWeek < 0 || sharedWeek > MAX || !sharedDay) return false;

    const faculty = FACULTIES.find(f => f.courses.some(c => c.groups.includes(group)));
    if (!faculty) return false;
    state.faculty = faculty.id;
    state.course = faculty.courses.find(c => c.groups.includes(group)).id;
    state.group = group;
    set('week-' + sharedWeek);
    set('day-' + sharedDay);
    return true;
  }

  const shareStatus = document.getElementById('share-status');
  let shareStatusTimer;

  document.getElementById('share-schedule').addEventListener('click', async () => {
    const elapsed = Number(checked('week')) * 7 + DAYS.indexOf(checked('day'));
    const date = new Date(scheduleStartTime + elapsed * dayMs);
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('group', state.group);
    url.searchParams.set('date', date.toISOString().slice(0, 10));

    if (navigator.share) {
      const dateLabel = date.toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', timeZone: 'UTC'});
      try {
        await navigator.share({title: `Расписание ${state.group} · ${dateLabel}`, url: url.href});
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url.href);
      shareStatus.textContent = 'Ссылка на расписание скопирована';
      clearTimeout(shareStatusTimer);
      shareStatusTimer = setTimeout(() => { shareStatus.textContent = ''; }, 3500);
    } catch {
      const input = document.getElementById('share-url');
      input.value = url.href;
      document.getElementById('share-dialog').showModal();
      input.select();
    }
  });

  // ─── РЕНДЕР СЕЛЕКТОРА ──────────────────────────────────────────
  function renderSwitcher() {
    const fac = FACULTIES.find(f => f.id === state.faculty) || FACULTIES[0];
    state.faculty = fac.id;


    const facRow = $('#faculty-row');
    const facTabs = $('#faculty-tabs');
    if (FACULTIES.length > 1) {
      facRow.style.display = '';
      facTabs.innerHTML = FACULTIES.map(f =>
        `<button type="button" class="switcher-tab${f.id === state.faculty ? ' active' : ''}" data-faculty="${f.id}">${f.label}</button>`
      ).join('');
    } else {
      facRow.style.display = 'none';
    }

    // Курс — сброс к первому, если текущий отсутствует
    if (!fac.courses.find(c => c.id === state.course)) {
      state.course = fac.courses[0].id;
    }
    $('#course-tabs').innerHTML = fac.courses.map(c =>
      `<button type="button" class="switcher-tab${c.id === state.course ? ' active' : ''}" data-course="${c.id}">${c.label}</button>`
    ).join('');

    // Группа — сброс к первой, если текущей нет
    const course = fac.courses.find(c => c.id === state.course);
    if (!course.groups.includes(state.group)) {
      state.group = course.groups[0];
    }
    $('#group-tabs').innerHTML = course.groups.map(g =>
      `<button type="button" class="switcher-tab${g === state.group ? ' active' : ''}" data-group="${g}">${g}</button>`
    ).join('');

    // Подпись факультета в шапке
    const eb = $('#eyebrow-text');
    if (eb) eb.textContent = 'Академия МВД';
  }

  // Клики по селектору
  document.getElementById('switcher').addEventListener('click', e => {
    const t = e.target.closest('.switcher-tab');
    if (!t) return;
    if (t.dataset.faculty) state.faculty = t.dataset.faculty;
    if (t.dataset.course) state.course = t.dataset.course;
    if (t.dataset.group) state.group = t.dataset.group;
    saveState();
    renderSwitcher();
    render();
  });

  // ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПАРСИНГА (без изменений) ──────────
  function detectLessonType(type, details) {
  type = String(type || '').trim();
  if (type) return type;
  const d = String(details || '');
  if (/Лекция/i.test(d))                              return 'Лекция';
  if (/Диф\.?\s*зач[её]т/i.test(d))                    return 'Диф.зачет';
  if (/Зач[её]т/i.test(d))                             return 'Зачет';
  // "т. N с ФИО" или "т.N сФИО"; в исходных таблицах встречается
  // и латинская c вместо кириллической с.
  if (/т\.\s*[\d.,\-\/\s]*\s*[сc](?=[\sА-ЯЁ]|$)/i.test(d)) return 'Семинар';
  if (/т\.\s*[\d.,\-\/\s]*\s*пр(?=[\sА-ЯЁ]|$)/.test(d)) return 'Практика';
  return '';
}
  function splitSubject(subject, details) {
  subject = String(subject || '').trim();
  details = String(details || '').trim();

  // Случай 1: всё запаковано в subject с <br/> (формат 4 курса).
  // Отделяем первую строку (название дисциплины) от остального.
  if (!details && /<br\s*\/?>/i.test(subject)) {
    const parts = subject.split(/<br\s*\/?>/i);
    subject = parts.shift().trim();
    details = parts.join('<br/>').trim();
  }

  // Случай 2: классический — subject чистый, details содержит мета-инфу.
  const meta = /^(?:т\.\s*|лекция\b|семинар\b|практика\b|зачет\b|диф\.зачет\b)/i;
  const lines = details ? details.split('<br/>') : [];
  const cut = lines.findIndex(x => meta.test(x.trim()));
  if (cut > 0) {
    subject += ' ' + lines.slice(0, cut).join(' ');
    details = lines.slice(cut).join('<br/>');
  }

  // Случай 3: в subject затесалось "т. N" (однострочный формат).
  const tm = subject.match(/^(.+?)\s+(т\.\s*.+)$/i);
  if (tm) {
    subject = tm[1].trim();
    details = details ? tm[2].trim() + '<br/>' + details : tm[2].trim();
  }

  // Случай 4: в subject попало ФИО — выносим в details.
  const fio = subject.search(/[А-ЯЁ][а-яё-]+(?:-[А-ЯЁ][а-яё-]+)?\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.(?=\s|$)/);
  if (fio > 0) {
    const tail = subject.slice(fio).trim();
    subject = subject.slice(0, fio).trim();
    details = details ? tail + '<br/>' + details : tail;
  }

  return [subject, details];
}

function splitLocation(subject, details) {
  const locations = [];
  const pattern = /(?:ауд\.?\s*(?:№\s*)?|л\/з\s*(?:№\s*)?)\d+(?:\s*[-–]\s*\d+)*(?:\s*[,/]\s*(?:(?:ауд\.?\s*)?(?:№\s*)?)\d+(?:\s*[-–]\s*\d+)*)*(?:\s+МАШ)?|спортгородок|спортзал|спортивный\s+зал/gi;
  for (const text of [subject, details]) {
    for (const match of text.matchAll(pattern)) locations.push(match[0].trim());
  }
  // При нескольких местах сохраняем исходные привязки к преподавателям.
  if (locations.length === 1) {
    const clean = text => text.replace(pattern, '').split(/<br\s*\/?>/i)
      .map(line => line.trim().replace(/^[,;]\s*|\s*[,;]$/g, ''))
      .filter(Boolean).join('<br/>');
    subject = clean(subject);
    details = clean(details);
  }
  return { subject, details, locations: [...new Set(locations)] };
}

function parseSubjectForQuestions(subject, details) {
  let name = subject, topic = null;
  const RX = /т\.\s*([\d.,\-\/\s]*\d)/i;
  const m = subject.match(/^(.*?)\s+т\.\s*([\d.,\-\/\s]*\d)/i);
  if (m) {
    name  = m[1];
    topic = m[2].replace(/\s+/g, '');
  } else {
    const m2 = (details || '').match(RX);
    if (m2) topic = m2[1].replace(/\s+/g, '');
  }
  name = name
    .replace(/\s*\(часть\s*\d+\)\s*$/i, '')
    .replace(/\s*\(особенная\s*часть\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, topic };
}

function findQuestionsList(disc, topic) {
  if (!topic || !disc) return null;
  if (disc[topic]) return disc[topic];

  const keys = Object.keys(disc).filter(k => k !== '_default');

  // 1) "8-9" → "8-9/1" + "8-9/2" + ...
  const prefix = topic + '/';
  const sub = keys.filter(k => k.startsWith(prefix)).sort();
  if (sub.length) return sub.flatMap(k => disc[k]);

  const norm = String(topic).trim();

  // 2) Подраздел "X.Y": точное совпадение уже проверено выше.
  //    Пробуем: (а) любой брат "X.Z", (б) родитель "X".
  if (/^\d+\.\d+$/.test(norm)) {
    const parent = norm.split('.')[0];
    // Сначала — единственный «брат» того же подраздела (напр. 2.1 для 2.2)
    const siblings = keys.filter(k => k.startsWith(parent + '.')).sort();
    if (siblings.length === 1) return disc[siblings[0]];
    // Иначе — родительская тема
    if (disc[parent]) return disc[parent];
    if (siblings.length) return siblings.flatMap(k => disc[k]);
    return null;
  }

  const norm2 = norm.replace(/,/g, '-');

  const parseRange = (s) => {
    const main = String(s).split('/')[0].trim();
    const m = main.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return [Math.min(a, b), Math.max(a, b)];
  };

  const tr = parseRange(norm2);
  if (tr) {
    const [tA, tB] = tr;
    const list = keys.map(k => ({ k, r: parseRange(k) })).filter(x => x.r);

    let hit = list.find(x => x.r[0] === tA && x.r[1] === tB);
    if (hit) return disc[hit.k];

    hit = list.filter(x => x.r[0] <= tA && x.r[1] >= tA)
              .sort((a, b) => (a.r[1] - a.r[0]) - (b.r[1] - b.r[0]))[0];
    if (hit) return disc[hit.k];

    hit = list.filter(x => x.r[0] <= tB && x.r[1] >= tB)
              .sort((a, b) => (a.r[1] - a.r[0]) - (b.r[1] - b.r[0]))[0];
    if (hit) return disc[hit.k];

    hit = list.filter(x => x.r[0] >= tA && x.r[0] <= tB)
              .sort((a, b) => a.r[0] - b.r[0])[0];
    if (hit) return disc[hit.k];

    hit = list.filter(x => x.r[1] < tA).sort((a, b) => b.r[1] - a.r[1])[0];
    if (hit && tA - hit.r[1] <= 3) return disc[hit.k];

    hit = list.filter(x => x.r[0] > tB).sort((a, b) => a.r[0] - b.r[0])[0];
    if (hit && hit.r[0] - tB <= 3) return disc[hit.k];
  }

  const parts = norm2.split('-').map(s => s.trim()).filter(Boolean);
  for (const p of parts) if (disc[p]) return disc[p];

  return null;
}

function renderQuestions(subject, details, topicOverride) {
  if (typeof QUESTIONS === 'undefined') return '';
  let { name, topic } = parseSubjectForQuestions(subject, details);
  if (topicOverride !== undefined && topicOverride !== null) topic = topicOverride;

  const disc = QUESTIONS[name];
  if (!disc) return '';

  let list = findQuestionsList(disc, topic);
  if (!list) list = disc._default;
  if (!Array.isArray(list) || !list.length) return '';
  return renderQuestionList(name, topic, list);
}

function verifiedLesson(name, type, topic, group, day, week, pair) {
  if (!['4501', '4502', '4503'].includes(group) || typeof VERIFIED_LESSONS === 'undefined') return undefined;
  const lessons = VERIFIED_LESSONS[name];
  if (!lessons) return undefined;

  // Новые материалы по налоговому праву начинаются с темы 5.
  if (name === 'Налоговое право' && (topic === '1-3' || topic === '4')) return undefined;

  const key = `${type}|${(topic || '').replace(/,/g, '-')}`;
  return lessons[`${key}|${group}|${day}|${week}|${pair}`] ?? lessons[key] ?? null;
}

function renderQuestionList(name, topic, list, verified, type = 'Семинар') {

  const qid = i => `${name}|${topic || '_'}|${i}`;
  const items = list.map((q, i) => `
    <li class="seminar-q-item" data-qid="${escapeAttr(qid(i))}">
      <span class="q-num">${i + 1}.</span>
      <div class="q-text">${escapeHtml(q)}</div>
      <div class="q-slot"></div>
    </li>`).join('');
  const title = type === 'Практика' ? 'Подготовка к практическому занятию' : 'Вопросы к семинару';
  const label = topic ? `${title} (т. ${escapeHtml(topic)})` : title;
  const source = verified?.pages ? `учебная программа, с. ${escapeHtml(verified.pages)}` : 'учебно-методическая карта';
  const control = verified
    ? `<p class="seminar-q-note"><strong>Форма контроля:</strong> ${escapeHtml(verified.control || 'в этой строке программы не указана')} <span>(${source})</span></p>`
    : '';
  return `<details class="seminar-q"><summary>${label}</summary>${control}<ol>${items}</ol>` +
    `<div class="seminar-q-actions">` +
      `<button class="ask-deepseek" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>Скопировать вопросы для ИИ</button>` +
      `<span class="ask-deepseek-status" role="status" aria-live="polite"></span>` +
    `</div></details>`;
}

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

function subjectHue(s) {
  let h = 0;
  for (const c of s) h = (h*31 + c.charCodeAt(0)) % 360;
  return h;
}
  // ─── РЕНДЕР РАСПИСАНИЯ ─────────────────────────────────────────
function render() {

  const g = state.group;
  const d = checked('day');
  const w = +checked('week');
  const root = $('#schedule');

  const build = () => {

    root.innerHTML = '';
    const row = findScheduleRow(g, d, w);
    updateDayGlance(row);
    const p = document.createElement('div');
    p.className = `panel panel-${g}-${d}-${w} active`;

    if (!row?.[3]?.length) {
      p.innerHTML = '<div class="no-data"><div class="big">Занятий нет</div>на этой неделе</div>';
    } else {
      const l = document.createElement('div');
      l.className = 'lessons';

      const topicTotal = {};
      row[3].forEach(([type, , , subject, details]) => {
        const parts = splitSubject(subject, details);
        const effType = detectLessonType(type, parts[1]);
        if (effType !== 'Семинар') return;
        const { name, topic } = parseSubjectForQuestions(parts[0], parts[1]);
        if (!topic) return;
        const k = name + '|' + topic;
        topicTotal[k] = (topicTotal[k] || 0) + 1;
      });

      const topicSeen = {};
      row[3].forEach(([type, num, time, subject, details]) => {
        const c = document.createElement('div');
        const parts = splitSubject(subject, details);
        const effType = detectLessonType(type, parts[1]);

        c.className = 'lesson-card' + (effType ? ' type-' + effType : '');

        let questionsHtml = '';
        if (effType === 'Семинар' || effType === 'Практика') {
          const { name, topic } = parseSubjectForQuestions(parts[0], parts[1]);
          const verified = verifiedLesson(name, effType, topic, g, d, w, num);
          if (verified) {
            questionsHtml = renderQuestionList(name, topic, verified.questions, verified, effType);
          } else if (verified === null) {
            questionsHtml = '<p class="seminar-q-note">Вопросы и форма контроля не подтверждены: тема в расписании не совпадает со строкой учебной программы.</p>';
          } else if (effType === 'Семинар') {
            let effTopic = topic;
            if (topic) {
              const k = name + '|' + topic;
              if ((topicTotal[k] || 0) > 1) {
                topicSeen[k] = (topicSeen[k] || 0) + 1;
                effTopic = topic + '/' + topicSeen[k];
              }
            }
            questionsHtml = renderQuestions(parts[0], parts[1], effTopic);
          }
        }

        const content = splitLocation(parts[0], parts[1]);
        c.innerHTML =
          `<div class="lesson-time"><span class="num">${num}</span>${time}</div>` +
          `<div class="lesson-body">` +
          `${effType ? `<span class="badge type-${effType}">${effType}</span><br>` : ''}` +
          `<p class="subject">${content.subject}</p>` +
          `${content.locations.length ? `<div class="lesson-location">${content.locations.map(escapeHtml).join(' · ')}</div>` : ''}` +
          `${content.details ? `<div class="details">${content.details}</div>` : ''}` +
          `${questionsHtml}` +
          `</div>`;
        l.append(c);
      });
      p.append(l);
    }
    root.append(p);
    applyActive();
    updateActive();
  };

  build();
}
function applyActive() {
  $$('.panel.active,.day-tab.active').forEach(x => x.classList.remove('active'));
  const g = state.group, d = checked('day'), w = +checked('week');
  $(`.panel-${g}-${d}-${w}`)?.classList.add('active');
  $(`label[for="day-${d}"]`)?.classList.add('active');
  const todayWeek = week(new Date());
  document.body.classList.toggle('is-current-week', w === todayWeek);
  updateWeekInfo();
}
function updateWeekInfo() {
  const monthEl = document.getElementById('week-month');
  const rangeEl = document.getElementById('week-range');
  const relEl   = document.getElementById('week-rel');
  if (!monthEl) return;

  const w      = +checked('week');
  const monday = new Date(START.getFullYear(), START.getMonth(), START.getDate() + w * 7);
  const sat    = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5);

  const MON     = ['января','февраля','марта','апреля','мая','июня',
                   'июля','августа','сентября','октября','ноября','декабря'];
  const MON_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                   'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  const sameMonth = monday.getMonth() === sat.getMonth();

  // Месяц сверху
  monthEl.textContent = sameMonth
    ? MON_NOM[monday.getMonth()] + ' ' + monday.getFullYear()
    : MON_NOM[monday.getMonth()] + ' – ' + MON_NOM[sat.getMonth()].toLowerCase();
  if (rangeEl) {
    rangeEl.textContent = sameMonth
      ? monday.getDate() + '–' + sat.getDate() + ' ' + MON[monday.getMonth()]
      : monday.getDate() + ' ' + MON[monday.getMonth()] + ' – ' + sat.getDate() + ' ' + MON[sat.getMonth()];
  }


  // Текущая неделя / сегодня
  const now = new Date();
  const isCurrentWeek = w === week(now);
  relEl.textContent = isCurrentWeek ? 'Текущая неделя' : '';

  const todayButton = document.getElementById('today-jump');
  if (todayButton) todayButton.disabled = isCurrentWeek && checked('day') === day(now);

  // Границы стрелок
  const prev = document.getElementById('week-prev');
  const next = document.getElementById('week-next');
  if (prev) prev.disabled = w <= 0;
  if (next) next.disabled = w >= MAX;
}

// Клики по стрелкам
document.getElementById('week-prev')?.addEventListener('click', () => {
  const w = +checked('week');
  if (w <= 0) return;

  slideDir = 'right';

  set('week-' + (w - 1));
  set('day-mon');

  updateDayNumbers();
  render();
});

document.getElementById('week-next')?.addEventListener('click', () => {
  const w = +checked('week');
  if (w >= MAX) return;

  slideDir = 'left';

  set('week-' + (w + 1));
  set('day-mon');

  updateDayNumbers();
  render();
});

document.getElementById('today-jump')?.addEventListener('click', () => {
  const now = new Date();
  set('week-' + week(now));
  set('day-' + day(now));
  updateDayNumbers();
  render();
});
function updateDayNumbers() {
  const w = +checked('week');
  const m = new Date(START.getFullYear(), START.getMonth(), START.getDate() + w * 7);
  const today = new Date().toDateString();
  DAYS.forEach((d, i) => {
    const e = $('#daynum-' + d);
    const x = new Date(m.getFullYear(), m.getMonth(), m.getDate() + i);
    if (e) {
      e.textContent = x.getDate();
      e.classList.toggle('is-today', x.toDateString() === today);
    }
  });
}

function updateDayGlance(row) {
  const out = document.getElementById('day-glance');
  if (!out) return;

  const w = +checked('week');
  const d = checked('day');
  const dayIndex = DAYS.indexOf(d);
  const date = new Date(START.getFullYear(), START.getMonth(), START.getDate() + w * 7 + Math.max(0, dayIndex));
  const weekDay = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()];
  const lessons = row?.[3] || [];
  const last = lessons
    .map(([, num]) => TIMES[num])
    .filter(Boolean)
    .sort((a, b) => a[1] - b[1])
    .at(-1);

  out.textContent = lessons.length
    ? `${weekDay} · ${lessons.length} ${lessons.length === 1 ? 'пара' : lessons.length < 5 ? 'пары' : 'пар'} · до ${String(Math.floor(last[1] / 60)).padStart(2, '0')}:${String(last[1] % 60).padStart(2, '0')}`
    : `${weekDay} · занятий нет`;

  const now = new Date();
  out.classList.toggle('is-today', date.toDateString() === now.toDateString());
}

function updateActive() {
  $$('.lesson-card.is-now').forEach(x => x.classList.remove('is-now'));
  const panel = $('.panel.active');
  if (!panel) { renderStatus(); return; }

  const n = new Date();
  if (n.getDay() && day(n) === checked('day') && week(n) === +checked('week')) {
    const nowMinutes = n.getHours() * 60 + n.getMinutes();
    $$('.lesson-card', panel).forEach(c => {
      const lesson = TIMES[c.querySelector('.num')?.textContent.trim()];
      c.classList.toggle('is-now', Boolean(lesson && nowMinutes >= lesson[0] && nowMinutes < lesson[1]));
    });
  }
  renderStatus();
}

// ─── СТАТУС-БАР «до пары / перемена» ───────────────────────────
// ─── СТАТУС-БАР «до пары / перемена» ───────────────────────────
function fmtSecs(totalSec) {
  totalSec = Math.max(0, Math.round(totalSec));
  const h  = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const p2 = n => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + p2(mm) + ':' + p2(ss) : mm + ':' + p2(ss);
}

let lastStatusKey = '';

function renderStatus() {
  const bar = document.getElementById('status-bar');
  if (!bar) return;

  const hide = () => {
    if (bar.classList.contains('show')) {
      bar.className = 'status-bar';
      bar.innerHTML = '';
    }
    lastStatusKey = '';
  };

  // Показываем только в текущий день / неделю
  const now = new Date();
  if (!now.getDay()) return hide();
  if (checked('day') !== day(now)) return hide();
  if (week(now) !== +checked('week')) return hide();

  const panel = document.querySelector('.panel.active');
  if (!panel) return hide();

  const lessons = [...panel.querySelectorAll('.lesson-card')].map(c => {
    const num = c.querySelector('.num')?.textContent.trim();
    const subject = c.querySelector('.subject')?.textContent.trim() || '';
    const r = TIMES[num];
    return r ? { start: r[0], end: r[1], subject } : null;
  }).filter(Boolean).sort((a, b) => a.start - b.start);

  if (!lessons.length) return hide();

  const mSec = (now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds();

  const current = lessons.find(l => mSec >= l.start * 60 && mSec < l.end * 60);
  const next    = lessons.find(l => l.start * 60 > mSec);
  const prev    = [...lessons].reverse().find(l => l.end * 60 <= mSec);

  // ── ключ состояния: если он не менялся — только обновляем счётчики
  let key;
  if (current) {
    key = 'now|' + current.subject + '|' + current.start + '|' + current.end;
  } else if (next) {
    const soon = (next.start * 60 - mSec) <= 600;
    key = 'next|' + next.subject + '|' + next.start + '|' + (prev ? 'p' : 's') + '|' + (soon ? 'soon' : 'brk');
  } else {
    key = 'done';
  }

  if (key !== lastStatusKey) {
    lastStatusKey = key;

    if (current) {
      bar.className = 'status-bar show';
      bar.innerHTML =
        '<div class="sb-main">' +
          '<div class="sb-line1">Сейчас идёт</div>' +
          '<div class="sb-line2">' + escapeHtml(current.subject) + '</div>' +
        '</div>' +
        '<div class="sb-countdown">' +
          '<div class="sb-countdown-time">--:--</div>' +
          '<div class="sb-countdown-label">до конца</div>' +
        '</div>' +
        '<div class="sb-progress"><div class="sb-progress-fill"></div>' +
        '</div>';
    } else if (next) {
      const soon = (next.start * 60 - mSec) <= 600;
      bar.className = 'status-bar show ' + (soon ? 'sb-soon' : 'sb-break');
      bar.innerHTML =
        '<div class="sb-main">' +
          '<div class="sb-line1">' + (prev ? 'Перемена' : 'До начала') + '</div>' +
          '<div class="sb-line2">' + escapeHtml(next.subject) + '</div>' +
        '</div>' +
        '<div class="sb-countdown">' +
          '<div class="sb-countdown-time">--:--</div>' +
          '<div class="sb-countdown-label">до пары</div>' +
        '</div>';
    } else {
      bar.className = 'status-bar show sb-free';
      bar.innerHTML =
        '<div class="sb-main">' +
          '<div class="sb-line1">Занятия окончены</div>' +
          '<div class="sb-line2">На сегодня всё</div>' +
        '</div>';
      return;
    }
  }

  // ── обновляем «живые» цифры и прогресс
  const timeEl = bar.querySelector('.sb-countdown-time');
  const fillEl = bar.querySelector('.sb-progress-fill');
  if (current) {
    const totalSec  = (current.end - current.start) * 60;
    const passedSec = Math.max(0, mSec - current.start * 60);
    const leftSec   = Math.max(0, totalSec - passedSec);
    const pct       = Math.max(0, Math.min(100, (passedSec / totalSec) * 100));

    if (timeEl) timeEl.textContent = fmtSecs(leftSec);
    if (fillEl) fillEl.style.width = pct + '%';
  } else if (next) {
    const untilSec = Math.max(0, next.start * 60 - mSec);
    if (timeEl) timeEl.textContent = fmtSecs(untilSec);
  }
}

// ─── СОБЫТИЯ ───────────────────────────────────────────────────
// Смена дня — просто рендерим
// Смена дня
$$('input[name="day"]').forEach(r => r.onchange = () => {
  updateDayNumbers();
  render();
});

// Смена недели
$$('input[name="week"]').forEach(r => r.onchange = () => {
  set('day-mon');
  updateDayNumbers();
  render();
});

document.getElementById('schedule')?.addEventListener('click', e => {
  const link = e.target.closest('.ask-deepseek');
  if (!link) return;

  const block = link.closest('.seminar-q');
  const lesson = link.closest('.lesson-card');
  const status = link.parentElement.querySelector('.ask-deepseek-status');
  const subject = lesson?.querySelector('.subject')?.textContent.trim() || '';
  const lessonKind = lesson?.classList.contains('type-Практика') ? 'практическому занятию' : 'семинару';
  const questions = [...block.querySelectorAll('.q-text')]
    .map((item, index) => `${index + 1}. ${item.textContent.trim()}`)
    .join('\n');
  const topic = block.querySelector('summary')?.textContent.trim() || 'Вопросы к семинару';
  const prompt = `Помоги подготовиться к ${lessonKind}${subject ? ` по дисциплине «${subject}»` : ''} (${topic}).\n` +
    'Ответь на каждый вопрос отдельно и структурированно, понятными словами. Выдели ключевые понятия и приведи короткие примеры. ' +
    'Если вопрос юридический, опирайся на действующее законодательство Республики Беларусь на дату ответа: указывай нормативные правовые акты и конкретные статьи, не подменяй их нормами других стран. ' +
    'Если не можешь проверить актуальность нормы или источник, прямо сообщи об этом и не выдумывай ссылки.\n\n' +
    `Вопросы:\n${questions}`;

  const copyFallback = () => {
    const field = document.createElement('textarea');
    field.value = prompt;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    field.remove();
    return copied;
  };

  if (status) status.textContent = 'Копирую вопросы…';
  let copyPromise;
  try {
    copyPromise = navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(prompt).then(() => true).catch(copyFallback)
      : Promise.resolve(copyFallback());
  } catch (error) {
    copyPromise = Promise.resolve(copyFallback());
  }

  copyPromise.then(copied => {
    if (status) status.textContent = copied
      ? 'Вопросы скопированы — вставь их в чат с ИИ.'
      : 'Не удалось скопировать. Выдели вопросы и скопируй вручную.';
  });
});

// ─── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────
const n = new Date();
if (!selectSharedSchedule()) {
  set('day-' + day(n));
  set('week-' + week(n));
}
renderSwitcher();
updateDayNumbers();
render();

let last = n.toDateString();
setInterval(() => {
  const x = new Date();
  if (x.toDateString() !== last) {
    last = x.toDateString();
    set('day-' + day(x));
    set('week-' + week(x));
    updateDayNumbers();
    render();
  } else {
    updateActive();
  }
}, 1000);
// ─── СВАЙПЫ МЕЖДУ ДНЯМИ ───────────────────────────────────────
(function initSwipes(){
  const DAYS_ORDER = ['mon','tue','wed','thu','fri','sat'];
  const target = document.getElementById('schedule');
  if (!target) return;

  let startX = 0, startY = 0, tracking = false;

  target.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  }, {passive:true});

  // Если палец явно ушёл вверх/вниз — отменяем свайп, пусть скроллит
  target.addEventListener('touchmove', e => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startX);
    const dy = Math.abs(t.clientY - startY);
    if (dy > 12 && dy > dx) tracking = false;
  }, {passive:true});

  target.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Горизонталь должна быть явно больше вертикали
    if (Math.abs(dx) < 55) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return;

    const cur = checked('day');
    const i = DAYS_ORDER.indexOf(cur);
    if (i < 0) return;

    const goNext = dx < 0;      // свайп влево → следующий
    const goPrev = dx > 0;      // свайп вправо → предыдущий

    if (goNext && i < DAYS_ORDER.length - 1) {
      slideDir = 'left';
      set('day-' + DAYS_ORDER[i + 1]);
    } else if (goPrev && i > 0) {
      slideDir = 'right';
      set('day-' + DAYS_ORDER[i - 1]);
    } else {
      // На краю — переключаем неделю
      const w = +checked('week');
      if (goNext && w < MAX) {
        slideDir = 'left';
        set('week-' + (w + 1));
        set('day-mon');
      } else if (goPrev && w > 0) {
        slideDir = 'right';
        set('week-' + (w - 1));
        set('day-sat');
      } else {
        return;
      }
    }

    if (navigator.vibrate) navigator.vibrate(8);
    updateDayNumbers();
    render();
  }, {passive:true});
})();
})();
