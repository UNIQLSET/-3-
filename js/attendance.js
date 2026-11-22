import { setupAttendanceMarks } from './attendance-marks.js';
import { setupAttendanceRegistrations } from './attendance-registrations.js';
import { callAttendance as call } from './supabase.js';

const message = document.getElementById('attendance-message');
const form = document.getElementById('attendance-login-form');
const password = document.getElementById('attendance-admin-password');
const logout = document.getElementById('attendance-logout');
const profileMenu = document.getElementById('attendance-profile');
const profileName = document.getElementById('attendance-profile-name');
const profileRole = document.getElementById('attendance-profile-role');
const profileMessage = document.getElementById('attendance-profile-message');
const account = document.getElementById('attendance-account');
const claimForm = document.getElementById('attendance-claim-form');
const claimGroupSelect = document.getElementById('attendance-group');
const claimName = document.getElementById('attendance-full-name');
const registrationNote = document.getElementById('attendance-registration-note');
const leaderPanel = document.getElementById('attendance-leader-panel');
const leaderForm = document.getElementById('attendance-leader-form');
const leaderSelect = document.getElementById('attendance-leader');
const leaderTelegram = document.getElementById('attendance-leader-telegram');
const leaderMessage = document.getElementById('attendance-leader-message');
const adminPage = form.dataset.mode === 'admin';
const sessionKey = adminPage ? 'attendance-admin-session' : 'attendance-telegram-session';
const attemptKey = 'attendance-telegram-attempt';
const resultKey = 'attendance-telegram-result';
const previousToken = sessionStorage.getItem(sessionKey);
if (previousToken) {
  if (!localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, previousToken);
  sessionStorage.removeItem(sessionKey);
}

const sessionCall = (action, fields) => call(action, {
  ...fields, token: localStorage.getItem(sessionKey)
});
const marks = setupAttendanceMarks(sessionCall);
const registrations = setupAttendanceRegistrations(sessionCall, () => refreshLeaders(localStorage.getItem(sessionKey)));
const errors = {
  invalid_admin_login: 'Не удалось войти. Проверьте пароль.',
  telegram_admin_required: 'У этого аккаунта Telegram нет доступа к кабинету.',
  invalid_login: 'Подтверждение Telegram не удалось. Попробуйте войти ещё раз.',
  not_in_allowlist: 'Этого аккаунта Telegram нет в списке допущенных.',
  account_blocked: 'Доступ этого аккаунта заблокирован.',
  invalid_session: 'Сеанс завершён. Войдите снова.',
  invalid_group_details: 'Выберите группу и введите полное ФИО.',
  group_closed: 'Доступ пока открыт только для группы 4501.',
  not_in_group_roster: 'В списке этой группы такого ФИО нет. Проверьте группу и написание.',
  leader_requires_admin: 'Для привязки этой записи нужно подтвердить ваш Telegram ID.',
  member_already_linked: 'Эта запись уже привязана к другому аккаунту.',
  admin_required: 'Войдите в кабинет снова.',
  invalid_leader_details: 'Выберите запись старосты и укажите числовой Telegram ID.',
  invalid_leader: 'Запись старосты недоступна. Обновите страницу.',
  telegram_already_linked: 'Этот Telegram ID уже привязан к другой записи.',
  unavailable: 'Вход сейчас недоступен. Попробуйте позже.'
};

let busy = false;
let currentProfile = null;

function setBusy(value) {
  busy = value;
  for (const current of [form, claimForm, leaderForm]) {
    if (current) for (const control of current.elements) control.disabled = value;
  }
  logout.disabled = value;
}

function show(profile, text = '') {
  currentProfile = profile;
  form.hidden = !!profile;
  logout.hidden = !profile;
  if (profileMenu) {
    profileMenu.hidden = !profile;
    profileMenu.open = false;
    profileName.textContent = profile?.name || '';
    profileRole.textContent = profile?.group
      ? `Группа ${profile.group}${profile.role === 'leader' ? ' · Староста' : ''}`
      : '';
    profileRole.hidden = !profile?.group;
    profileMessage.textContent = '';
    account.hidden = !!profile?.group;
  }
  if (claimForm) claimForm.hidden = profile?.role !== 'unassigned';
  if (registrationNote) registrationNote.hidden = !!profile?.group;
  if (leaderPanel) leaderPanel.hidden = profile?.role !== 'system_admin';
  if (profile?.role === 'system_admin') {
    message.textContent = profile.name;
  } else if (profile?.role === 'unassigned') {
    message.textContent = `${profile.name} · Подтвердите ФИО для входа`;
  } else {
    message.textContent = text;
  }
  if (adminPage || !profile || location.hash === '#attendance') marks?.showFor(profile);
  registrations?.showFor(profile);
}

