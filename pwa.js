// ─── PWA: регистрация SW + установка + автообновление ──────
(() => {

  const hadController = !!navigator.serviceWorker.controller;

  // 1. Регистрируем Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(reg => {
          reg.update();
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) reg.update();
          });

          // И раз в 15 минут — на всякий случай
          setInterval(() => reg.update(), 15 * 60 * 1000);
        })
        .catch(err => console.warn('SW registration failed:', err));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }



  // 2. Кнопка «Установить» (Chrome / Edge / Android)
  let deferredPrompt = null;

  const INSTALL_HIDDEN_KEY = 'schedule-install-hidden';
  const INSTALL_DISMISSED_KEY = 'schedule-install-dismissed';

  // Если пользователь уже запретил показывать — вообще ничего не делаем
  const installHidden = () => {
    try { return localStorage.getItem(INSTALL_HIDDEN_KEY) === '1'; } catch (e) { return false; }
  };

  // Если уже установлено / открыто как приложение — тоже не показываем
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    if (installHidden() || isStandalone()) return;
    deferredPrompt = e;
    showInstallButton();
  });

  function showInstallButton() {
    if (document.getElementById('pwa-install')) return;
    if (installHidden() || isStandalone()) return;

    // ─── сам бар ───
    const bar = document.createElement('div');
    bar.id = 'pwa-install';
    bar.style.cssText = `
      position:fixed; left:50%; transform:translateX(-50%);
      bottom:calc(14px + env(safe-area-inset-bottom,0px));
      z-index:9998;
      display:flex; align-items:center; gap:10px;
      padding:10px 12px 10px 16px;
      border-radius:100px;
      background:#1C2333; color:#EDEBE2;
      box-shadow:0 8px 24px rgba(0,0,0,.28);
      font:600 13.5px 'IBM Plex Sans',sans-serif;
      max-width:calc(100vw - 24px);
      animation:pwa-slide-up .35s ease-out;
      -webkit-tap-highlight-color:transparent;
    `;

    // ─── иконка + текст ───
    const label = document.createElement('span');
    label.textContent = '⤓ Установить приложение';
    label.style.cssText = `
      cursor:pointer;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    `;
    label.onclick = async () => {
      if (!deferredPrompt) return;
      bar.style.opacity = '.6';
      bar.style.pointerEvents = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        removeBar();
      } else {
        bar.style.opacity = '1';
        bar.style.pointerEvents = '';
      }
      deferredPrompt = null;
    };

    // ─── крестик «закрыть сейчас» ───
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Скрыть');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      flex:0 0 auto;
      width:26px; height:26px;
      border-radius:100px;
      border:1px solid rgba(255,255,255,.25);
      background:transparent;
      color:#EDEBE2;
      font:600 16px/1 'IBM Plex Sans',sans-serif;
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      padding:0;
      opacity:.75;
      transition:opacity .12s, background .12s;
    `;
    closeBtn.onmouseenter = () => { closeBtn.style.opacity = '1'; closeBtn.style.background = 'rgba(255,255,255,.1)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.opacity = '.75'; closeBtn.style.background = 'transparent'; };
    closeBtn.onclick = () => {
      // Запоминаем что в этот раз отказался — вернёмся через N дней
      try { localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString()); } catch (e) {}
      removeBar();
    };

    // ─── маленькая ссылка «больше не показывать» ───
    const neverBtn = document.createElement('button');
    neverBtn.type = 'button';
    neverBtn.textContent = 'не показывать';
    neverBtn.style.cssText = `
      flex:0 0 auto;
      border:0; background:transparent;
      color:#8E97AD;
      font:500 11px 'IBM Plex Mono',monospace;
      padding:4px 2px;
      cursor:pointer;
      text-decoration:underline;
      text-underline-offset:2px;
      white-space:nowrap;
    `;
    neverBtn.onmouseenter = () => { neverBtn.style.color = '#C9CDD9'; };
    neverBtn.onmouseleave = () => { neverBtn.style.color = '#8E97AD'; };
    neverBtn.onclick = () => {
      try { localStorage.setItem(INSTALL_HIDDEN_KEY, '1'); } catch (e) {}
      removeBar();
    };

    // ─── сборка ───
    bar.appendChild(label);
    bar.appendChild(neverBtn);
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);

    // ─── анимация ───
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pwa-slide-up {
        from { opacity:0; transform:translateX(-50%) translateY(20px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
      @keyframes pwa-slide-down {
        from { opacity:1; transform:translateX(-50%) translateY(0); }
        to   { opacity:0; transform:translateX(-50%) translateY(20px); }
      }
      #pwa-install.closing {
        animation:pwa-slide-down .2s ease-in forwards;
      }
      @media (max-width:520px){
        #pwa-install { font-size:12.5px !important; padding:9px 10px 9px 14px !important; }
        #pwa-install button[aria-label="Скрыть"] { width:24px !important; height:24px !important; }
      }
    `;
    document.head.appendChild(style);

    function removeBar() {
      const el = document.getElementById('pwa-install');
      if (!el) return;
      el.classList.add('closing');
      setTimeout(() => el.remove(), 200);
    }
  }

  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-install')?.remove();
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-install')?.remove();
    deferredPrompt = null;
  });

  // 3. iOS-подсказка «на экран Домой» (только если ещё не установлено)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true ||
                     matchMedia('(display-mode: standalone)').matches;

  if (ios && !standalone && !localStorage.getItem('iosInstallHintClosed')) {
    const hint = document.getElementById('iosInstallHint');
    if (hint) hint.style.display = 'block';
  }

  const close = document.getElementById('iosInstallClose');
  if (close) close.onclick = () => {
    try { localStorage.setItem('iosInstallHintClosed', '1'); } catch(e){}
    const hint = document.getElementById('iosInstallHint');
    if (hint) hint.style.display = 'none';
  };
    // ─── 4. Уведомление об обновлении иконки (только iOS PWA) ────
  (function initIconUpdateNotice() {

    // ⚠️ УВЕЛИЧИВАЙ ЭТО ЧИСЛО каждый раз, когда меняешь иконку.
    // 1 → 2 → 3 → ... Сравнивается с тем, что уже сохранено у юзера.
    const ICON_VERSION = 2;

    // Показываем только в iOS и только когда приложение открыто
    // с домашнего экрана (в обычном Safari не нужно — там юзер ещё не установил).
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isStandalone =
      navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (!isIOS || !isStandalone) return;

    // Уже видел эту версию — не мешаем
    const seenVersion = parseInt(
      localStorage.getItem('pwa-icon-version') || '0', 10
    );
    if (seenVersion >= ICON_VERSION) return;

    // Если недавно нажимал «Позже» — уважаем сутки
    const snoozeUntil = parseInt(
      localStorage.getItem('pwa-icon-snooze') || '0', 10
    );
    if (snoozeUntil && Date.now() < snoozeUntil) return;

    // Небольшая задержка, чтобы баннер не мигал при запуске
    setTimeout(showNotice, 1200);

    function showNotice() {
      if (document.getElementById('icon-update-notice')) return;

      injectStyles();

      const notice = document.createElement('div');
      notice.id = 'icon-update-notice';
      notice.setAttribute('role', 'dialog');
      notice.setAttribute('aria-live', 'polite');
      notice.innerHTML = `
        <div class="iun-head">
          <div class="iun-icon">✨</div>
          <div class="iun-title">Обновилась иконка приложения</div>
        </div>
        <p class="iun-body">
          Мы обновили иконку расписания. Чтобы увидеть её на домашнем экране,
          приложение нужно удалить и добавить заново.
        </p>
        <ol class="iun-steps">
          <li>Зажмите иконку расписания → <b>Удалить приложение</b></li>
          <li>Откройте сайт <b>в Safari</b></li>
          <li>Нажмите <b>Поделиться</b> → <b>На экран «Домой»</b></li>
        </ol>
        <div class="iun-actions">
          <button class="iun-primary" type="button">Понятно</button>
          <button class="iun-secondary" type="button">Позже</button>
        </div>
      `;
      document.body.appendChild(notice);

      const dismiss = (snooze) => {
        try {
          if (snooze) {
            // «Позже» — вернёмся через сутки
            localStorage.setItem(
              'pwa-icon-snooze',
              String(Date.now() + 24 * 60 * 60 * 1000)
            );
          } else {
            // «Понятно» — запоминаем версию, больше не покажем
            localStorage.setItem('pwa-icon-version', String(ICON_VERSION));
            localStorage.removeItem('pwa-icon-snooze');
          }
        } catch (e) {}
        notice.classList.add('closing');
        setTimeout(() => notice.remove(), 220);
      };

      notice.querySelector('.iun-primary').onclick = () => dismiss(false);
      notice.querySelector('.iun-secondary').onclick = () => dismiss(true);
    }

    function injectStyles() {
      if (document.getElementById('icon-update-styles')) return;
      const style = document.createElement('style');
      style.id = 'icon-update-styles';
      style.textContent = `
        #icon-update-notice {
          position: fixed;
          left: 12px; right: 12px;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          z-index: 9999;
          background: #1C2333;
          color: #EDEBE2;
          border-radius: 16px;
          padding: 18px 18px 16px;
          box-shadow: 0 12px 40px rgba(0,0,0,.4);
          font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          animation: iunUp .35s cubic-bezier(.2,.9,.3,1);
          max-width: 500px;
          margin: 0 auto;
        }
        @keyframes iunUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        #icon-update-notice.closing {
          animation: iunDown .22s ease-in forwards;
        }
        @keyframes iunDown {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(24px); }
        }
        #icon-update-notice .iun-head {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 10px;
        }
        #icon-update-notice .iun-icon {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, #276258 0%, #1C2333 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
        }
        #icon-update-notice .iun-title {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600; font-size: 16px; line-height: 1.15;
        }
        #icon-update-notice .iun-body {
          color: #C9CDD9; line-height: 1.5; font-size: 13.5px;
          margin: 0 0 14px;
        }
        #icon-update-notice .iun-steps {
          list-style: none; padding: 0; margin: 0 0 16px;
          counter-reset: iunstep;
          display: flex; flex-direction: column; gap: 8px;
        }
        #icon-update-notice .iun-steps li {
          counter-increment: iunstep;
          position: relative;
          padding-left: 30px;
          color: #D8DCE6; font-size: 13px; line-height: 1.4;
        }
        #icon-update-notice .iun-steps li::before {
          content: counter(iunstep);
          position: absolute; left: 0; top: 0;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: rgba(255,255,255,.1);
          color: #EDEBE2;
          font: 600 11px/20px 'IBM Plex Mono', monospace;
          text-align: center;
        }
        #icon-update-notice .iun-steps b { color: #EDEBE2; font-weight: 600; }
        #icon-update-notice .iun-actions {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        #icon-update-notice button {
          flex: 1; min-width: 120px;
          border: 0; border-radius: 10px;
          padding: 11px 14px;
          font: 600 13.5px -apple-system, BlinkMacSystemFont, sans-serif;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        #icon-update-notice .iun-primary {
          background: #EDEBE2; color: #1C2333;
        }
        #icon-update-notice .iun-primary:active { transform: scale(.98); }
        #icon-update-notice .iun-secondary {
          background: transparent;
          color: #8E97AD;
          border: 1px solid rgba(255,255,255,.15);
        }
        #icon-update-notice .iun-secondary:active {
          background: rgba(255,255,255,.06);
        }
      `;
      document.head.appendChild(style);
    }
  })();
})();