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
      const badge = element('span', 'attendance-mark-badge', entry.status);
      badge.dataset.color = status.color;
      const scope = entry.pairs.length === 1 ? `${entry.pairs[0]}-я пара` :
        entry.pairs.length === day.pairs.length ? 'Все пары' : `Пары ${entry.pairs.join(', ')}`;
      if (absencesOnly) {
        details.append(badge, element('span', 'attendance-mark-caption', status.label),
          element('span', 'attendance-mark-pairs', scope));
      } else {
        details.append(badge, element('span', 'attendance-mark-caption', `${status.label} · ${scope}`));
      }
      if (entry.reason) details.append(element('p', 'attendance-private-reason', `Причина · ${entry.reason}`));
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
  let activeRole = null;

  function updateReason() {
    const showReason = status.value === 'ПН';
    reasonField.hidden = !showReason;
    reason.disabled = saving || !showReason;
    if (!showReason) reason.value = '';
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
    updateReason();
    updateClear();
    form.hidden = false;
  }

  async function loadDate(feedback = '', selectedScope = 'all') {
    const request = ++revision;
    if (form) form.hidden = true;
    groupMarks.hidden = true;
    list.replaceChildren();
    if (reason) reason.value = '';
    day = null;
    message.textContent = 'Загружаем пары и отметки…';

    try {
      const data = reviewGroup
        ? await call('attendance_admin_day', { date: calendar.value, group: reviewGroup.value })
        : await call('attendance_day', { date: calendar.value });
      if (request !== revision) return;
      day = data;
      if (!day.pairs.length) {
        message.textContent = 'На эту дату занятий по расписанию нет.';
        return;
      }

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
      if (request === revision) message.textContent = errors[error.message] || 'Не удалось загрузить отметки.';
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
    for (const control of form.elements) control.disabled = true;
    message.textContent = 'Сохраняем…';
    try {
      await call('attendance_save', fields);
      if (request === revision) await loadDate(clearMark ? 'Отметка снята.' : 'Отметка сохранена.', selectedScope);
    } catch (error) {
      if (request === revision) message.textContent = errors[error.message] || 'Не удалось сохранить отметку.';
    } finally {
      saving = false;
      calendar.setDisabled(false);
      for (const control of form.elements) control.disabled = false;
      updateReason();
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
    calendar.setGroup(reviewGroup.value);
    loadDate();
  });

  return {
    showFor(profile) {
      const group = reviewGroup ? (profile?.role === 'system_admin' ? reviewGroup.value : null) : profile?.group;
      const role = group ? profile.role : null;
      if (personalMark && role !== activeRole) {
        const isLeader = role === 'leader';
        personalMark.open = !isLeader;
        groupMarks.classList.toggle('attendance-absences', isLeader);
        groupTitle.textContent = isLeader ? 'Отсутствующие' : 'Отметки группы';
        absenceCount.hidden = !isLeader;
        absenceEmpty.hidden = true;
      }
      activeRole = role;
      calendar.setGroup(group);
      if (group) {
        panel.hidden = false;
        loadDate();
      } else {
        ++revision;
        panel.hidden = true;
        groupMarks.hidden = true;
        list.replaceChildren();
        form?.reset();
        day = null;
      }
    }
  };
}
