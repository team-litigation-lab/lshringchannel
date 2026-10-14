/* =========================================================
   The screens the top bar opens besides the Console

   🗂 Call Logs & Scenario Picker   the screen the Console directs to: the
                                    call log, and the calls to play
   🛡 Admin (trainers)              Call Logs · Trainee Monitoring
                                    (Utilization) · Graded Calls · 🤖 AI
                                    calls · 🎧 Try practice · ⚙️ Setup

   Each is a strip of tabs over one page. The tab's own page renders into
   #appHost inside the screen (App.host()), so every page still works on
   its own — and App.route.sub tells it that a screen is hosting it.
   ========================================================= */
(function () {
  'use strict';
  const { esc } = U;

  // 🗂 Call Logs & Scenario Picker. A trainee's Scenario Picker is 🎧 Practice: the calls an AI caller plays.
  const logTabs = () => [
    { k: 'calls', label: '📞 Call Logs', view: 'calls' },
    { k: 'scenarios', label: '🎭 Scenario Picker', view: App.trainer() ? 'scenarios' : 'practice' }
  ];
  // 🛡 Admin. The first three are the admin screen proper; the rest are the trainer's own tools.
  const adminTabs = () => [
    { k: 'calls', label: '🗂 Call Logs', view: 'calls' },
    { k: 'monitoring', label: '📊 Trainee Monitoring', view: 'monitoring' },
    { k: 'graded', label: '📋 Graded Calls', view: 'graded' },
    { k: 'aicalls', label: '🤖 AI calls', view: 'aicalls' },
    { k: 'practice', label: '🎧 Try practice', view: 'practice' },
    { k: 'setup', label: '⚙️ Setup', view: 'setup' }
  ];

  /* The screen: its name, its tabs, and the open tab's page under them. The tabs are links, so the
     address says which tab is open (#/admin/graded) and the browser's Back button works. */
  function screen(route, head, tabs, key) {
    const tab = tabs.find((t) => t.k === key) || tabs[0];
    U.$('#app').innerHTML = `<div class="screen">
      <div class="screen-head"><h1>${head}</h1></div>
      <div class="screen-tabs" role="tablist">${tabs.map((t) => `<a role="tab" href="#/${route}/${t.k}" class="${t.k === tab.k ? 'on' : ''}" aria-selected="${t.k === tab.k}">${t.label}</a>`).join('')}</div>
      <div id="appHost"><div class="empty">Loading…</div></div></div>`;
    App.route.sub = tab.view;
    return App.views[tab.view].render();
  }

  App.register('logs', {
    render(arg) { return screen('logs', '🗂 Call Logs & Scenario Picker', logTabs(), arg); }
  });

  App.register('admin', {
    trainer: true,
    render(arg) { return screen('admin', '🛡 Admin', adminTabs(), arg); }
  });

  // Re-open the screen that is showing, after something changed what its page shows.
  App.rescreen = () => { if (App.views[App.route.name]) App.views[App.route.name].render(App.route.arg); };
})();
