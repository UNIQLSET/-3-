import { setupAttendanceCalendar } from './attendance-calendar.js';

const statuses = new Map([
  ['Б', { label: 'Болезнь', color: 'rose' }],
  ['УП', { label: 'Уважительная причина по заявлению', color: 'gold' }],
  ['ПН', { label: 'Неуважительная причина', color: 'rose' }],
  ['СБ', { label: 'Спортивные сборы', color: 'blue' }],
  ['ОМ', { label: 'Общественные мероприятия', color: 'blue' }],
  ['Ц', { label: 'ЦКВР', color: 'gold' }],
  ['ПР', { label: 'Присутствовал', color: 'teal' }]
]);

const errors = {
  invalid_date: 'Выберите дату.',
  invalid_session: 'Сеанс завершён. Войдите снова.',
  admin_required: 'Войдите в кабинет снова.',
  leader_required: 'Аналитика доступна старосте группы.',
  invalid_period: 'Укажи дату начала и дату окончания периода.',
  invalid_mark: 'Выберите пары и статус.',
  unscheduled_pair: 'На эту дату по расписанию нет выбранных пар.',
  reason_too_long: 'Причина должна быть не длиннее 500 знаков.',
  group_changed: 'Группа изменилась. Обновите страницу.'
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const nameOrder = new Intl.Collator('ru', { sensitivity: 'base' });
const pairCountRule = new Intl.PluralRules('ru');
const pairCountWords = { one: 'пара', few: 'пары', many: 'пар', other: 'пар' };
const periodFormat = new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function setupAnalytics(call) {
  const disclosure = document.getElementById('attendance-analytics');
  const filter = document.getElementById('attendance-analytics-filter');
  if (!disclosure || !filter) return null;

  const message = document.getElementById('attendance-analytics-message');
  const table = document.getElementById('attendance-analytics-table');
  const caption = document.getElementById('attendance-analytics-period');
  const fromInput = document.getElementById('attendance-analytics-from');
  const toInput = document.getElementById('attendance-analytics-to');
  const body = table.tBodies[0];
  let group = null;
  let period;
  let request = 0;
  let pending = false;
  let loadingMessage;

  function stopLoading() {
    clearTimeout(loadingMessage);
    pending = false;
    table.removeAttribute('aria-busy');
    message.textContent = '';
  }

  async function load() {
    const revision = ++request;
    const { from, to } = period;
    stopLoading();
    pending = true;
    table.setAttribute('aria-busy', 'true');
    loadingMessage = setTimeout(() => {
      message.textContent = 'Загружаем сводку…';
    }, 300);
    try {
      const { students } = await call('attendance_unexcused_summary', { from, to });
      if (revision !== request) return;
      stopLoading();
      students.sort((a, b) => b.pairs - a.pairs || nameOrder.compare(a.name, b.name));
      const start = periodFormat.format(new Date(`${from}T00:00:00Z`));
      const end = periodFormat.format(new Date(`${to}T00:00:00Z`));
      caption.textContent = from === to ? start : `${start} — ${end}`;
      body.replaceChildren(...students.map(student => {
        const row = element('tr');
        row.classList.toggle('attendance-analytics-zero', student.pairs === 0);
        const name = element('th', '', student.name);
        name.scope = 'row';
        row.append(name, element('td', '', String(student.pairs)), element('td', '', String(student.days)));
        return row;
      }));
      message.textContent = students.length ? '' : 'В списке группы пока нет студентов.';
      table.hidden = !students.length;
    } catch (error) {
      if (revision !== request) return;
      stopLoading();
      if (error.message === 'leader_required' || error.message === 'invalid_session') {
        setGroup(null, null);
        return;
      }
      message.textContent = errors[error.message] || 'Не удалось загрузить сводку. Нажми «Показать», чтобы повторить.';
    }
  }

  function setGroup(value, leaderGroup) {
    if (group === leaderGroup) return;
    group = leaderGroup;
    ++request;
    stopLoading();
    disclosure.hidden = !group;
    disclosure.open = false;
    table.hidden = true;
    caption.textContent = '';
    body.replaceChildren();
    period = undefined;
    fromInput.value = '';
    toInput.value = '';
    if (!group) return;

    const from = `${value.slice(0, 7)}-01`;
    const lastDay = new Date(`${from}T00:00:00Z`);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    const to = lastDay.toISOString().slice(0, 10);
    period = { from, to };
    fromInput.value = from;
    toInput.value = to;
    load();
  }

  filter.addEventListener('submit', event => {
    event.preventDefault();
    if (!group) return;
    const from = fromInput.value;
    const to = toInput.value;
    if (!from || !to || from > to) {
      message.textContent = 'Дата окончания должна быть не раньше даты начала.';
      return;
    }
    if (pending && from === period.from && to === period.to) return;
    period = { from, to };
    load();
  });
  return {
    setGroup,
    refresh(value) {
      if (period && value >= period.from && value <= period.to) load();
    }
  };
}

function makeList(day, marks, absencesOnly) {
  const people = new Map();
  for (const mark of marks) {
    if (!people.has(mark.memberId)) people.set(mark.memberId, { name: mark.name, entries: new Map() });
    const entries = people.get(mark.memberId).entries;
    const key = JSON.stringify([mark.status, mark.reason]);
    if (!entries.has(key)) entries.set(key, { status: mark.status, reason: mark.reason, pairs: [] });
    entries.get(key).pairs.push(mark.pair);
  }

  const sortedPeople = [...people.values()];
  if (absencesOnly) sortedPeople.sort((a, b) => nameOrder.compare(a.name, b.name));
  return sortedPeople.map(person => {
    const row = element('li', 'attendance-person');
    row.append(element('strong', 'attendance-person-name', person.name));
    const entries = element('ul', 'attendance-person-marks');
    const personEntries = [...person.entries.values()];
    if (absencesOnly) {
      for (const entry of personEntries) entry.pairs.sort((a, b) => a - b);
      personEntries.sort((a, b) => a.pairs[0] - b.pairs[0]);
    }
    for (const entry of personEntries) {
      const status = statuses.get(entry.status);
      const details = element('li', 'attendance-person-mark');
      const badge = element(absencesOnly ? 'abbr' : 'span', 'attendance-mark-badge', entry.status);
      badge.dataset.color = status.color;
      const count = entry.pairs.length;
      const allPairs = count === day.pairs.length;
      if (absencesOnly) {
        badge.title = status.label;
        details.append(badge, element('span', 'attendance-mark-pairs', `${count} ${pairCountWords[pairCountRule.select(count)]}`));
        if (!allPairs) details.append(element('span', 'attendance-mark-caption', `№ ${entry.pairs.join(', ')}`));
        if (entry.reason) details.append(element('q', 'attendance-private-reason', entry.reason));
      } else {
        const scope = count === 1 ? `${entry.pairs[0]}-я пара` :
          allPairs ? 'Все пары' : `Пары ${entry.pairs.join(', ')}`;
        details.append(badge, element('span', 'attendance-mark-caption', `${status.label} · ${scope}`));
        if (entry.reason) details.append(element('p', 'attendance-private-reason', `Причина · ${entry.reason}`));
      }
      entries.append(details);
    }
    row.append(entries);
    return row;
  });
}

export function setupAttendanceMarks(call) {
  const panel = document.getElementById('attendance-marks');
  if (!panel) return null;

  const calendar = setupAttendanceCalendar(() => loadDate());
  const analytics = setupAnalytics(call);
  const message = document.getElementById('attendance-mark-message');
  const form = document.getElementById('attendance-mark-form');
  const reviewGroup = document.getElementById('attendance-review-group');
  const scope = document.getElementById('attendance-pair');
  const status = document.getElementById('attendance-status');
  const reasonField = document.getElementById('attendance-reason-field');
  const reason = document.getElementById('attendance-reason');
  const clear = document.getElementById('attendance-clear-mark');
  const groupMarks = document.getElementById('attendance-group-marks');
  const groupTitle = document.getElementById('attendance-group-marks-title');
  const list = document.getElementById('attendance-mark-list');
  const personalMark = document.getElementById('attendance-personal-mark');
  const absenceCount = document.getElementById('attendance-absence-count');
  const absenceEmpty = document.getElementById('attendance-absence-empty');

  let revision = 0;
  let saving = false;
  let day = null;
  let loadingDate;
  let dayLoadingMessage;
  let activeGroup = null;
  let activeRole = null;

  function updateReason() {
    const showReason = status.value === 'ПН';
    reasonField.hidden = !showReason;
    reason.disabled = saving || !day || !showReason;
    if (!showReason) reason.value = '';
  }

  function updateEditorControls() {
    if (!form) return;
    for (const control of form.elements) control.disabled = saving || !day;
    updateReason();
  }

  function clearDay() {
    ++revision;
    clearTimeout(dayLoadingMessage);
    loadingDate = undefined;
    day = null;
    groupMarks.hidden = true;
    groupMarks.removeAttribute('aria-busy');
    list.replaceChildren();
    if (personalMark) personalMark.hidden = true;
    if (form) {
      form.hidden = true;
      form.removeAttribute('aria-busy');
      form.reset();
      updateEditorControls();
    }
  }

  function updateClear() {
    clear.hidden = !day?.marks.some(mark => mark.mine && (scope.value === 'all' || mark.pair === Number(scope.value)));
  }

  function showEditor(selectedScope) {
    scope.replaceChildren(new Option('Все пары', 'all'), ...day.pairs.map(pair =>
      new Option(`${pair.number}-я пара · ${pair.subject}${pair.time ? ` · ${pair.time}` : ''}`, String(pair.number))));
    if ([...scope.options].some(option => option.value === selectedScope)) scope.value = selectedScope;

    const placeholder = new Option('Выберите статус', '', true, true);
    placeholder.disabled = true;
    status.replaceChildren(placeholder, ...[...statuses].map(([code, { label }]) =>
      new Option(`${code} · ${label}`, code)));
    updateEditorControls();
    updateClear();
    form.hidden = false;
    if (personalMark) personalMark.hidden = false;
  }

  async function loadDate(feedback = '', selectedScope = 'all') {
    const date = calendar.value;
    if (!feedback && loadingDate === date) return;
    const request = ++revision;
    loadingDate = date;
    clearTimeout(dayLoadingMessage);
    day = null;
    if (feedback) analytics?.refresh(date);
    updateEditorControls();
    form?.setAttribute('aria-busy', 'true');
    groupMarks.setAttribute('aria-busy', 'true');
    message.textContent = feedback;
    if (!feedback) dayLoadingMessage = setTimeout(() => {
      message.textContent = 'Загружаем пары и отметки…';
    }, 300);

    try {
      const data = reviewGroup
        ? await call('attendance_admin_day', { date, group: reviewGroup.value })
        : await call('attendance_day', { date });
      if (request !== revision) return;
      groupMarks.hidden = true;
      list.replaceChildren();
      if (!data.pairs.length) {
        if (personalMark) personalMark.hidden = true;
        if (form) form.hidden = true;
        message.textContent = 'На эту дату занятий по расписанию нет.';
        return;
      }

      day = data;
      if (form) showEditor(selectedScope);
      message.textContent = feedback || (reviewGroup && !day.marks.length ? 'За эту дату отметок пока нет.' : '');
      const absencesOnly = activeRole === 'leader' && !reviewGroup;
      const marks = absencesOnly ? day.marks.filter(mark => mark.status !== 'ПР') : day.marks;
      if (absencesOnly || marks.length) {
        const rows = makeList(day, marks, absencesOnly);
        list.replaceChildren(...rows);
        if (absencesOnly) {
          absenceCount.textContent = String(rows.length);
          absenceEmpty.hidden = rows.length > 0;
        }
        groupMarks.hidden = false;
      }
    } catch (error) {
      if (request !== revision) return;
      day = null;
      if (personalMark) personalMark.hidden = true;
      if (form) form.hidden = true;
      groupMarks.hidden = true;
      list.replaceChildren();
      message.textContent = errors[error.message] || 'Не удалось загрузить отметки.';
    } finally {
      if (request === revision) {
        clearTimeout(dayLoadingMessage);
        loadingDate = undefined;
        form?.removeAttribute('aria-busy');
        groupMarks.removeAttribute('aria-busy');
      }
    }
  }

  async function save(clearMark = false) {
    if (saving || !day || panel.hidden) return;
    const request = revision;
    const selectedScope = scope.value;
    const fields = {
      date: calendar.value,
      pair: selectedScope === 'all' ? null : Number(selectedScope),
      status: clearMark ? null : status.value,
      reason: !clearMark && status.value === 'ПН' ? reason.value.trim() || null : null
    };

    saving = true;
    calendar.setDisabled(true);
    updateEditorControls();
    message.textContent = 'Сохраняем…';
    try {
      await call('attendance_save', fields);
      if (request === revision) await loadDate(clearMark ? 'Отметка снята.' : 'Отметка сохранена.', selectedScope);
    } catch (error) {
      if (request === revision) message.textContent = errors[error.message] || 'Не удалось сохранить отметку.';
    } finally {
      saving = false;
      calendar.setDisabled(false);
      updateEditorControls();
    }
  }

  scope?.addEventListener('change', updateClear);
  status?.addEventListener('change', updateReason);
  form?.addEventListener('submit', event => {
    event.preventDefault();
    save();
  });
  clear?.addEventListener('click', () => save(true));
  reviewGroup?.addEventListener('change', () => {
    activeGroup = reviewGroup.value;
    clearDay();
    calendar.setGroup(reviewGroup.value);
    loadDate();
  });

  return {
    showFor(profile) {
      const group = reviewGroup ? (profile?.role === 'system_admin' ? reviewGroup.value : null) : profile?.group;
      const role = group ? profile.role : null;
      if (group !== activeGroup || role !== activeRole) clearDay();
      if (personalMark && role !== activeRole) {
        const isLeader = role === 'leader';
        personalMark.open = !isLeader;
        groupMarks.classList.toggle('attendance-absences', isLeader);
        groupTitle.textContent = isLeader ? 'Отсутствующие' : 'Отметки группы';
        absenceCount.hidden = !isLeader;
        absenceEmpty.hidden = true;
      }
      activeGroup = group;
      activeRole = role;
      calendar.setGroup(group);
      analytics?.setGroup(calendar.value, role === 'leader' ? group : null);
      if (group) {
        panel.hidden = false;
        loadDate();
      } else {
        panel.hidden = true;
        message.textContent = '';
      }
    }
  };
}