async function refreshLeaders(token, feedback = '') {
  try {
    const { leaders } = await call('admin_leaders', { token });
    const placeholder = new Option('Выберите запись', '', true, true);
    placeholder.disabled = true;
    leaderSelect.replaceChildren(placeholder, ...leaders.map(leader => {
      const option = new Option(`${leader.group} · ${leader.name}${leader.telegramId ? ' · привязан' : ''}`, leader.id);
      option.disabled = !!leader.telegramId;
      return option;
    }));
    leaderMessage.textContent = feedback || (leaders.length ? '' : 'В списках групп пока нет записей старост.');
  } catch (error) {
    leaderMessage.textContent = errors[error.message] || errors.unavailable;
  }
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startTelegramLogin() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const { url } = await call('telegram_start', { state, challenge: base64Url(new Uint8Array(digest)) });
  sessionStorage.setItem(attemptKey, JSON.stringify({ state, verifier, admin: adminPage, created: Date.now() }));
  location.assign(url);
}

async function redirectToTelegram() {
  if (busy) return;
  setBusy(true);
  message.textContent = 'Открываем Telegram…';
  try {
    await startTelegramLogin();
  } catch (error) {
    show(null, errors[error.message] || errors.unavailable);
    setBusy(false);
  }
}

async function finishTelegramLogin() {
  const raw = sessionStorage.getItem(resultKey);
  if (!raw) return false;

  const savedAttempt = sessionStorage.getItem(attemptKey);
  sessionStorage.removeItem(resultKey);
  sessionStorage.removeItem(attemptKey);
  const result = JSON.parse(raw);
  const attempt = JSON.parse(savedAttempt);
  if (!attempt || result.state !== attempt.state || !!attempt.admin !== adminPage || Date.now() - attempt.created > 10 * 60 * 1000) {
    throw new Error('invalid_login');
  }
  if (result.error === 'access_denied') {
    show(null, 'Вход через Telegram отменён.');
    return true;
  }
  if (!result.code) throw new Error('invalid_login');

  message.textContent = 'Проверяем аккаунт Telegram…';
  const { token, profile } = await call('telegram_exchange', { code: result.code, verifier: attempt.verifier, admin: adminPage });
  localStorage.setItem(sessionKey, token);
  show(profile);
  if (adminPage) await refreshLeaders(token);
  return true;
}

async function signIn(event) {
  event.preventDefault();
  if (busy) return;
  if (!adminPage) return redirectToTelegram();
  setBusy(true);
  message.textContent = 'Проверяем доступ…';
  try {
    const { token, profile } = await call('admin_login', { password: password.value });
    localStorage.setItem(sessionKey, token);
    form.reset();
    show(profile);
    await refreshLeaders(token);
  } catch (error) {
    show(null, errors[error.message] || errors.unavailable);
  } finally {
    setBusy(false);
  }
}

async function loadSession() {
  if (busy) return;
  const token = localStorage.getItem(sessionKey);
  if (!token && !sessionStorage.getItem(resultKey)) return;
  if (token) form.hidden = true;
  setBusy(true);
  try {
    if (await finishTelegramLogin()) return;
    if (!token) return;
    const { profile } = await call('session', { token });
    show(profile);
    if (adminPage && profile.role === 'system_admin') await refreshLeaders(token);
  } catch (error) {
    if (error.message === 'invalid_session') localStorage.removeItem(sessionKey);
    show(null, errors[error.message] || errors.unavailable);
  } finally {
    setBusy(false);
  }
}

async function claimGroup(event) {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  message.textContent = 'Проверяем список группы…';
  try {
    const token = localStorage.getItem(sessionKey);
    const { profile } = await call('claim_group', { token, group: claimGroupSelect.value, name: claimName.value.trim() });
    claimForm.reset();
    show(profile);
  } catch (error) {
    const text = errors[error.message] || errors.unavailable;
    if (error.message === 'invalid_session') {
      localStorage.removeItem(sessionKey);
      show(null, text);
    } else {
      message.textContent = text;
    }
  } finally {
    setBusy(false);
  }
}

async function assignLeader(event) {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  try {
    const token = localStorage.getItem(sessionKey);
    await call('admin_assign_leader', { token, memberId: leaderSelect.value, telegramId: leaderTelegram.value.trim() });
    leaderForm.reset();
    await refreshLeaders(token, 'Telegram ID привязан. Права старосты активны.');
  } catch (error) {
    leaderMessage.textContent = errors[error.message] || errors.unavailable;
  } finally {
    setBusy(false);
  }
}

async function signOut() {
  if (busy) return;
  setBusy(true);
  try {
    const token = localStorage.getItem(sessionKey);
    if (token) await call('logout', { token });
    localStorage.removeItem(sessionKey);
    show(null);
  } catch {
    (profileMessage || message).textContent = 'Не удалось выйти. Попробуйте ещё раз.';
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', signIn);
document.getElementById('attendance-admin-telegram')?.addEventListener('click', redirectToTelegram);
claimForm?.addEventListener('submit', claimGroup);
leaderForm?.addEventListener('submit', assignLeader);
logout.addEventListener('click', signOut);
if (profileMenu) document.addEventListener('click', event => {
  if (profileMenu.open && !profileMenu.contains(event.target)) profileMenu.open = false;
}, { capture: true });
if (!adminPage) window.addEventListener('hashchange', () => {
  if (profileMenu) profileMenu.open = false;
  if (location.hash !== '#attendance') return;
  if (currentProfile) marks?.showFor(currentProfile);
  else loadSession();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    setBusy(false);
    if (!localStorage.getItem(sessionKey)) show(null);
    loadSession();
  }
});
loadSession();
