const errors = {
  admin_required: 'Войдите в кабинет снова.',
  invalid_session: 'Сеанс завершён. Войдите снова.',
  registration_changed: 'Эта регистрация уже изменилась. Выберите запись заново.'
};

function normalized(value) {
  return String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
}

function appendText(parent, tag, content, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  parent.append(node);
  return node;
}

export function setupAttendanceRegistrations(call, afterRemoval) {
  const panel = document.getElementById('attendance-registrations');
  if (!panel) return null;
  const search = document.getElementById('attendance-registrations-search');
  const refresh = document.getElementById('attendance-registrations-refresh');
  const message = document.getElementById('attendance-registrations-message');
  const list = document.getElementById('attendance-registrations-list');
  let accounts = [];
  let pending = false;
  let revision = 0;
  let feedback = '';

  function render() {
    refresh.disabled = pending;
    const term = normalized(search.value).replace(/^@/, '');
    const visible = accounts.filter(account =>
      [account.name, account.telegramName, account.username, account.telegramId, account.group]
        .some(value => normalized(value).includes(term)));

    message.textContent = feedback || (!visible.length && term ? 'По этому запросу никого нет.' :
      accounts.length ? `Показано ${visible.length} из ${accounts.length}` : 'Завершённых регистраций пока нет.');
    list.replaceChildren(...visible.map(account => {
      const row = document.createElement('li');
      const details = document.createElement('div');
      row.append(details);
      appendText(details, 'strong', account.name);
      appendText(details, 'p', `Группа ${account.group}${account.role === 'leader' ? ' · Староста' : ''}`);
      const username = account.username ? `@${account.username}${account.usernameFromExport ? ' (из выгрузки)' : ''}` : 'Без @username';
      const telegramName = account.telegramName ? `${account.telegramName} · ` : '';
      appendText(details, 'p', `${telegramName}${username} · ID ${account.telegramId}`);
      const remove = appendText(row, 'button', 'Удалить', 'admin-remove-registration');
      remove.type = 'button';
      remove.disabled = pending;
      remove.setAttribute('aria-label', `Удалить регистрацию ${account.name}`);
      remove.addEventListener('click', () => removeAccount(account));
      return row;
    }));
  }

  function showError(error, fallback) {
    if (error.message === 'admin_required' || error.message === 'invalid_session') accounts = [];
    feedback = errors[error.message] || fallback;
  }

  async function load(resultText = '') {
    const request = ++revision;
    pending = true;
    feedback = 'Загружаем регистрации…';
    render();
    try {
      const data = await call('admin_registrations');
      if (request !== revision) return;
      accounts = data.registrations;
      feedback = resultText;
    } catch (error) {
      if (request === revision) showError(error, 'Не удалось загрузить список.');
    } finally {
      if (request === revision) {
        pending = false;
        render();
      }
    }
  }

  async function removeAccount(account) {
    if (pending) return;
    if (!window.confirm(`Удалить регистрацию «${account.name}»? Telegram-аккаунт потеряет доступ, а запись в группе освободится.`)) return;

    const request = ++revision;
    pending = true;
    feedback = 'Удаляем регистрацию…';
    render();
    try {
      await call('admin_remove_registration', { telegramId: account.telegramId, memberId: account.memberId });
      if (request !== revision) return;
      accounts = accounts.filter(item => item.telegramId !== account.telegramId);
      feedback = 'Регистрация удалена. Вход аккаунта заблокирован.';
      void afterRemoval();
    } catch (error) {
      if (request !== revision) return;
      if (error.message === 'registration_changed') await load(errors.registration_changed);
      else showError(error, 'Не удалось удалить регистрацию.');
    } finally {
      if (request === revision) {
        pending = false;
        render();
      }
    }
  }

  refresh.addEventListener('click', () => load());
  search.addEventListener('input', () => {
    if (!pending) feedback = '';
    render();
  });
  return {
    showFor(profile) {
      if (profile?.role === 'system_admin') {
        if (panel.hidden) {
          panel.hidden = false;
          load();
        }
      } else {
        ++revision;
        panel.hidden = true;
        accounts = [];
        search.value = '';
        list.replaceChildren();
      }
    }
  };
}
