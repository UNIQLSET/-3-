const calendarMarkup = `
<button id="attendance-date-button" class="attendance-date-button" type="button" aria-haspopup="dialog" aria-controls="attendance-calendar" aria-expanded="false">
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/></svg>
  <span id="attendance-date-text"></span>
</button>
<dialog id="attendance-calendar" class="attendance-calendar" aria-labelledby="attendance-calendar-month">
  <div class="attendance-calendar-header">
    <button class="attendance-calendar-arrow" type="button" data-month-step="-1" aria-label="Предыдущий месяц"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
    <h3 id="attendance-calendar-month" aria-live="polite"></h3>
    <button class="attendance-calendar-arrow" type="button" data-month-step="1" aria-label="Следующий месяц"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
  </div>
  <div class="attendance-calendar-weekdays" aria-hidden="true">
    <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
  </div>
  <div id="attendance-calendar-days" class="attendance-calendar-days" role="group" aria-labelledby="attendance-calendar-month"></div>
  <div class="attendance-calendar-footer">
    <span id="attendance-calendar-legend" class="attendance-calendar-legend" hidden>Есть пары</span>
    <button id="attendance-calendar-close" type="button">Закрыть</button>
    <button id="attendance-calendar-today" type="button">Сегодня</button>
  </div>
</dialog>
`;

const todayFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit'
});
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full', timeZone: 'UTC' });

function today() {
  const parts = Object.fromEntries(todayFormat.formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function utcDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function dayOfWeek(value) {
  return (utcDate(value).getUTCDay() + 6) % 7;
}

function shiftDays(value, amount) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(value, amount) {
  const date = utcDate(value);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

function capitalized(value) {
  return value[0].toLocaleUpperCase('ru-RU') + value.slice(1);
}

export function setupAttendanceCalendar(onSelect) {
  document.getElementById('attendance-date-control').innerHTML = calendarMarkup;
  const trigger = document.getElementById('attendance-date-button');
  const selectedLabel = document.getElementById('attendance-date-text');
  const dialog = document.getElementById('attendance-calendar');
  const title = document.getElementById('attendance-calendar-month');
  const days = document.getElementById('attendance-calendar-days');
  const legend = document.getElementById('attendance-calendar-legend');
  let selected = today();
  let focused = selected;
  let group = null;
  let scheduledPairs;
  let scheduleRequest;

  function updateTrigger() {
    selectedLabel.textContent = capitalized(shortFormat.format(utcDate(selected)));
    trigger.setAttribute('aria-label', `Выбрать дату. ${fullFormat.format(utcDate(selected))}`);
  }

  function updateIndicators() {
    let any = false;
    for (const button of days.children) {
      const value = button.dataset.date;
      const hasPairs = !!(group && scheduledPairs?.(group, value).length);
      button.classList.toggle('attendance-calendar-has-pairs', hasPairs);
      button.setAttribute('aria-label', fullFormat.format(utcDate(value)) + (hasPairs ? ', есть пары' : ''));
      any ||= hasPairs;
    }
    legend.hidden = !any;
  }

  function render(focusDay = false) {
    const month = focused.slice(0, 7);
    const first = `${month}-01`;
    const start = shiftDays(first, -dayOfWeek(first));
    const now = today();
    title.textContent = capitalized(monthFormat.format(utcDate(first)));
    const cells = Array.from({ length: 42 }, (_, index) => {
      const value = shiftDays(start, index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'attendance-calendar-day';
      button.classList.toggle('attendance-calendar-adjacent', !value.startsWith(month));
      button.textContent = String(utcDate(value).getUTCDate());
      button.dataset.date = value;
      button.tabIndex = value === focused ? 0 : -1;
      button.setAttribute('aria-pressed', String(value === selected));
      if (value === now) button.setAttribute('aria-current', 'date');
      return button;
    });
    days.replaceChildren(...cells);
    updateIndicators();
    if (focusDay) cells.find(cell => cell.tabIndex === 0)?.focus({ preventScroll: true });
  }

  function select(value) {
    const changed = value !== selected;
    selected = value;
    updateTrigger();
    dialog.close();
    if (changed) onSelect();
  }

  trigger.addEventListener('click', () => {
    focused = selected;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    render(true);
    scheduleRequest ??= import('./schedule.js').then(module => {
      scheduledPairs = module.scheduledPairs;
      if (dialog.open) updateIndicators();
    }).catch(() => { scheduleRequest = undefined; });
  });

  for (const button of dialog.querySelectorAll('[data-month-step]')) {
    button.addEventListener('click', () => {
      focused = shiftMonth(focused, Number(button.dataset.monthStep));
      render();
    });
  }

  days.addEventListener('click', event => {
    const cell = event.target.closest('[data-date]');
    if (cell) select(cell.dataset.date);
  });

  days.addEventListener('keydown', event => {
    const value = event.target.dataset.date;
    if (!value) return;

    switch (event.key) {
      case 'ArrowLeft': focused = shiftDays(value, -1); break;
      case 'ArrowRight': focused = shiftDays(value, 1); break;
      case 'ArrowUp': focused = shiftDays(value, -7); break;
      case 'ArrowDown': focused = shiftDays(value, 7); break;
      case 'Home': focused = shiftDays(value, -dayOfWeek(value)); break;
      case 'End': focused = shiftDays(value, 6 - dayOfWeek(value)); break;
      case 'PageUp': focused = shiftMonth(value, event.shiftKey ? -12 : -1); break;
      case 'PageDown': focused = shiftMonth(value, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    render(true);
  });

  document.getElementById('attendance-calendar-today').addEventListener('click', () => select(today()));
  document.getElementById('attendance-calendar-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
  });

  updateTrigger();
  return {
    get value() { return selected; },
    setDisabled(disabled) { trigger.disabled = disabled; },
    setGroup(value) {
      group = value;
      if (!group && dialog.open) dialog.close();
      if (dialog.open) updateIndicators();
    }
  };
}
