/* ============================================================
   Pulse — app.js
   Vanilla JS, no build step. Data persisted in localStorage.
   ============================================================ */

(() => {
  'use strict';

  const STORE_KEY = 'pulse_v1';
  const IDENTITY_KEY = 'pulse_identity'; // device-local: which developer this browser is logged in as
  const STATUSES = [
    { id: 'blocked',     label: 'Blocked' },
    { id: 'backlog',     label: 'Ready to start' },
    { id: 'in-progress', label: 'In progress' },
    { id: 'done',        label: 'Done' },
  ];
  const AVATAR_COLORS = ['#FF8A3D', '#34D1BF', '#9B8CFF', '#5B8DEF', '#F2C94C', '#EF7BAE'];
  const EPIC_STATUSES = [
    { id: 'planned',     label: 'Planned',     accent: 'var(--slate)' },
    { id: 'in-progress', label: 'In progress', accent: 'var(--amber)' },
    { id: 'blocked',     label: 'Blocked',     accent: 'var(--red)' },
    { id: 'done',        label: 'Done',        accent: 'var(--teal)' },
  ];
  const DEFAULT_SUBTASK_TEMPLATE = ['Development', 'Unit testing', 'Code merge and build', 'Deploy to perf'];
  // Same underlying status values power the board for every ticket type, but
  // bugs read using the standard defect lifecycle wording.
  const BUG_STATUS_LABEL = { backlog: 'Open', 'in-progress': 'In Progress', blocked: 'Blocked', done: 'Closed' };

  /* ---------------- State ---------------- */
  const DEFAULT_GROUPS = [
    { id: 'grp_coc', name: 'COC' },
    { id: 'grp_cec', name: 'CEC' },
    { id: 'grp_csc', name: 'CSC' },
  ];

  function migrateState(s){
    if (!Array.isArray(s.epics)) s.epics = [];
    if (!Array.isArray(s.groups) || !s.groups.length) s.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
    if (!Array.isArray(s.releases)) s.releases = [];
    if (!s.releases.length){
      const start = mondayOf(addDaysISO(todayISO(), -14));
      s.releases.push({ id: uid('rel'), name: 'Sprint 24.1', startDate: start, endDate: addDaysISO(start, 27), isDefault: true });
    }
    if (!s.settings) s.settings = {};
    if (!Array.isArray(s.settings.subtaskTemplate) || !s.settings.subtaskTemplate.length){
      s.settings.subtaskTemplate = DEFAULT_SUBTASK_TEMPLATE.slice();
    }
    if (!s.settings.standupTime) s.settings.standupTime = '10:30';
    if (!s.settings.eodTime) s.settings.eodTime = '19:00';
    if (!s.settings.notifyTime) s.settings.notifyTime = '19:15';
    if (!s.settings.dailyEstimateHours) s.settings.dailyEstimateHours = 8;
    const defaultReleaseId = (s.releases.find(r => r.isDefault) || s.releases[0]).id;
    s.developers.forEach(d => {
      if (typeof d.isAdmin !== 'boolean') d.isAdmin = false;
      if (typeof d.isTeamLead !== 'boolean') d.isTeamLead = false;
      if (d.groupId === undefined) d.groupId = null;
    });
    if (!s.developers.some(d => d.isAdmin) && s.developers[0]) s.developers[0].isAdmin = true;
    s.tickets.forEach(t => {
      if (!Array.isArray(t.subtasks)){
        t.subtasks = s.settings.subtaskTemplate.map(name => ({ id: uid('s'), name, done: t.status === 'done' }));
      }
      if (!Array.isArray(t.scenarios)) t.scenarios = [];
      if (t.status === 'review') t.status = 'in-progress'; // "In review" column was retired
      if (t.type === 'change-request') t.type = 'task'; // Change Request type was retired
      if (!Array.isArray(t.dependsOn)) t.dependsOn = [];
      if (!t.releaseId) t.releaseId = defaultReleaseId;
      if (t.plannedWeekStart === undefined) t.plannedWeekStart = null;
    });
    s.epics.forEach(e => { if (!e.releaseId) e.releaseId = defaultReleaseId; });
    if (!s.weeklyPlan) s.weeklyPlan = {};
    if (!s.weeklyPlan.overrides) s.weeklyPlan.overrides = {}; // { [groupId]: { [weekStartISO]: hours } }
    if (!s.weeklyPlan.reasons) s.weeklyPlan.reasons = {};     // { [devId]: { [weekStartISO]: "reason text" } }
    return s;
  }

  let state = migrateState(loadState());
  let ui = {
    view: 'dashboard',
    search: '',
    boardAssigneeFilter: '',
    tableFilters: { type: '', status: '', assignee: '' },
    reportPeriod: 'weekly',
    adminTab: 'dashboard',
    adminResourceFilter: '',
    releaseId: '', // '' = all releases
  };

  const LEGACY_STORE_KEY = 'trackline_v1'; // pre-rename key, migrated below if found

  function loadState(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
      const legacy = localStorage.getItem(LEGACY_STORE_KEY);
      if (legacy){
        localStorage.setItem(STORE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORE_KEY);
        return JSON.parse(legacy);
      }
    }catch(e){ /* fall through to seed */ }
    return seedState();
  }

  function saveState(){
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    if (window.PulseSync && window.PulseSync.enabled) window.PulseSync.push(state);
  }

  function uid(prefix){
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  }

  function todayISO(offsetDays = 0){
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function seedState(){
    const devs = [
      { id: 'dev_mohan',     name: 'Mohan',     role: 'Backend Developer',  color: AVATAR_COLORS[0], email: 'mohan@example.com', groupId: 'grp_coc' },
      { id: 'dev_hammed',    name: 'Hammed',    role: 'Full-stack Developer', color: AVATAR_COLORS[1], email: 'hammed@example.com', groupId: 'grp_coc', isTeamLead: true },
      { id: 'dev_arul',      name: 'Arul',      role: 'Frontend Developer', color: AVATAR_COLORS[2], email: 'arul@example.com', groupId: 'grp_cec' },
      { id: 'dev_rajeshari', name: 'Rajeshari', role: 'QA Engineer',        color: AVATAR_COLORS[3], email: 'rajeshari@example.com', groupId: 'grp_csc' },
      { id: 'dev_naveen',    name: 'Naveen',    role: 'Tech Lead',          color: AVATAR_COLORS[4], isAdmin: true, email: 'naveen@example.com', groupId: 'grp_coc' },
    ];

    const epics = [
      {
        id: uid('e'), epicNumber: 'EPIC-1', title: 'Pre-approved hours workflow',
        status: 'in-progress', owner: 'dev_naveen', timeEstimate: 24,
        description: 'AM/PM dev-plan check-ins with pre-approved hours and justification for overages.',
        createdAt: todayISO(-5),
      },
      {
        id: uid('e'), epicNumber: 'EPIC-2', title: 'Ticket list & delivery reporting',
        status: 'planned', owner: 'dev_naveen', timeEstimate: 16,
        description: 'Ticket List sheet sync and delivery status rollups.',
        createdAt: todayISO(-5),
      },
    ];

    const mkSubtasks = (doneCount) => DEFAULT_SUBTASK_TEMPLATE.map((name, i) => ({ id: uid('s'), name, done: i < doneCount }));
    const mkScenario = (type, title, description) => ({ id: uid('sc'), type, title, description });

    const tickets = [
      {
        id: uid('t'), ticketNumber: 'CCS-123', title: 'Build resource feedback capture form',
        type: 'story', status: 'in-progress', assignee: 'dev_mohan', priority: 'high',
        estimate: 8, storyPoints: 5, epicId: epics[0].id, dependsOn: [], blockerNote: '',
        description: 'Capture per-developer feedback at EOD for the next-day dev plan.',
        subtasks: mkSubtasks(1),
        scenarios: [
          mkScenario('flow', 'Dev submits EOD feedback', 'Dev opens form at EOD → selects blockers/mood → submits → entry appears on next-day dev plan.'),
          mkScenario('test', 'Empty submission is blocked', 'Given the form is open, when no fields are filled, then submit is disabled and a validation hint shows.'),
        ],
        createdAt: todayISO(-3),
      },
      {
        id: uid('t'), ticketNumber: 'CCS-456', title: 'Fix ticket-hours mismatch in export',
        type: 'bug', status: 'blocked', assignee: 'dev_hammed', priority: 'critical',
        estimate: 3, storyPoints: 2, epicId: epics[0].id, dependsOn: [], blockerNote: 'Needs justification sign-off before pre-approved hours can be logged',
        description: 'Exported hours do not match sheet totals for justified overtime rows.',
        subtasks: mkSubtasks(1),
        scenarios: [
          mkScenario('usecase', 'Reviewer sign-off on justified hours', 'A dev logs hours over the pre-approved cap with a justification note; a reviewer approves before export includes it.'),
        ],
        createdAt: todayISO(-2),
      },
      {
        id: uid('t'), ticketNumber: 'CCS-457', title: 'Wire dev-plan EOD reminder',
        type: 'task', status: 'backlog', assignee: 'dev_arul', priority: 'medium',
        estimate: 4, storyPoints: 3, epicId: epics[0].id, dependsOn: [], blockerNote: '',
        description: 'Send an EOD prompt for next-day plan submission.',
        subtasks: mkSubtasks(0), createdAt: todayISO(-1),
      },
      {
        id: uid('t'), ticketNumber: 'CCS-458', title: 'QA pass: pre-approved hours workflow',
        type: 'task', status: 'in-progress', assignee: 'dev_rajeshari', priority: 'medium',
        estimate: 4, storyPoints: 2, epicId: epics[0].id, dependsOn: [], blockerNote: '',
        description: 'Verify pre-approved hours process end to end.',
        subtasks: mkSubtasks(3), createdAt: todayISO(-1),
      },
      {
        id: uid('t'), ticketNumber: 'CCS-459', title: 'Ship ticket-list sheet sync',
        type: 'story', status: 'done', assignee: 'dev_naveen', priority: 'high',
        estimate: 6, storyPoints: 5, epicId: epics[1].id, dependsOn: [], blockerNote: '',
        description: 'Sync ticket list sheet fields: Ticket Number, Dev Name, Blocker, Hours.',
        subtasks: mkSubtasks(4), createdAt: todayISO(-5),
      },
    ];
    // wire dependencies: CCS-456 depends on CCS-123; CCS-457 depends on CCS-456
    tickets[1].dependsOn = [tickets[0].id];
    tickets[2].dependsOn = [tickets[1].id];

    // plan a couple of weeks of demo data for the Admin Delivery Plan view
    const thisMonday = mondayOf(todayISO());
    const lastMonday = mondayOf(todayISO(-7));
    tickets[0].plannedWeekStart = lastMonday;
    tickets[1].plannedWeekStart = lastMonday;
    tickets[2].plannedWeekStart = thisMonday;
    tickets[3].plannedWeekStart = thisMonday;
    tickets[4].plannedWeekStart = lastMonday;

    const logs = [
      { id: uid('l'), devId: 'dev_mohan',     date: todayISO(0),  session: 'AM', hours: 2,   ticketId: tickets[0].id, note: '' },
      { id: uid('l'), devId: 'dev_mohan',     date: todayISO(0),  session: 'PM', hours: 1.5, ticketId: tickets[0].id, note: '' },
      { id: uid('l'), devId: 'dev_hammed',    date: todayISO(0),  session: 'AM', hours: 3,   ticketId: tickets[1].id, note: 'Justification' },
      { id: uid('l'), devId: 'dev_arul',      date: todayISO(0),  session: 'AM', hours: 1,   ticketId: null, note: 'Morning standup + planning' },
      { id: uid('l'), devId: 'dev_arul',      date: todayISO(-1), session: 'AM', hours: 4,   ticketId: tickets[2].id, note: '' },
      { id: uid('l'), devId: 'dev_rajeshari', date: todayISO(-1), session: 'PM', hours: 4,   ticketId: tickets[3].id, note: '' },
      { id: uid('l'), devId: 'dev_naveen',    date: todayISO(-2), session: 'AM', hours: 2,   ticketId: tickets[4].id, note: 'Ticket list review' },
    ];

    return { developers: devs, tickets, timeLogs: logs, epics, settings: { subtaskTemplate: DEFAULT_SUBTASK_TEMPLATE.slice() } };
  }

  /* ---------------- Derived helpers ---------------- */
  function devById(id){ return state.developers.find(d => d.id === id); }
  function currentUser(){ return devById(localStorage.getItem(IDENTITY_KEY)); }
  function isCurrentUserAdmin(){ const u = currentUser(); return !!(u && u.isAdmin); }
  function isCurrentUserTeamLead(){ const u = currentUser(); return !!(u && u.isTeamLead && u.groupId); }

  /** Which developer IDs the current user is allowed to see across Board/Tickets/Epics/Dashboard/Timesheet/Team.
   *  Admins: everyone. Team Leads: everyone in their group. Everyone else: just themselves. */
  function visibleDevIds(){
    const me = currentUser();
    if (!me) return [];
    if (me.isAdmin) return state.developers.map(d => d.id);
    if (me.isTeamLead && me.groupId) return state.developers.filter(d => d.groupId === me.groupId).map(d => d.id);
    return [me.id];
  }

  function groupById(id){ return state.groups.find(g => g.id === id); }
  function releaseById(id){ return state.releases.find(r => r.id === id); }
  function currentRelease(){ return releaseById(ui.releaseId) || state.releases.find(r => r.isDefault) || state.releases[0]; }

  /** Tickets in the selected release (or all releases) AND within the viewer's visibility scope. */
  function scopedTickets(){
    const devIds = visibleDevIds();
    return state.tickets.filter(t => (!ui.releaseId || t.releaseId === ui.releaseId) && devIds.includes(t.assignee));
  }
  function scopedEpics(){
    return state.epics.filter(e => !ui.releaseId || e.releaseId === ui.releaseId);
  }
  function ticketById(id){ return state.tickets.find(t => t.id === id); }
  function epicById(id){ return state.epics.find(e => e.id === id); }

  function storiesForEpic(epicId){
    const devIds = visibleDevIds();
    return state.tickets.filter(t => t.epicId === epicId && devIds.includes(t.assignee));
  }

  function epicProgress(epic){
    const stories = storiesForEpic(epic.id);
    const points = stories.reduce((s,t) => s + Number(t.storyPoints||0), 0);
    const pointsDone = stories.filter(t => t.status === 'done').reduce((s,t) => s + Number(t.storyPoints||0), 0);
    const logged = stories.reduce((s,t) => s + actualHours(t.id), 0);
    const estimate = epic.timeEstimate || stories.reduce((s,t) => s + Number(t.estimate||0), 0);
    const pct = points ? Math.round(pointsDone / points * 100) : (estimate ? Math.min(100, Math.round(logged/estimate*100)) : 0);
    const scenarioCount = stories.reduce((s,t) => s + (t.scenarios||[]).length, 0);
    const stepsWithScenarios = stories.filter(t => (t.scenarios||[]).length > 0).length;
    return { stories, points, pointsDone, logged, estimate, pct, scenarioCount, stepsWithScenarios };
  }

  function actualHours(ticketId){
    return state.timeLogs.filter(l => l.ticketId === ticketId).reduce((s, l) => s + Number(l.hours || 0), 0);
  }

  function unmetDeps(ticket){
    return (ticket.dependsOn || []).map(ticketById).filter(Boolean).filter(dep => dep.status !== 'done');
  }

  function subtasksProgress(ticket){
    const list = ticket.subtasks || [];
    const done = list.filter(s => s.done).length;
    return { done, total: list.length };
  }

  function effectiveStatus(ticket){
    // Auto-surface blocked state when dependencies aren't done, unless already delivered.
    if (ticket.status === 'done') return ticket.status;
    if (unmetDeps(ticket).length > 0) return 'blocked';
    return ticket.status;
  }

  function initials(name){
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function avatarHTML(devId, size){
    const dev = devById(devId);
    if (!dev) return `<span class="avatar${size==='lg'?' avatar--lg':''}" style="background:#2A3140;color:#8B93A3">?</span>`;
    return `<span class="avatar${size==='lg'?' avatar--lg':''}" style="background:${dev.color}">${initials(dev.name)}</span>`;
  }

  function escapeHTML(str){
    return String(str ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }

  function fmtDate(iso){
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function daysAgo(iso){
    return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
  }

  function withinLastNDays(iso, n){
    return daysAgo(iso) < n && daysAgo(iso) >= 0;
  }

  function mondayOf(iso){
    const d = new Date(iso + 'T00:00:00');
    const day = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  }
  function addDaysISO(iso, n){
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function shortDate(iso){
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate()}/${d.toLocaleString(undefined, { month: 'short' })}`;
  }
  /** "3/Aug - 7/Aug" style label for the Mon-Fri work week containing this Monday date. */
  function weekRangeLabel(mondayISO){
    return `${shortDate(mondayISO)} - ${shortDate(addDaysISO(mondayISO, 4))}`;
  }
  /** All Monday dates spanning [startISO, endISO], inclusive. */
  function weeksInRange(startISO, endISO){
    if (!startISO || !endISO) return [];
    const weeks = [];
    let cur = mondayOf(startISO);
    const last = mondayOf(endISO);
    let guard = 0;
    while (cur <= last && guard < 104){ // cap at 2 years of weeks as a safety guard
      weeks.push(cur);
      cur = addDaysISO(cur, 7);
      guard++;
    }
    return weeks;
  }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ---------------- Navigation ---------------- */
  const viewTitles = {
    dashboard: ['Dashboard', 'Standup at 09:00 · EOD plan due 18:00'],
    epics: ['Epics', 'Group stories, points and estimates by initiative'],
    board: ['Board', 'Drag cards across statuses'],
    tickets: ['Tickets', 'All stories, tasks and bugs'],
    dependencies: ['Dependencies', 'What is blocking what'],
    timesheet: ['Timesheet', 'Your logged hours'],
    team: ['Team', 'Workload and delivery by developer'],
    admin: ['Admin', 'Team-wide activity, filterable by resource'],
  };

  const SEARCH_VISIBLE_VIEWS = ['board', 'tickets', 'dependencies'];
  const RELEASE_VISIBLE_VIEWS = ['epics', 'board', 'tickets', 'dependencies', 'timesheet', 'team'];

  function refreshReleaseSelect(view){
    const sel = document.getElementById('releaseSelect');
    sel.hidden = !RELEASE_VISIBLE_VIEWS.includes(view);
    if (sel.hidden) return;
    sel.innerHTML = `<option value="">All releases</option>` +
      state.releases.map(r => `<option value="${r.id}" ${ui.releaseId===r.id?'selected':''}>${escapeHTML(r.name)}</option>`).join('');
  }

  function refreshIdentityUI(){
    const u = currentUser();
    document.getElementById('identityName').textContent = u ? u.name : 'Choose who you are';
    const avatarEl = document.getElementById('identityAvatar');
    if (u && u.photoURL){
      avatarEl.textContent = '';
      avatarEl.style.background = `#2A3140 url(${u.photoURL}) center/cover no-repeat`;
    } else if (u){
      avatarEl.textContent = initials(u.name);
      avatarEl.style.background = u.color;
    } else {
      avatarEl.textContent = '?';
      avatarEl.style.background = '#2A3140';
    }
    document.querySelector('.identity-widget__switch').textContent = usingGoogleAuth ? 'Sign out' : 'Switch';
    document.getElementById('adminNavLink').hidden = !(isCurrentUserAdmin() || isCurrentUserTeamLead());
  }

  function setView(view){
    ui.view = view;
    document.querySelectorAll('.rail__link[data-view]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    const [title, sub] = viewTitles[view];
    document.getElementById('viewTitle').textContent = title;
    document.getElementById('viewSubtitle').textContent =
      view === 'dashboard' ? `Standup at ${state.settings.standupTime} · EOD plan due ${state.settings.eodTime}` : sub;
    document.getElementById('searchWrap').hidden = !SEARCH_VISIBLE_VIEWS.includes(view);
    refreshReleaseSelect(view);
    refreshIdentityUI();
    render();
  }

  document.getElementById('releaseSelect').addEventListener('change', (e) => {
    ui.releaseId = e.target.value;
    render();
  });

  /* ---------------- Render router ---------------- */
  function render(){
    const root = document.getElementById('view');
    if (ui.view === 'dashboard') root.innerHTML = renderDashboard(currentUser() ? visibleDevIds() : null);
    else if (ui.view === 'epics') root.innerHTML = renderEpics();
    else if (ui.view === 'board') root.innerHTML = renderBoard();
    else if (ui.view === 'tickets') root.innerHTML = renderTickets();
    else if (ui.view === 'dependencies') root.innerHTML = renderDependencies();
    else if (ui.view === 'timesheet') root.innerHTML = renderTimesheet();
    else if (ui.view === 'team') root.innerHTML = renderTeam();
    else if (ui.view === 'admin') root.innerHTML = renderAdmin();
    bindViewEvents();
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard(filterAssignee){
    let ids = null;
    if (Array.isArray(filterAssignee)) ids = filterAssignee;
    else if (filterAssignee) ids = [filterAssignee];

    const tickets = (ids ? state.tickets.filter(t => ids.includes(t.assignee)) : state.tickets)
      .filter(t => !ui.releaseId || t.releaseId === ui.releaseId);
    const inProgress = tickets.filter(t => effectiveStatus(t) === 'in-progress').length;
    const blocked = tickets.filter(t => effectiveStatus(t) === 'blocked').length;
    const doneThisWeek = tickets.filter(t => t.status === 'done').length;
    const totalEstimate = tickets.reduce((s,t) => s + Number(t.estimate||0), 0);
    const logsInScope = ids ? state.timeLogs.filter(l => ids.includes(l.devId)) : state.timeLogs;
    const totalLogged = logsInScope.reduce((s,l) => s + Number(l.hours||0), 0);
    const totalPoints = tickets.reduce((s,t) => s + Number(t.storyPoints||0), 0);
    const pointsDone = tickets.filter(t => t.status === 'done').reduce((s,t) => s + Number(t.storyPoints||0), 0);

    const devsInScope = ids ? state.developers.filter(d => ids.includes(d.id)) : state.developers;
    const hoursByDev = devsInScope.map(d => {
      const logs = state.timeLogs.filter(l => l.devId === d.id && withinLastNDays(l.date, 7));
      const am = logs.filter(l => l.session === 'AM').reduce((s,l)=>s+Number(l.hours||0),0);
      const pm = logs.filter(l => l.session === 'PM').reduce((s,l)=>s+Number(l.hours||0),0);
      return { dev: d, am, pm, total: am+pm };
    });
    const maxHours = Math.max(1, ...hoursByDev.map(h => h.total));

    const recent = [...tickets].sort((a,b) => (b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt)).slice(0,6);
    const blockedList = tickets.filter(t => effectiveStatus(t) === 'blocked').slice(0,5);

    return `
      <div class="stat-grid">
        <div class="stat-card" style="--accent:var(--amber)">
          <div class="stat-card__label">In progress</div>
          <div class="stat-card__value">${inProgress}</div>
          <div class="stat-card__foot">of ${tickets.length} total tickets</div>
        </div>
        <div class="stat-card" style="--accent:var(--red)">
          <div class="stat-card__label">Blocked</div>
          <div class="stat-card__value">${blocked}</div>
          <div class="stat-card__foot">needs unblocking or justification</div>
        </div>
        <div class="stat-card" style="--accent:var(--teal)">
          <div class="stat-card__label">Delivered</div>
          <div class="stat-card__value">${doneThisWeek}</div>
          <div class="stat-card__foot">marked done</div>
        </div>
        <div class="stat-card" style="--accent:var(--violet)">
          <div class="stat-card__label">Hours logged / estimated</div>
          <div class="stat-card__value">${totalLogged}<span style="font-size:16px;color:var(--text-faint)"> / ${totalEstimate}</span></div>
          <div class="stat-card__foot">across all tickets</div>
        </div>
        <div class="stat-card" style="--accent:var(--blue)">
          <div class="stat-card__label">Story points delivered</div>
          <div class="stat-card__value">${pointsDone}<span style="font-size:16px;color:var(--text-faint)"> / ${totalPoints}</span></div>
          <div class="stat-card__foot">Fibonacci effort estimate</div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="panel">
          <div class="panel__head">
            <h3>Hours this week${filterAssignee ? '' : ' by developer'}</h3>
            <span class="hint">AM + PM sessions</span>
          </div>
          ${hoursByDev.map(h => `
            <div class="hourbar-row">
              <div class="hourbar-name">${escapeHTML(h.dev.name)}</div>
              <div class="hourbar-track">
                <div class="hourbar-fill--am" style="width:${(h.am/maxHours*100).toFixed(1)}%"></div>
                <div class="hourbar-fill--pm" style="width:${(h.pm/maxHours*100).toFixed(1)}%"></div>
              </div>
              <div class="hourbar-total">${h.total}h</div>
            </div>
          `).join('')}
          <div class="legend">
            <span><i style="background:var(--amber)"></i>Morning</span>
            <span><i style="background:var(--violet)"></i>Evening</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel__head">
            <h3>Blocked right now</h3>
            <span class="hint">${blockedList.length}</span>
          </div>
          ${blockedList.length ? blockedList.map(t => `
            <div class="feed-item">
              <div class="feed-item__id">${escapeHTML(t.ticketNumber)}</div>
              <div class="feed-item__body">
                <div class="feed-item__title">${escapeHTML(t.title)}</div>
                <div class="feed-item__meta">${escapeHTML(t.blockerNote || 'Waiting on dependency')} · ${devById(t.assignee) ? escapeHTML(devById(t.assignee).name) : 'Unassigned'}</div>
              </div>
            </div>
          `).join('') : `<div class="empty"><p>Nothing blocked. Clean run.</p></div>`}
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel__head">
          <h3>Recent activity</h3>
          <span class="hint">Latest 6</span>
        </div>
        ${recent.map(t => `
          <div class="feed-item">
            <div class="feed-item__id">${escapeHTML(t.ticketNumber)}</div>
            <div class="feed-item__body">
              <div class="feed-item__title">${escapeHTML(t.title)}</div>
              <div class="feed-item__meta">
                <span class="badge badge--status-${effectiveStatus(t)}"><span class="dot dot--${effectiveStatus(t)}"></span>${labelForStatus(effectiveStatus(t), t.type)}</span>
                &nbsp;·&nbsp; ${devById(t.assignee) ? escapeHTML(devById(t.assignee).name) : 'Unassigned'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function labelForStatus(id, type){
    if (type === 'bug' && BUG_STATUS_LABEL[id]) return BUG_STATUS_LABEL[id];
    return (STATUSES.find(s => s.id===id) || {}).label || id;
  }
  const TYPE_LABEL = { story: 'Story', task: 'Task', bug: 'Bug', enhancement: 'Enhancement' };
  function labelForType(id){ return TYPE_LABEL[id] || id; }

  /* ---------------- Epics ---------------- */
  function epicStatusLabel(id){ return (EPIC_STATUSES.find(s => s.id===id) || {}).label || id; }
  function epicStatusAccent(id){ return (EPIC_STATUSES.find(s => s.id===id) || {}).accent || 'var(--slate)'; }

  function renderEpics(){
    const q = ui.search.trim().toLowerCase();
    let epics = scopedEpics();
    if (q) epics = epics.filter(e => e.epicNumber.toLowerCase().includes(q) || e.title.toLowerCase().includes(q));

    return `
      <div class="table-toolbar">
        <button class="btn btn--primary btn--sm" id="newEpicBtn">
          <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          New epic
        </button>
      </div>
      ${epics.length ? `<div class="epic-grid">
        ${epics.map(e => {
          const p = epicProgress(e);
          const owner = devById(e.owner);
          return `
          <div class="epic-card" data-id="${e.id}" style="--epic-accent:${epicStatusAccent(e.status)}">
            <div class="epic-card__top">
              <span class="epic-card__id">${escapeHTML(e.epicNumber)}</span>
              <span class="badge badge--status-${e.status}"><span class="dot dot--${e.status==='in-progress'?'in-progress':e.status==='blocked'?'blocked':e.status==='done'?'done':'backlog'}"></span>${epicStatusLabel(e.status)}</span>
            </div>
            <div class="epic-card__title">${escapeHTML(e.title)}</div>
            <div class="epic-card__meta-row">
              <span class="epic-card__owner">${owner ? avatarHTML(owner.id) : ''} ${owner ? escapeHTML(owner.name) : 'Unowned'}</span>
              <span class="epic-card__points">${p.pointsDone}/${p.points} pts</span>
            </div>
            <div class="epic-card__progress-label"><span>${p.logged}h logged / ${p.estimate}h estimate</span><span>${p.pct}%</span></div>
            <div class="epic-card__bar"><div class="epic-card__bar-fill" style="width:${p.pct}%;background:${epicStatusAccent(e.status)}"></div></div>
            <div class="epic-card__stories">
              ${p.stories.length ? p.stories.slice(0,5).map(t => {
                const scCount = (t.scenarios||[]).length;
                return `
                <div class="epic-story-row">
                  <span class="dot dot--${effectiveStatus(t)}"></span>
                  <span class="epic-story-row__id">${escapeHTML(t.ticketNumber)}</span>
                  <span class="epic-story-row__title">${escapeHTML(t.title)}</span>
                  ${scCount ? `<span class="epic-story-row__pts" title="${scCount} flow/use case/test scenario(s)">📋 ${scCount}</span>` : ''}
                  <span class="epic-story-row__pts">${t.storyPoints||0} pt</span>
                </div>`;
              }).join('') : `<div class="epic-card__empty">No stories linked yet.</div>`}
              ${p.stories.length > 5 ? `<div class="epic-card__empty">+ ${p.stories.length - 5} more</div>` : ''}
              ${p.scenarioCount ? `<div class="epic-card__empty" style="color:var(--text-dim);padding-top:6px;border-top:1px solid var(--border-soft);margin-top:2px">
                ${p.scenarioCount} scenario${p.scenarioCount===1?'':'s'} documented across ${p.stepsWithScenarios}/${p.stories.length} steps
              </div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>` : `<div class="empty"><p>No epics yet. Create one to group related stories, tasks and bugs.</p></div>`}
    `;
  }

  /* ---------------- Board ---------------- */
  function renderBoard(){
    const q = ui.search.trim().toLowerCase();
    let tickets = scopedTickets();
    if (q) tickets = tickets.filter(t => t.ticketNumber.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
    if (ui.boardAssigneeFilter) tickets = tickets.filter(t => t.assignee === ui.boardAssigneeFilter);

    const visibleDevs = state.developers.filter(d => visibleDevIds().includes(d.id));
    const assigneeOptions = `<option value="">All developers</option>` +
      visibleDevs.map(d => `<option value="${d.id}" ${ui.boardAssigneeFilter===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('');

    return `
      <div class="table-toolbar">
        <select class="select-chip" id="boardAssigneeFilter">${assigneeOptions}</select>
      </div>
      <div class="board">
        ${STATUSES.map(col => {
          const colTickets = tickets.filter(t => effectiveStatus(t) === col.id);
          return `
            <div class="board-col">
              <div class="board-col__head">
                <span class="dot dot--${col.id}"></span>
                <h4>${col.label}</h4>
                <span class="board-col__count">${colTickets.length}</span>
              </div>
              <div class="board-col__body" data-status="${col.id}">
                ${colTickets.map(t => ticketCardHTML(t)).join('') || ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function ticketCardHTML(t){
    const dep = devById(t.assignee);
    const logged = actualHours(t.id);
    const deps = unmetDeps(t);
    const epic = t.epicId ? epicById(t.epicId) : null;
    return `
      <div class="ticket-card" draggable="true" data-id="${t.id}">
        <div class="ticket-card__top">
          <span class="ticket-card__id mono">${escapeHTML(t.ticketNumber)}</span>
          <span class="badge badge--type-${t.type}">${labelForType(t.type)}</span>
        </div>
        <div class="ticket-card__title">${escapeHTML(t.title)}</div>
        ${epic || t.storyPoints ? `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          ${epic ? `<span class="epic-tag">${escapeHTML(epic.epicNumber)}</span>` : ''}
          ${t.storyPoints ? `<span class="badge badge--points">${t.storyPoints} pt</span>` : ''}
        </div>` : ''}
        <div class="ticket-card__foot">
          <span class="ticket-card__assignee">${avatarHTML(t.assignee)} ${dep ? escapeHTML(dep.name) : 'Unassigned'}</span>
          <span class="ticket-card__hours">${logged}h / ${t.estimate || 0}h</span>
        </div>
        ${(() => { const sp = subtasksProgress(t); const scCount = (t.scenarios||[]).length; return (sp.total || scCount) ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${sp.total ? `<span class="checklist-pill${sp.done===sp.total?' checklist-pill--complete':''}">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${sp.done}/${sp.total} steps
          </span>` : ''}
          ${scCount ? `<span class="scenario-pill">
            <svg viewBox="0 0 16 16" fill="none"><path d="M4 3h8v10l-4-2-4 2V3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            ${scCount} scenario${scCount===1?'':'s'}
          </span>` : ''}
        </div>` : ''; })()}
        ${deps.length ? `<div class="ticket-card__blocker">
          <svg viewBox="0 0 16 16" fill="none"><path d="M8 5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.6" r="0.7" fill="currentColor"/><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.3"/></svg>
          Waiting on ${deps.map(d => escapeHTML(d.ticketNumber)).join(', ')}
        </div>` : (t.blockerNote ? `<div class="ticket-card__blocker">
          <svg viewBox="0 0 16 16" fill="none"><path d="M8 5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.6" r="0.7" fill="currentColor"/><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.3"/></svg>
          ${escapeHTML(t.blockerNote)}
        </div>` : '')}
      </div>
    `;
  }

  /* ---------------- Tickets table ---------------- */
  function renderTickets(forAdmin){
    const q = ui.search.trim().toLowerCase();
    let tickets = forAdmin
      ? state.tickets.filter(t => (!ui.releaseId || t.releaseId === ui.releaseId) && (isCurrentUserAdmin() || visibleDevIds().includes(t.assignee)))
      : scopedTickets();
    if (q) tickets = tickets.filter(t => t.ticketNumber.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
    const { type, status, assignee } = ui.tableFilters;
    if (forAdmin){
      if (ui.adminResourceFilter) tickets = tickets.filter(t => t.assignee === ui.adminResourceFilter);
    } else {
      if (type) tickets = tickets.filter(t => t.type === type);
      if (status) tickets = tickets.filter(t => effectiveStatus(t) === status);
      if (assignee) tickets = tickets.filter(t => t.assignee === assignee);
    }

    tickets = [...tickets].sort((a,b) => a.ticketNumber.localeCompare(b.ticketNumber, undefined, { numeric: true }));

    const visibleDevs = state.developers.filter(d => visibleDevIds().includes(d.id));

    return `
      ${forAdmin ? '' : `<div class="table-toolbar">
        <select class="select-chip" id="filterType">
          <option value="">All types</option>
          <option value="story" ${type==='story'?'selected':''}>Story</option>
          <option value="task" ${type==='task'?'selected':''}>Task</option>
          <option value="bug" ${type==='bug'?'selected':''}>Bug</option>
          <option value="enhancement" ${type==='enhancement'?'selected':''}>Enhancement</option>
        </select>
        <select class="select-chip" id="filterStatus">
          <option value="">All statuses</option>
          ${STATUSES.map(s => `<option value="${s.id}" ${status===s.id?'selected':''}>${s.label}</option>`).join('')}
        </select>
        <select class="select-chip" id="filterAssignee">
          <option value="">All developers</option>
          ${visibleDevs.map(d => `<option value="${d.id}" ${assignee===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}
        </select>
      </div>`}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ticket</th><th>Title</th><th>Type</th><th>Epic</th><th>Pts</th><th>Assignee</th><th>Priority</th>
              <th>Est / Logged</th><th>Checklist</th><th>Depends on</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map(t => {
              const dep = devById(t.assignee);
              const logged = actualHours(t.id);
              const pct = t.estimate ? Math.min(100, Math.round(logged / t.estimate * 100)) : 0;
              const deps = (t.dependsOn||[]).map(ticketById).filter(Boolean);
              const epic = t.epicId ? epicById(t.epicId) : null;
              return `
              <tr data-id="${t.id}">
                <td class="mono">${escapeHTML(t.ticketNumber)}</td>
                <td class="cell-title">${escapeHTML(t.title)}</td>
                <td><span class="badge badge--type-${t.type}">${labelForType(t.type)}</span></td>
                <td>${epic ? `<span class="epic-tag">${escapeHTML(epic.epicNumber)}</span>` : '<span class="dep-chip">—</span>'}</td>
                <td class="mono" style="color:var(--text-dim)">${t.storyPoints || '—'}</td>
                <td>${avatarHTML(t.assignee)} ${dep ? escapeHTML(dep.name) : 'Unassigned'}</td>
                <td><span class="badge badge--prio-${t.priority}">${t.priority}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="progress-mini"><div class="progress-mini__fill" style="width:${pct}%"></div></div>
                    <span class="mono" style="font-size:11px;color:var(--text-dim)">${logged}/${t.estimate||0}h</span>
                  </div>
                </td>
                <td>${(() => { const sp = subtasksProgress(t); return sp.total ? `<span class="checklist-pill${sp.done===sp.total?' checklist-pill--complete':''}"><svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${sp.done}/${sp.total}</span>` : '<span class="dep-chip">—</span>'; })()}</td>
                <td><div class="dep-chips">${deps.length ? deps.map(d => `<span class="dep-chip">${escapeHTML(d.ticketNumber)}</span>`).join('') : '<span class="dep-chip">—</span>'}</div></td>
                <td onclick="event.stopPropagation()">
                  <select class="status-inline-select" data-status-select="${t.id}">
                    ${STATUSES.map(s => `<option value="${s.id}" ${effectiveStatus(t)===s.id?'selected':''}>${labelForStatus(s.id, t.type)}</option>`).join('')}
                  </select>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="11"><div class="empty"><p>No tickets match these filters.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ---------------- Dependencies ---------------- */
  function computeLayers(tickets){
    const layerOf = {};
    function layer(t, seen){
      if (layerOf[t.id] !== undefined) return layerOf[t.id];
      if (seen.has(t.id)) return 0; // cycle guard
      seen.add(t.id);
      const deps = (t.dependsOn||[]).map(ticketById).filter(Boolean);
      const l = deps.length ? 1 + Math.max(...deps.map(d => layer(d, seen))) : 0;
      layerOf[t.id] = l;
      return l;
    }
    tickets.forEach(t => layer(t, new Set()));
    const maxLayer = Math.max(0, ...Object.values(layerOf));
    const layers = Array.from({ length: maxLayer + 1 }, () => []);
    tickets.forEach(t => layers[layerOf[t.id]].push(t));
    return layers;
  }

  function renderDependencies(){
    const tickets = scopedTickets();
    const layers = computeLayers(tickets);
    const edgesCount = tickets.reduce((s,t) => s + (t.dependsOn||[]).length, 0);

    const graph = `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel__head">
          <h3>Dependency map</h3>
          <span class="hint">${edgesCount} link${edgesCount===1?'':'s'} · drag a ticket onto another to mark it as depending on it</span>
        </div>
        <div class="dep-layers">
          ${layers.map((layerTickets, i) => `
            <div class="dep-layer">
              <div class="dep-layer__label">${i === 0 ? 'Ready to start' : 'Depth ' + i}</div>
              ${layerTickets.map(t => {
                const deps = unmetDeps(t);
                return `
                <div class="dep-node ${t.status==='done'?'dep-node--done':''}" data-id="${t.id}" draggable="true">
                  <div class="dep-node__id mono">${escapeHTML(t.ticketNumber)}</div>
                  <div class="dep-node__title">${escapeHTML(t.title)}</div>
                  ${deps.length ? `<div class="dep-node__edges">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    blocked by ${deps.map(d=>escapeHTML(d.ticketNumber)).join(', ')}
                  </div>` : `<span class="badge badge--status-${effectiveStatus(t)}"><span class="dot dot--${effectiveStatus(t)}"></span>${labelForStatus(effectiveStatus(t), t.type)}</span>`}
                </div>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const rows = tickets.filter(t => (t.dependsOn||[]).length).flatMap(t =>
      (t.dependsOn||[]).map(ticketById).filter(Boolean).map(dep => ({ t, dep }))
    );

    const list = `
      <div class="panel">
        <div class="panel__head"><h3>All links</h3></div>
        ${rows.length ? rows.map(({t,dep}) => `
          <div class="dep-list-row">
            <span class="mono">${escapeHTML(t.ticketNumber)}</span>
            <span>${escapeHTML(t.title)}</span>
            <span class="dep-arrow">← waits on</span>
            <span class="mono">${escapeHTML(dep.ticketNumber)} <span style="color:var(--text-faint)">${escapeHTML(dep.title)}</span></span>
          </div>
        `).join('') : `<div class="empty"><p>No dependencies set yet. Add one from a ticket's "Depends on" field.</p></div>`}
      </div>
    `;

    return graph + list;
  }

  /* ---------------- Timesheet ---------------- */
  function renderTimesheetList(logs, opts={}){
    logs = [...logs].sort((a,b) => b.date.localeCompare(a.date));
    const byDate = {};
    logs.forEach(l => { (byDate[l.date] = byDate[l.date] || []).push(l); });
    const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
    if (!dates.length) return `<div class="empty"><p>No time logged yet.${opts.showLogButton ? ' Use "Log time" to add an entry.' : ''}</p></div>`;
    return dates.map(date => {
      const dayLogs = byDate[date];
      const dayTotal = dayLogs.reduce((s,l) => s + Number(l.hours||0), 0);
      return `
      <div class="day-group">
        <div class="day-group__head"><span>${fmtDate(date)}</span><span class="rule"></span><span>${dayTotal}h</span></div>
        ${dayLogs.map(l => {
          const dev = devById(l.devId);
          const t = l.ticketId ? ticketById(l.ticketId) : null;
          return `
          <div class="log-row log-row--no-session" data-id="${l.id}">
            <span class="log-row__dev">${avatarHTML(l.devId)} ${dev ? escapeHTML(dev.name) : 'Unknown'}</span>
            <span class="mono" style="color:var(--text-dim)">${t ? escapeHTML(t.ticketNumber) + ' · ' + escapeHTML(t.title) : 'No ticket · standup / planning'}</span>
            <span class="log-row__hours">${l.hours}h</span>
            <span class="log-row__note">${escapeHTML(l.note || '')}</span>
            <button class="icon-btn deleteLogBtn" data-id="${l.id}" aria-label="Delete entry">
              <svg viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }

  function renderTimesheet(){
    const me = currentUser();
    if (!me) return `<div class="empty"><p>Choose who you are to see your timesheet.</p></div>`;
    const devIds = visibleDevIds();
    let logs = state.timeLogs.filter(l => devIds.includes(l.devId));
    if (ui.releaseId){
      logs = logs.filter(l => !l.ticketId || (ticketById(l.ticketId) && ticketById(l.ticketId).releaseId === ui.releaseId));
    }
    const weekTotal = logs.filter(l => l.devId === me.id && withinLastNDays(l.date, 7)).reduce((s,l) => s + Number(l.hours||0), 0);

    return `
      <div class="timesheet-toolbar">
        <span class="hint">${weekTotal}h logged by you in the last 7 days${devIds.length > 1 ? ' · showing your team' : ''}</span>
        <button class="btn btn--primary btn--sm" id="logTimeBtn" style="margin-left:auto">
          <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Log time
        </button>
      </div>
      ${renderTimesheetList(logs, { showLogButton: true })}
    `;
  }

  /* ---------------- Team ---------------- */
  const REPORT_PERIODS = [
    { id: 'daily',   label: 'Daily',   days: 1 },
    { id: 'weekly',  label: 'Weekly',  days: 7 },
    { id: 'monthly', label: 'Monthly', days: 30 },
    { id: 'yearly',  label: 'Yearly',  days: 365 },
  ];

  function devWeekStats(devId, weekStart){
    const weekEnd = addDaysISO(weekStart, 6);
    const hours = state.timeLogs
      .filter(l => l.devId === devId && l.date >= weekStart && l.date <= weekEnd)
      .reduce((s,l) => s + Number(l.hours||0), 0);
    const done = state.tickets
      .filter(t => t.assignee === devId && t.status === 'done' && t.updatedAt && t.updatedAt >= weekStart && t.updatedAt <= weekEnd)
      .length;
    return { hours, done };
  }
  /** Up to 4 Monday dates covering the current calendar month (5th week folds into week 4). */
  function currentMonthWeeks(){
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const last = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    const weeks = weeksInRange(first, last);
    return weeks.slice(0, 4);
  }

  function devAnalytics(dev, periodDays){
    const myTickets = state.tickets.filter(t => t.assignee === dev.id);
    const stories = myTickets.filter(t => t.type === 'story').length;
    const tasks = myTickets.filter(t => t.type === 'task').length;
    const bugs = myTickets.filter(t => t.type === 'bug').length;
    const enhancements = myTickets.filter(t => t.type === 'enhancement').length;

    const estimateTotal = myTickets.reduce((s,t) => s + Number(t.estimate||0), 0);
    const periodLogs = state.timeLogs.filter(l => l.devId === dev.id && (!periodDays || withinLastNDays(l.date, periodDays)));
    const loggedTotal = periodLogs.reduce((s,l) => s + Number(l.hours||0), 0);
    const remaining = myTickets
      .filter(t => t.status !== 'done')
      .reduce((s,t) => s + Math.max(0, Number(t.estimate||0) - actualHours(t.id)), 0);
    const utilizationPct = estimateTotal ? Math.round(loggedTotal / estimateTotal * 100) : 0;

    const active = myTickets.filter(t => t.status !== 'done');
    const overBudget = active.some(t => t.estimate > 0 && actualHours(t.id) > t.estimate * 1.15);
    const doneWithEstimate = myTickets.filter(t => t.status === 'done' && t.estimate > 0);
    const avgDoneRatio = doneWithEstimate.length
      ? doneWithEstimate.reduce((s,t) => s + actualHours(t.id) / t.estimate, 0) / doneWithEstimate.length
      : null;

    let status;
    if (overBudget) status = 'behind';
    else if (avgDoneRatio != null && avgDoneRatio <= 0.85) status = 'ahead';
    else status = 'on-track';

    return { myTickets, stories, tasks, bugs, enhancements, estimateTotal, loggedTotal, remaining, utilizationPct, status };
  }

  const RAG_LABEL = { behind: 'Behind', 'on-track': 'On track', ahead: 'Ahead' };

  function renderTeam(filterAssignee){
    const period = REPORT_PERIODS.find(p => p.id === ui.reportPeriod) || REPORT_PERIODS[1];
    let devs;
    if (Array.isArray(filterAssignee)) devs = state.developers.filter(d => filterAssignee.includes(d.id));
    else if (filterAssignee) devs = state.developers.filter(d => d.id === filterAssignee);
    else devs = state.developers;
    const grouped = filterAssignee === undefined; // group-by-team view only when showing everyone
    const canDrag = isCurrentUserAdmin();

    let utilCols;
    if (period.id === 'monthly'){
      const weeks = currentMonthWeeks();
      utilCols = weeks.map((w, i) => ({
        label: `Week ${i+1}`, sub: weekRangeLabel(w),
        raw: (dev) => devWeekStats(dev.id, w).hours,
        text: (dev) => { const st = devWeekStats(dev.id, w); return `${st.done} done · ${st.hours}h`; },
      }));
    } else if (period.id === 'weekly'){
      utilCols = [{ label: 'Utilized', sub: weekRangeLabel(mondayOf(todayISO())),
        raw: (dev) => devAnalytics(dev, 7).loggedTotal, text: (dev) => `${devAnalytics(dev, 7).loggedTotal}h` }];
    } else {
      utilCols = [{ label: 'Utilized', sub: period.label,
        raw: (dev) => devAnalytics(dev, period.days).loggedTotal, text: (dev) => `${devAnalytics(dev, period.days).loggedTotal}h` }];
    }
    const colCount = 9 + utilCols.length;

    function devRowHTML(dev){
      const a = devAnalytics(dev, period.days);
      return `
        <tr class="team-dev-row" data-dev-id="${dev.id}" ${canDrag ? 'draggable="true"' : ''}>
          <td>${avatarHTML(dev.id)} ${escapeHTML(dev.name)}${dev.isAdmin ? ' <span class="epic-tag">Admin</span>' : ''}${dev.isTeamLead ? ' <span class="epic-tag">Lead</span>' : ''}</td>
          <td class="mono">${a.stories}</td>
          <td class="mono">${a.tasks}</td>
          <td class="mono">${a.bugs}</td>
          <td class="mono">${a.enhancements}</td>
          <td class="mono">${a.estimateTotal}h</td>
          ${utilCols.map(c => `<td class="mono">${c.text(dev)}</td>`).join('')}
          <td class="mono">${a.remaining}h</td>
          <td class="mono">${a.utilizationPct}%</td>
          <td><span class="badge badge--rag-${a.status}"><span class="dot dot--rag-${a.status}"></span>${RAG_LABEL[a.status]}</span></td>
        </tr>`;
    }

    function groupHeaderHTML(groupId, name, groupDevs){
      const totalEst = groupDevs.reduce((s,d) => s + devAnalytics(d, period.days).estimateTotal, 0);
      const totalUtil = utilCols.map(c => groupDevs.reduce((s,d) => s + c.raw(d), 0));
      return `
        <tr class="team-group-row" data-group-drop="${groupId}">
          <td colspan="${colCount}">
            <div class="team-group-row__inner">
              <span class="team-group-row__name">${escapeHTML(name)}</span>
              <span class="team-group-row__count">${groupDevs.length} developer${groupDevs.length===1?'':'s'}</span>
              <span class="team-group-row__totals mono">Team total: ${totalEst}h est · ${totalUtil.map(h=>h+'h').join(' / ')} utilized</span>
            </div>
          </td>
        </tr>`;
    }

    let rows;
    if (grouped){
      const groupsPlusUngrouped = [...state.groups, { id: '', name: 'Ungrouped' }];
      rows = groupsPlusUngrouped.map(g => {
        const groupDevs = devs.filter(d => (d.groupId || '') === g.id);
        if (!groupDevs.length && g.id === '') return ''; // skip empty "Ungrouped" section
        return groupHeaderHTML(g.id, g.name, groupDevs) + groupDevs.map(devRowHTML).join('');
      }).join('');
    } else {
      rows = devs.map(devRowHTML).join('');
    }

    return `
      <div class="panel" id="reportPanel">
        <div class="panel__head">
          <h3>Resource utilization &amp; performance</h3>
          <span class="hint">${grouped && canDrag ? 'Drag a developer onto a team to regroup them · ' : ''}Per developer, plus team-wide totals</span>
        </div>
        <div class="table-toolbar" style="margin-bottom:16px;justify-content:space-between">
          <div class="period-tabs" id="periodTabs">
            ${REPORT_PERIODS.map(p => `<button type="button" class="period-tab${p.id===period.id?' is-active':''}" data-period="${p.id}">${p.label}</button>`).join('')}
          </div>
          <div style="display:flex;gap:10px">
            ${filterAssignee === undefined ? `<button class="btn btn--ghost btn--sm" id="addTeamMemberBtn">
              <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              Add team member
            </button>` : ''}
            <button class="btn btn--ghost btn--sm" id="exportCsvBtn">
              <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10m0 0-3.5-3.5M10 13l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              Download CSV
            </button>
            <button class="btn btn--ghost btn--sm" id="printReportBtn">
              <svg viewBox="0 0 20 20" fill="none"><path d="M6 7V3.5h8V7M6 14.5h8V17H6v-2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="3.5" y="7" width="13" height="7.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/></svg>
              Print / Save PDF
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Developer</th><th>Stories</th><th>Tasks</th><th>Bugs</th><th>Enh.</th>
                <th>Estimated</th>
                ${utilCols.map(c => `<th>${c.label}<br><span class="th-sub">${c.sub}</span></th>`).join('')}
                <th>Remaining</th><th>Util. %</th><th>Pace</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        <p class="field__hint" style="margin-top:12px">
          <strong>Behind</strong>: an active ticket has logged &gt;115% of its estimate.
          <strong>Ahead</strong>: delivered tickets averaged ≤85% of their estimate.
          <strong>On track</strong>: otherwise.
        </p>
      </div>
    `;
  }

  /* ---------------- Admin ---------------- */
  const ADMIN_TABS = [
    { id: 'dashboard',    label: 'Dashboard' },
    { id: 'plan',         label: 'Delivery Plan' },
    { id: 'utilization',  label: 'Resource Utilization' },
    { id: 'timesheet',    label: 'Timesheet' },
    { id: 'tickets',      label: 'Tickets' },
    { id: 'releases',     label: 'Releases' },
    { id: 'settings',     label: 'Settings' },
  ];

  function renderAdmin(){
    if (!isCurrentUserAdmin() && !isCurrentUserTeamLead()){
      return `<div class="empty"><p>This area is for admins and team leads only.</p></div>`;
    }
    const admin = isCurrentUserAdmin();
    const scopeIds = admin ? null : visibleDevIds(); // team leads are implicitly limited to their group
    const filter = ui.adminResourceFilter;
    const filterableDevs = state.developers.filter(d => !scopeIds || scopeIds.includes(d.id));
    const filterOptions = `<option value="">${admin ? 'All developers' : 'My team'}</option>` +
      filterableDevs.map(d => `<option value="${d.id}" ${filter===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('');

    const tabs = ADMIN_TABS.filter(t => admin || (t.id !== 'settings' && t.id !== 'releases'));
    if (!tabs.some(t => t.id === ui.adminTab)) ui.adminTab = 'dashboard';

    let body = '';
    if (ui.adminTab === 'dashboard') body = renderDashboard(filter || scopeIds || undefined);
    else if (ui.adminTab === 'utilization') body = renderTeam(filter || scopeIds || undefined);
    else if (ui.adminTab === 'timesheet'){
      const effectiveScope = filter ? [filter] : scopeIds;
      const logs = state.timeLogs.filter(l => !effectiveScope || effectiveScope.includes(l.devId));
      const total = logs.reduce((s,l) => s + Number(l.hours||0), 0);
      body = `<div class="panel"><div class="panel__head"><h3>Team timesheet</h3><span class="hint">${total}h total</span></div>${renderTimesheetList(logs)}</div>`;
    }
    else if (ui.adminTab === 'tickets') body = renderTickets(true);
    else if (ui.adminTab === 'settings' && admin) body = renderAdminSettings();
    else if (ui.adminTab === 'plan') body = renderAdminPlan();
    else if (ui.adminTab === 'releases' && admin) body = renderAdminReleases();

    return `
      <div class="table-toolbar" style="justify-content:space-between;margin-bottom:18px">
        ${ui.adminTab !== 'settings' ? `<select class="select-chip" id="adminResourceFilter">${filterOptions}</select>` : '<span></span>'}
        <div class="period-tabs" id="adminTabs">
          ${tabs.map(t => `<button type="button" class="period-tab${t.id===ui.adminTab?' is-active':''}" data-admin-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      ${body}
    `;
  }

  function renderAdminSettings(){
    const s = state.settings;
    return `
      <div class="panel" style="max-width:520px">
        <div class="panel__head">
          <h3>Workspace settings</h3>
          <span class="hint">Shared across the whole team</span>
        </div>
        <form id="adminSettingsForm">
          <div class="field">
            <label for="s_standup">Standup time</label>
            <input type="time" id="s_standup" value="${s.standupTime}">
          </div>
          <div class="field">
            <label for="s_eod">EOD plan due</label>
            <input type="time" id="s_eod" value="${s.eodTime}">
          </div>
          <div class="field">
            <label for="s_notify">Log-time reminder notification</label>
            <input type="time" id="s_notify" value="${s.notifyTime}">
            <p class="field__hint">Shows a browser notification at this time if you haven't logged any hours yet today. Requires the app to be open (or installed) and notification permission granted — it can't wake a fully closed browser.</p>
          </div>
          <div class="field">
            <label for="s_dailyHours">Daily estimate (hrs/day)</label>
            <input type="number" id="s_dailyHours" min="1" max="24" step="0.5" value="${s.dailyEstimateHours}">
            <p class="field__hint">Used as each developer's standard daily capacity for planning and utilization calculations.</p>
          </div>
          <button type="submit" class="btn btn--primary">Save settings</button>
        </form>
      </div>
    `;
  }

  function renderAdminReleases(){
    return `
      <div class="panel">
        <div class="panel__head">
          <h3>Release versions</h3>
          <span class="hint">Selecting one in the topbar scopes Epics, Board, Tickets, Dependencies, Timesheet and Team to it</span>
        </div>
        <form id="releaseForm" class="form-row" style="align-items:end;margin-bottom:18px">
          <div class="field" style="margin-bottom:0">
            <label for="rel_name">New release name</label>
            <input type="text" id="rel_name" placeholder="e.g. v2.4 or Sprint 12" required>
          </div>
          <div class="field" style="margin-bottom:0;display:flex;gap:10px">
            <div style="flex:1">
              <label for="rel_start">Start date</label>
              <input type="date" id="rel_start">
            </div>
            <div style="flex:1">
              <label for="rel_end">End date</label>
              <input type="date" id="rel_end">
            </div>
          </div>
        </form>
        <button type="submit" form="releaseForm" class="btn btn--primary btn--sm" style="margin-bottom:18px">
          <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Add release
        </button>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Release</th><th>Start</th><th>End</th><th>Tickets</th><th></th></tr></thead>
            <tbody>
              ${state.releases.map(r => {
                const count = state.tickets.filter(t => t.releaseId === r.id).length;
                return `
                <tr>
                  <td>${escapeHTML(r.name)}${r.isDefault ? ' <span class="epic-tag">Default</span>' : ''}</td>
                  <td class="mono">${r.startDate ? fmtDate(r.startDate) : '—'}</td>
                  <td class="mono">${r.endDate ? fmtDate(r.endDate) : '—'}</td>
                  <td class="mono">${count}</td>
                  <td>${!r.isDefault ? `<button class="icon-btn deleteReleaseBtn" data-id="${r.id}" aria-label="Delete release">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ---------------- Delivery Plan (high-level by team, low-level by developer) ---------------- */
  function groupWeekEstimate(groupId, weekStart, releaseId){
    const override = (state.weeklyPlan.overrides[groupId] || {})[weekStart];
    if (override != null) return override;
    const devIds = state.developers.filter(d => (d.groupId||'') === groupId).map(d => d.id);
    return state.tickets
      .filter(t => devIds.includes(t.assignee) && t.plannedWeekStart === weekStart && (!releaseId || t.releaseId === releaseId))
      .reduce((s,t) => s + Number(t.estimate||0), 0);
  }
  function groupWeekActual(groupId, weekStart){
    const devIds = state.developers.filter(d => (d.groupId||'') === groupId).map(d => d.id);
    const weekEnd = addDaysISO(weekStart, 6);
    return state.timeLogs
      .filter(l => devIds.includes(l.devId) && l.date >= weekStart && l.date <= weekEnd)
      .reduce((s,l) => s + Number(l.hours||0), 0);
  }
  function devWeekEstimate(devId, weekStart, releaseId){
    return state.tickets
      .filter(t => t.assignee === devId && t.plannedWeekStart === weekStart && (!releaseId || t.releaseId === releaseId))
      .reduce((s,t) => s + Number(t.estimate||0), 0);
  }
  function devWeekActual(devId, weekStart){
    const weekEnd = addDaysISO(weekStart, 6);
    return state.timeLogs
      .filter(l => l.devId === devId && l.date >= weekStart && l.date <= weekEnd)
      .reduce((s,l) => s + Number(l.hours||0), 0);
  }

  function renderAdminPlan(){
    const rel = currentRelease();
    if (!rel || !rel.startDate || !rel.endDate){
      return `<div class="empty"><p>Select (or create in the Releases tab) a release with start and end dates to see the delivery plan — it's built from ticket estimates planned across that date range.</p></div>`;
    }
    const weeks = weeksInRange(rel.startDate, rel.endDate);
    if (!weeks.length) return `<div class="empty"><p>This release's date range doesn't span a full week yet.</p></div>`;

    const admin = isCurrentUserAdmin();
    const myGroupId = currentUser() ? currentUser().groupId : null;
    const groupsToShow = admin ? state.groups : state.groups.filter(g => g.id === myGroupId);

    const highLevel = `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel__head">
          <h3>High-level: weekly delivery by team</h3>
          <span class="hint">${escapeHTML(rel.name)} · ${fmtDate(rel.startDate)} – ${fmtDate(rel.endDate)}</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Team</th>${weeks.map(w => `<th>${weekRangeLabel(w)}</th>`).join('')}</tr></thead>
            <tbody>
              ${groupsToShow.map(g => {
                const canEdit = admin || (isCurrentUserTeamLead() && myGroupId === g.id);
                return `
                <tr>
                  <td>${escapeHTML(g.name)}</td>
                  ${weeks.map(w => {
                    const est = groupWeekEstimate(g.id, w, rel.id);
                    const act = groupWeekActual(g.id, w);
                    const hasOverride = (state.weeklyPlan.overrides[g.id] || {})[w] != null;
                    return `<td>
                      <div class="mono" style="font-size:11px;color:var(--text-faint);margin-bottom:3px">${act}h delivered</div>
                      ${canEdit
                        ? `<input type="number" class="plan-override-input" data-group="${g.id}" data-week="${w}" value="${est}" min="0" step="0.5" title="${hasOverride ? 'Manually adjusted' : 'Auto-summed from ticket estimates'}">`
                        : `<span class="mono">${est}h</span>`}
                    </div>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p class="field__hint" style="margin-top:10px">"Delivered" sums logged hours that week. The editable estimate auto-sums ticket estimates planned for that week (via each ticket's "Planned week" field) — team leads and admins can type over it to set a manual target.</p>
      </div>
    `;

    const devIds = admin ? (ui.adminResourceFilter ? [ui.adminResourceFilter] : state.developers.map(d=>d.id)) : visibleDevIds();
    const planDevs = state.developers.filter(d => devIds.includes(d.id));
    const lowLevel = `
      <div class="panel">
        <div class="panel__head">
          <h3>Low-level: weekly plan vs actual by developer</h3>
          <span class="hint">A reason is needed when actual exceeds the estimate</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Developer</th><th>Week</th><th>Estimated</th><th>Actual</th><th>Variance</th><th>Reason</th></tr></thead>
            <tbody>
              ${planDevs.flatMap(d => weeks.map(w => {
                const est = devWeekEstimate(d.id, w, rel.id);
                const act = devWeekActual(d.id, w);
                const over = act > est;
                const reason = (state.weeklyPlan.reasons[d.id] || {})[w] || '';
                return `
                <tr>
                  <td>${avatarHTML(d.id)} ${escapeHTML(d.name)}</td>
                  <td class="mono">${weekRangeLabel(w)}</td>
                  <td class="mono">${est}h</td>
                  <td class="mono">${act}h</td>
                  <td>${over ? `<span class="badge badge--rag-behind">+${(act-est).toFixed(1)}h over</span>` : `<span class="badge badge--rag-ahead">On plan</span>`}</td>
                  <td>${over
                    ? `<input type="text" class="reason-input" data-reason-dev="${d.id}" data-reason-week="${w}" value="${escapeHTML(reason)}" placeholder="Why did actual exceed estimate?">`
                    : (reason ? escapeHTML(reason) : '<span class="dep-chip">—</span>')}</td>
                </tr>`;
              })).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    return highLevel + lowLevel;
  }
  const ticketModalOverlay = document.getElementById('ticketModalOverlay');
  const ticketForm = document.getElementById('ticketForm');

  function populateSelects(){
    const assigneeSel = document.getElementById('f_assignee');
    assigneeSel.innerHTML = state.developers.map(d => `<option value="${d.id}">${escapeHTML(d.name)}</option>`).join('');

    const dependsSel = document.getElementById('f_dependsOn');
    const currentId = document.getElementById('f_id').value;
    dependsSel.innerHTML = state.tickets.filter(t => t.id !== currentId)
      .map(t => `<option value="${t.id}">${escapeHTML(t.ticketNumber)} — ${escapeHTML(t.title)}</option>`).join('');

    const epicSel = document.getElementById('f_epic');
    epicSel.innerHTML = `<option value="">— No epic —</option>` +
      state.epics.map(e => `<option value="${e.id}">${escapeHTML(e.epicNumber)} — ${escapeHTML(e.title)}</option>`).join('');

    const releaseSel = document.getElementById('f_release');
    releaseSel.innerHTML = state.releases.map(r => `<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('');
  }

  /* ---------------- Effort estimation (Fibonacci story points) ---------------- */
  // Base dev hours per point, plus a risk buffer that scales up for bigger/less-certain stories.
  const POINTS_ESTIMATE = {
    0:  { base: 0,  buffer: 0 },
    1:  { base: 2,  buffer: 0.5 },   // 25%
    2:  { base: 4,  buffer: 1 },     // 25%
    3:  { base: 6,  buffer: 1.5 },   // 25%
    5:  { base: 10, buffer: 3 },     // 30%
    8:  { base: 16, buffer: 5 },     // ~31%
    13: { base: 26, buffer: 9 },     // ~35%
    21: { base: 40, buffer: 16 },    // 40%
  };

  // Give each chip a tooltip with the base/buffer/total breakdown.
  document.querySelectorAll('#pointsPicker .points-chip').forEach(chip => {
    const pts = parseInt(chip.dataset.pts, 10);
    const e = POINTS_ESTIMATE[pts];
    if (e) chip.title = `${e.base}h dev + ${e.buffer}h buffer = ${e.base + e.buffer}h`;
  });

  function setPointsPicker(value){
    const val = String(value);
    document.getElementById('f_storyPoints').value = value;
    document.querySelectorAll('#pointsPicker .points-chip').forEach(chip => {
      chip.classList.toggle('is-selected', chip.dataset.pts === val);
    });
  }
  document.getElementById('pointsPicker').addEventListener('click', (e) => {
    const chip = e.target.closest('.points-chip');
    if (!chip) return;
    const pts = parseInt(chip.dataset.pts, 10);
    setPointsPicker(pts);
    const estimateField = document.getElementById('f_estimate');
    // Auto-suggest hours (base + risk buffer) from the reference scale; still freely editable.
    if (POINTS_ESTIMATE[pts]) estimateField.value = POINTS_ESTIMATE[pts].base + POINTS_ESTIMATE[pts].buffer;
  });

  /* ---------------- Bug lifecycle labels (Open / In Progress / Resolved / Closed) ---------------- */
  function syncStatusOptionLabels(type){
    const isBug = type === 'bug';
    document.querySelectorAll('#f_status option').forEach(opt => {
      opt.textContent = isBug ? opt.dataset.labelBug : opt.dataset.labelDefault;
    });
    document.getElementById('statusHint').hidden = !isBug;
  }
  document.getElementById('f_type').addEventListener('change', (e) => syncStatusOptionLabels(e.target.value));

  function openTicketModal(ticket){
    document.getElementById('modalTitle').textContent = ticket ? 'Edit ticket' : 'New ticket';
    document.getElementById('deleteTicketBtn').hidden = !ticket;
    document.getElementById('f_id').value = ticket ? ticket.id : '';
    populateSelects();

    document.getElementById('f_ticketNumber').value = ticket ? ticket.ticketNumber : nextTicketNumber();
    document.getElementById('f_title').value = ticket ? ticket.title : '';
    document.getElementById('f_type').value = ticket ? ticket.type : 'task';
    syncStatusOptionLabels(document.getElementById('f_type').value);
    document.getElementById('f_assignee').value = ticket ? ticket.assignee : (state.developers[0] || {}).id || '';
    document.getElementById('f_priority').value = ticket ? ticket.priority : 'medium';
    document.getElementById('f_status').value = ticket ? ticket.status : 'backlog';
    document.getElementById('f_estimate').value = ticket ? ticket.estimate : '';
    document.getElementById('f_epic').value = ticket ? (ticket.epicId || '') : '';
    document.getElementById('f_release').value = ticket ? ticket.releaseId : (currentRelease() ? currentRelease().id : '');
    document.getElementById('f_plannedWeek').value = ticket && ticket.plannedWeekStart ? ticket.plannedWeekStart : '';
    setPointsPicker(ticket && ticket.storyPoints != null ? ticket.storyPoints : 0);
    document.getElementById('f_blockerNote').value = ticket ? ticket.blockerNote || '' : '';
    document.getElementById('f_description').value = ticket ? ticket.description || '' : '';

    const dependsSel = document.getElementById('f_dependsOn');
    const deps = new Set(ticket ? (ticket.dependsOn||[]) : []);
    Array.from(dependsSel.options).forEach(o => { o.selected = deps.has(o.value); });

    modalSubtasks = ticket && ticket.subtasks ? ticket.subtasks.map(s => ({ ...s })) : cloneTemplateSubtasks();
    renderSubtaskList();

    modalScenarios = ticket && ticket.scenarios ? ticket.scenarios.map(s => ({ ...s })) : [];
    renderScenarioList();

    ticketModalOverlay.hidden = false;
  }

  /* ---------------- Ticket checklist (subtasks) ---------------- */
  let modalSubtasks = [];

  function cloneTemplateSubtasks(){
    return state.settings.subtaskTemplate.map(name => ({ id: uid('s'), name, done: false }));
  }

  function renderSubtaskList(){
    const container = document.getElementById('subtaskList');
    if (!modalSubtasks.length){
      container.innerHTML = `<p class="field__hint" style="margin:2px 0 4px">No checklist steps yet. Add one below, or reset to the default delivery checklist.</p>`;
      return;
    }
    container.innerHTML = modalSubtasks.map(s => `
      <div class="subtask-row ${s.done ? 'is-done' : ''}" data-id="${s.id}">
        <input type="checkbox" ${s.done ? 'checked' : ''} data-subtask-toggle="${s.id}">
        <span class="subtask-row__name">${escapeHTML(s.name)}</span>
        <button type="button" class="icon-btn subtask-row__remove" data-subtask-remove="${s.id}" aria-label="Remove step">
          <svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('[data-subtask-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const s = modalSubtasks.find(x => x.id === cb.dataset.subtaskToggle);
        if (s) s.done = cb.checked;
        renderSubtaskList();
      });
    });
    container.querySelectorAll('[data-subtask-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        modalSubtasks = modalSubtasks.filter(x => x.id !== btn.dataset.subtaskRemove);
        renderSubtaskList();
      });
    });
  }

  document.getElementById('subtaskAddBtn').addEventListener('click', () => {
    const input = document.getElementById('subtaskAddInput');
    const name = input.value.trim();
    if (!name) return;
    modalSubtasks.push({ id: uid('s'), name, done: false });
    input.value = '';
    renderSubtaskList();
  });
  document.getElementById('subtaskAddInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); document.getElementById('subtaskAddBtn').click(); }
  });
  document.getElementById('resetSubtasksBtn').addEventListener('click', () => {
    modalSubtasks = cloneTemplateSubtasks();
    renderSubtaskList();
    toast('Checklist reset to default');
  });

  /* ---------------- Ticket flows / use cases / test scenarios ---------------- */
  let modalScenarios = [];
  const SCENARIO_TYPE_LABEL = { flow: 'Flow', usecase: 'Use case', test: 'Test scenario' };

  function renderScenarioList(){
    const container = document.getElementById('scenarioList');
    if (!modalScenarios.length){
      container.innerHTML = `<p class="field__hint" style="margin:2px 0 4px">No scenarios yet. Add a flow, use case or high-level test scenario for this step.</p>`;
      return;
    }
    container.innerHTML = modalScenarios.map(s => `
      <div class="scenario-row" data-id="${s.id}">
        <div class="scenario-row__head">
          <select class="scenario-type" data-scenario-type="${s.id}">
            <option value="flow" ${s.type==='flow'?'selected':''}>Flow</option>
            <option value="usecase" ${s.type==='usecase'?'selected':''}>Use case</option>
            <option value="test" ${s.type==='test'?'selected':''}>Test scenario</option>
          </select>
          <button type="button" class="icon-btn" data-scenario-remove="${s.id}" aria-label="Remove scenario">
            <svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <input type="text" class="scenario-title" data-scenario-title="${s.id}" placeholder="Title, e.g. Dev submits EOD plan with justification" value="${escapeHTML(s.title)}">
        <textarea class="scenario-desc" data-scenario-desc="${s.id}" rows="2" placeholder="Given / When / Then, or a short step outline...">${escapeHTML(s.description)}</textarea>
      </div>
    `).join('');

    container.querySelectorAll('[data-scenario-type]').forEach(sel => {
      sel.addEventListener('change', () => {
        const s = modalScenarios.find(x => x.id === sel.dataset.scenarioType);
        if (s) s.type = sel.value;
      });
    });
    container.querySelectorAll('[data-scenario-title]').forEach(inp => {
      inp.addEventListener('input', () => {
        const s = modalScenarios.find(x => x.id === inp.dataset.scenarioTitle);
        if (s) s.title = inp.value;
      });
    });
    container.querySelectorAll('[data-scenario-desc]').forEach(ta => {
      ta.addEventListener('input', () => {
        const s = modalScenarios.find(x => x.id === ta.dataset.scenarioDesc);
        if (s) s.description = ta.value;
      });
    });
    container.querySelectorAll('[data-scenario-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        modalScenarios = modalScenarios.filter(x => x.id !== btn.dataset.scenarioRemove);
        renderScenarioList();
      });
    });
  }

  document.getElementById('addScenarioBtn').addEventListener('click', () => {
    modalScenarios.push({ id: uid('sc'), type: 'test', title: '', description: '' });
    renderScenarioList();
    const rows = document.querySelectorAll('#scenarioList .scenario-title');
    if (rows.length) rows[rows.length - 1].focus();
  });

  function nextTicketNumber(){
    const nums = state.tickets.map(t => {
      const m = t.ticketNumber.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const max = Math.max(100, ...nums);
    const prefix = (state.tickets[0] && state.tickets[0].ticketNumber.match(/^[A-Za-z]+/) || ['CCS'])[0];
    return `${prefix}-${max + 1}`;
  }

  function closeTicketModal(){ ticketModalOverlay.hidden = true; ticketForm.reset(); }

  document.getElementById('newTicketBtn').addEventListener('click', () => openTicketModal(null));
  document.getElementById('closeModalBtn').addEventListener('click', closeTicketModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeTicketModal);
  ticketModalOverlay.addEventListener('click', (e) => { if (e.target === ticketModalOverlay) closeTicketModal(); });

  ticketForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    const dependsOn = Array.from(document.getElementById('f_dependsOn').selectedOptions).map(o => o.value);
    const payload = {
      ticketNumber: document.getElementById('f_ticketNumber').value.trim(),
      title: document.getElementById('f_title').value.trim(),
      type: document.getElementById('f_type').value,
      assignee: document.getElementById('f_assignee').value,
      priority: document.getElementById('f_priority').value,
      status: document.getElementById('f_status').value,
      estimate: parseFloat(document.getElementById('f_estimate').value) || 0,
      epicId: document.getElementById('f_epic').value || null,
      releaseId: document.getElementById('f_release').value || currentRelease().id,
      plannedWeekStart: document.getElementById('f_plannedWeek').value ? mondayOf(document.getElementById('f_plannedWeek').value) : null,
      storyPoints: parseFloat(document.getElementById('f_storyPoints').value) || 0,
      dependsOn,
      blockerNote: document.getElementById('f_blockerNote').value.trim(),
      description: document.getElementById('f_description').value.trim(),
      subtasks: modalSubtasks.map(s => ({ ...s })),
      scenarios: modalScenarios.map(s => ({ ...s })),
      updatedAt: todayISO(),
    };
    if (id){
      Object.assign(ticketById(id), payload);
      toast('Ticket updated');
    } else {
      payload.id = uid('t');
      payload.createdAt = todayISO();
      state.tickets.push(payload);
      toast('Ticket created');
    }
    saveState();
    closeTicketModal();
    render();
  });

  document.getElementById('deleteTicketBtn').addEventListener('click', () => {
    const id = document.getElementById('f_id').value;
    if (!id) return;
    if (!confirm('Delete this ticket? This cannot be undone.')) return;
    state.tickets = state.tickets.filter(t => t.id !== id);
    state.tickets.forEach(t => { t.dependsOn = (t.dependsOn||[]).filter(depId => depId !== id); });
    state.timeLogs.forEach(l => { if (l.ticketId === id) l.ticketId = null; });
    saveState();
    closeTicketModal();
    toast('Ticket deleted');
    render();
  });

  /* ---------------- Epic modal ---------------- */
  const epicModalOverlay = document.getElementById('epicModalOverlay');
  const epicForm = document.getElementById('epicForm');

  function nextEpicNumber(){
    const nums = state.epics.map(e => {
      const m = e.epicNumber.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const max = Math.max(0, ...nums);
    return `EPIC-${max + 1}`;
  }

  function openEpicModal(epic){
    document.getElementById('epicModalTitle').textContent = epic ? 'Edit epic' : 'New epic';
    document.getElementById('deleteEpicBtn').hidden = !epic;
    document.getElementById('e_id').value = epic ? epic.id : '';

    const ownerSel = document.getElementById('e_owner');
    ownerSel.innerHTML = state.developers.map(d => `<option value="${d.id}">${escapeHTML(d.name)}</option>`).join('');

    document.getElementById('e_epicNumber').value = epic ? epic.epicNumber : nextEpicNumber();
    document.getElementById('e_status').value = epic ? epic.status : 'planned';
    document.getElementById('e_title').value = epic ? epic.title : '';
    document.getElementById('e_owner').value = epic ? epic.owner : (state.developers[0]||{}).id || '';
    document.getElementById('e_timeEstimate').value = epic ? epic.timeEstimate : '';
    document.getElementById('e_description').value = epic ? epic.description || '' : '';

    const hint = document.getElementById('epicStoriesHint');
    if (epic){
      const n = storiesForEpic(epic.id).length;
      hint.textContent = n ? `${n} ticket${n===1?'':'s'} linked to this epic.` : `No tickets linked yet. Link stories, tasks or bugs from the ticket editor's Epic field.`;
    } else {
      hint.textContent = `Link stories, tasks or bugs to this epic from the ticket editor's Epic field.`;
    }

    epicModalOverlay.hidden = false;
  }
  function closeEpicModal(){ epicModalOverlay.hidden = true; epicForm.reset(); }

  document.getElementById('closeEpicModalBtn').addEventListener('click', closeEpicModal);
  document.getElementById('cancelEpicModalBtn').addEventListener('click', closeEpicModal);
  epicModalOverlay.addEventListener('click', (e) => { if (e.target === epicModalOverlay) closeEpicModal(); });

  epicForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('e_id').value;
    const payload = {
      epicNumber: document.getElementById('e_epicNumber').value.trim(),
      status: document.getElementById('e_status').value,
      title: document.getElementById('e_title').value.trim(),
      owner: document.getElementById('e_owner').value,
      timeEstimate: parseFloat(document.getElementById('e_timeEstimate').value) || 0,
      description: document.getElementById('e_description').value.trim(),
      updatedAt: todayISO(),
    };
    if (id){
      Object.assign(epicById(id), payload);
      toast('Epic updated');
    } else {
      payload.id = uid('e');
      payload.createdAt = todayISO();
      state.epics.push(payload);
      toast('Epic created');
    }
    saveState();
    closeEpicModal();
    render();
  });

  document.getElementById('deleteEpicBtn').addEventListener('click', () => {
    const id = document.getElementById('e_id').value;
    if (!id) return;
    if (!confirm('Delete this epic? Linked tickets stay, but will no longer belong to an epic.')) return;
    state.epics = state.epics.filter(e => e.id !== id);
    state.tickets.forEach(t => { if (t.epicId === id) t.epicId = null; });
    saveState();
    closeEpicModal();
    toast('Epic deleted');
    render();
  });

  /* ---------------- Identity ("who's logging in") ---------------- */
  const identityModalOverlay = document.getElementById('identityModalOverlay');
  const identityForm = document.getElementById('identityForm');
  let usingGoogleAuth = false; // true once someone has signed in with Google this session

  function resolveDevByEmail(email, name, photoURL){
    let dev = state.developers.find(d => d.email && d.email.toLowerCase() === email.toLowerCase());
    if (!dev){
      dev = {
        id: uid('dev'), name: name || email.split('@')[0], role: 'Team member',
        email, photoURL: photoURL || null, isAdmin: false,
        color: AVATAR_COLORS[state.developers.length % AVATAR_COLORS.length],
      };
      state.developers.push(dev);
      toast(`Welcome, ${dev.name} — added you to the team`);
    } else if (photoURL && dev.photoURL !== photoURL){
      dev.photoURL = photoURL;
    }
    saveState();
    return dev;
  }

  function openIdentityModal(allowClose){
    const sel = document.getElementById('i_dev');
    sel.innerHTML = state.developers.map(d => `<option value="${d.id}">${escapeHTML(d.name)} — ${escapeHTML(d.role)}</option>`).join('');
    const existing = currentUser();
    if (existing) sel.value = existing.id;
    document.getElementById('closeIdentityModalBtn').hidden = !allowClose;

    const googleReady = window.PulseAuth && window.PulseAuth.enabled;
    document.getElementById('googleSignInBtn').hidden = !googleReady;
    document.getElementById('identityDivider').hidden = !googleReady;
    document.getElementById('googleUnavailableHint').hidden = googleReady;

    identityModalOverlay.hidden = false;
  }
  function closeIdentityModal(){ identityModalOverlay.hidden = true; }

  document.getElementById('closeIdentityModalBtn').addEventListener('click', closeIdentityModal);
  document.getElementById('identityWidget').addEventListener('click', () => {
    if (usingGoogleAuth && window.PulseAuth){
      window.PulseAuth.signOutUser().finally(() => {
        localStorage.removeItem(IDENTITY_KEY);
        usingGoogleAuth = false;
        openIdentityModal(true);
      });
    } else {
      openIdentityModal(true);
    }
  });

  document.getElementById('googleSignInBtn').addEventListener('click', async () => {
    try{
      const g = await window.PulseAuth.signInWithGoogle();
      const dev = resolveDevByEmail(g.email, g.name, g.photoURL);
      localStorage.setItem(IDENTITY_KEY, dev.id);
      usingGoogleAuth = true;
      closeIdentityModal();
      toast(`Signed in as ${dev.name}`);
      setView(ui.view);
    }catch(err){
      console.error(err);
      toast('Google sign-in failed — try again or use a device profile below');
    }
  });

  identityForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const devId = document.getElementById('i_dev').value;
    if (!devId) return;
    localStorage.setItem(IDENTITY_KEY, devId);
    usingGoogleAuth = false;
    closeIdentityModal();
    const dev = devById(devId);
    toast(`Logged in as ${dev.name}`);
    setView(ui.view);
  });

  /* ---------------- Theme ---------------- */
  const THEME_KEY = 'pulse_theme';
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeToggleText').textContent = theme === 'light' ? 'Light theme' : 'Dark theme';
    localStorage.setItem(THEME_KEY, theme);
  }
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
  applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

  /* ---------------- Team member modal ---------------- */
  const memberModalOverlay = document.getElementById('memberModalOverlay');
  const memberForm = document.getElementById('memberForm');

  function openTeamMemberModal(member){
    memberForm.reset();
    document.getElementById('memberModalTitle').textContent = member ? 'Edit team member' : 'Add team member';
    document.getElementById('memberSubmitBtn').textContent = member ? 'Save changes' : 'Add member';
    document.getElementById('deleteMemberBtn').hidden = !member;
    document.getElementById('m_id').value = member ? member.id : '';

    const groupSel = document.getElementById('m_group');
    groupSel.innerHTML = `<option value="">— Unassigned —</option>` +
      state.groups.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join('');

    document.getElementById('m_name').value = member ? member.name : '';
    document.getElementById('m_role').value = member ? member.role : '';
    document.getElementById('m_email').value = member ? (member.email || '') : '';
    groupSel.value = member ? (member.groupId || '') : '';
    document.getElementById('m_isTeamLead').checked = member ? !!member.isTeamLead : false;
    document.getElementById('m_isAdmin').checked = member ? !!member.isAdmin : false;

    memberModalOverlay.hidden = false;
    document.getElementById('m_name').focus();
  }
  function closeMemberModal(){ memberModalOverlay.hidden = true; memberForm.reset(); }

  document.getElementById('closeMemberModalBtn').addEventListener('click', closeMemberModal);
  document.getElementById('cancelMemberModalBtn').addEventListener('click', closeMemberModal);
  memberModalOverlay.addEventListener('click', (e) => { if (e.target === memberModalOverlay) closeMemberModal(); });

  memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('m_id').value;
    const name = document.getElementById('m_name').value.trim();
    const role = document.getElementById('m_role').value.trim();
    const email = document.getElementById('m_email').value.trim();
    const groupId = document.getElementById('m_group').value || null;
    const isTeamLead = document.getElementById('m_isTeamLead').checked;
    const isAdmin = document.getElementById('m_isAdmin').checked;
    if (!name || !role) return;

    if (id){
      const dev = devById(id);
      if (dev) Object.assign(dev, { name, role, email: email || null, groupId, isTeamLead, isAdmin });
      toast(`${name} updated`);
    } else {
      state.developers.push({
        id: uid('dev'), name, role, isAdmin, isTeamLead, groupId, email: email || null, photoURL: null,
        color: AVATAR_COLORS[state.developers.length % AVATAR_COLORS.length],
      });
      toast(`${name} added to the team`);
    }
    saveState();
    closeMemberModal();
    render();
  });

  document.getElementById('deleteMemberBtn').addEventListener('click', () => {
    const id = document.getElementById('m_id').value;
    if (!id) return;
    const dev = devById(id);
    if (!dev) return;
    const hasTickets = state.tickets.some(t => t.assignee === id);
    const confirmMsg = hasTickets
      ? `Remove ${dev.name}? They have tickets assigned — those will become unassigned, not deleted.`
      : `Remove ${dev.name} from the team?`;
    if (!confirm(confirmMsg)) return;
    state.developers = state.developers.filter(d => d.id !== id);
    state.tickets.forEach(t => { if (t.assignee === id) t.assignee = null; });
    if (currentUser() && currentUser().id === id) localStorage.removeItem(IDENTITY_KEY);
    saveState();
    closeMemberModal();
    toast(`${dev.name} removed`);
    if (!currentUser()) openIdentityModal(false); else render();
  });

  /* ---------------- Time log modal ---------------- */
  const logModalOverlay = document.getElementById('logModalOverlay');
  const logForm = document.getElementById('logForm');

  function openLogModal(){
    const me = currentUser();
    if (!me){ toast('Choose who you are first'); return; }
    document.getElementById('logForDisplay').textContent = `Logging time as ${me.name}`;
    document.getElementById('l_ticket').innerHTML = `<option value="">— No ticket —</option>` +
      state.tickets.map(t => `<option value="${t.id}">${escapeHTML(t.ticketNumber)} — ${escapeHTML(t.title)}</option>`).join('');
    document.getElementById('l_date').value = todayISO();
    document.getElementById('l_hours').value = '';
    document.getElementById('l_note').value = '';
    logModalOverlay.hidden = false;
  }
  function closeLogModal(){ logModalOverlay.hidden = true; logForm.reset(); }

  document.getElementById('closeLogModalBtn').addEventListener('click', closeLogModal);
  document.getElementById('cancelLogModalBtn').addEventListener('click', closeLogModal);
  logModalOverlay.addEventListener('click', (e) => { if (e.target === logModalOverlay) closeLogModal(); });

  logForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const me = currentUser();
    if (!me) return;
    state.timeLogs.push({
      id: uid('l'),
      devId: me.id,
      date: document.getElementById('l_date').value,
      session: new Date().getHours() < 13 ? 'AM' : 'PM', // auto-detected from time of day logged
      hours: parseFloat(document.getElementById('l_hours').value) || 0,
      ticketId: document.getElementById('l_ticket').value || null,
      note: document.getElementById('l_note').value.trim(),
    });
    saveState();
    closeLogModal();
    toast('Time logged');
    render();
  });

  /* ---------------- View-level event binding ---------------- */
  /* ---------------- Resource utilization report (CSV) ---------------- */
  function csvCell(value){
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRow(cells){ return cells.map(csvCell).join(','); }

  function downloadTextFile(filename, mime, content){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildResourceReportCSV(){
    const rows = [];
    const period = REPORT_PERIODS.find(p => p.id === ui.reportPeriod) || REPORT_PERIODS[1];
    const perDev = state.developers.map(d => ({ dev: d, a: devAnalytics(d, period.days) }));

    const totalEstimate = perDev.reduce((s,x) => s + x.a.estimateTotal, 0);
    const totalLogged = perDev.reduce((s,x) => s + x.a.loggedTotal, 0);
    const totalRemaining = perDev.reduce((s,x) => s + x.a.remaining, 0);
    const overallUtilization = totalEstimate ? Math.round(totalLogged / totalEstimate * 100) : 0;
    const behindCount = perDev.filter(x => x.a.status === 'behind').length;
    const aheadCount = perDev.filter(x => x.a.status === 'ahead').length;
    const onTrackCount = perDev.filter(x => x.a.status === 'on-track').length;

    rows.push(csvRow(['Pulse — Resource Utilization & Performance Report']));
    rows.push(csvRow(['Generated', new Date().toLocaleString()]));
    rows.push(csvRow(['Period', period.label]));
    rows.push('');
    rows.push(csvRow(['Team Summary']));
    rows.push(csvRow(['Metric', 'Value']));
    rows.push(csvRow(['Developers', state.developers.length]));
    rows.push(csvRow(['Total tickets', state.tickets.length]));
    rows.push(csvRow(['Total estimated hours', totalEstimate]));
    rows.push(csvRow([`Total utilized hours (${period.label.toLowerCase()})`, totalLogged]));
    rows.push(csvRow(['Total remaining hours', totalRemaining]));
    rows.push(csvRow(['Overall utilization %', overallUtilization + '%']));
    rows.push(csvRow(['Ahead', aheadCount]));
    rows.push(csvRow(['On track', onTrackCount]));
    rows.push(csvRow(['Behind', behindCount]));
    rows.push('');
    rows.push(csvRow(['Resource-wise Report']));
    rows.push(csvRow([
      'Developer', 'Stories', 'Tasks', 'Bugs', 'Enhancements',
      'Total Tickets', 'Estimated Hrs', `Utilized Hrs (${period.label})`, 'Remaining Hrs',
      'Utilization %', 'Pace'
    ]));
    perDev.forEach(({ dev, a }) => {
      rows.push(csvRow([
        dev.name, a.stories, a.tasks, a.bugs, a.enhancements,
        a.myTickets.length, a.estimateTotal, a.loggedTotal, a.remaining,
        a.utilizationPct + '%', RAG_LABEL[a.status]
      ]));
    });

    return rows.join('\r\n');
  }

  function bindViewEvents(){
    // Ticket cards & rows open the edit modal
    document.querySelectorAll('.ticket-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (card.getAttribute('data-dragging') === '1') return;
        openTicketModal(ticketById(card.dataset.id));
      });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.setAttribute('data-dragging', '1');
        setTimeout(() => card.classList.add('is-dragging'), 0);
      });
      card.addEventListener('dragend', () => {
        card.removeAttribute('data-dragging');
        card.classList.remove('is-dragging');
      });
    });

    document.querySelectorAll('.board-col__body').forEach(col => {
      col.addEventListener('dragover', (e) => e.preventDefault());
      col.addEventListener('dragenter', (e) => { e.preventDefault(); col.classList.add('is-dragover'); });
      col.addEventListener('dragleave', (e) => {
        // Only clear the highlight when actually leaving the column, not when
        // moving between child cards inside it (avoids visual flicker).
        if (!col.contains(e.relatedTarget)) col.classList.remove('is-dragover');
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-dragover');
        const id = e.dataTransfer.getData('text/plain');
        const t = ticketById(id);
        if (!t) return;
        const newStatus = col.dataset.status;

        if (newStatus === 'done'){
          const sp = subtasksProgress(t);
          const logged = actualHours(t.id);
          const missing = [];
          if (sp.total && sp.done < sp.total) missing.push(`finish the checklist (${sp.done}/${sp.total})`);
          if (logged <= 0) missing.push('log some hours');
          if (missing.length){
            toast(`Before marking done: ${missing.join(' and ')}.`);
            openTicketModal(t);
            return;
          }
        }

        if (newStatus !== 'blocked' && unmetDeps(t).length > 0){
          toast(`Still waiting on ${unmetDeps(t).map(d=>d.ticketNumber).join(', ')}`);
        }
        t.status = newStatus;
        t.updatedAt = todayISO();
        saveState();
        render();
      });
    });

    document.querySelectorAll('.data-table tbody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => openTicketModal(ticketById(row.dataset.id)));
    });

    document.querySelectorAll('[data-status-select]').forEach(sel => {
      sel.className = 'status-inline-select badge--status-' + sel.value;
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        const t = ticketById(sel.dataset.statusSelect);
        if (!t) return;
        t.status = sel.value;
        t.updatedAt = todayISO();
        saveState();
        toast('Status updated');
        render();
      });
    });

    const boardFilter = document.getElementById('boardAssigneeFilter');
    if (boardFilter) boardFilter.addEventListener('change', (e) => { ui.boardAssigneeFilter = e.target.value; render(); });

    const fType = document.getElementById('filterType');
    const fStatus = document.getElementById('filterStatus');
    const fAssignee = document.getElementById('filterAssignee');
    if (fType) fType.addEventListener('change', (e) => { ui.tableFilters.type = e.target.value; render(); });
    if (fStatus) fStatus.addEventListener('change', (e) => { ui.tableFilters.status = e.target.value; render(); });
    if (fAssignee) fAssignee.addEventListener('change', (e) => { ui.tableFilters.assignee = e.target.value; render(); });

    const logTimeBtn = document.getElementById('logTimeBtn');
    if (logTimeBtn) logTimeBtn.addEventListener('click', openLogModal);

    document.querySelectorAll('.deleteLogBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.timeLogs = state.timeLogs.filter(l => l.id !== btn.dataset.id);
        saveState();
        toast('Entry removed');
        render();
      });
    });

    document.querySelectorAll('.dep-node').forEach(node => {
      node.addEventListener('click', () => {
        if (node.getAttribute('data-dragging') === '1') return;
        openTicketModal(ticketById(node.dataset.id));
      });

      node.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', node.dataset.id);
        node.setAttribute('data-dragging', '1');
        setTimeout(() => node.classList.add('is-dragging'), 0);
      });
      node.addEventListener('dragend', () => {
        node.removeAttribute('data-dragging');
        node.classList.remove('is-dragging');
      });
      node.addEventListener('dragover', (e) => e.preventDefault());
      node.addEventListener('dragenter', (e) => { e.preventDefault(); node.classList.add('is-dragover'); });
      node.addEventListener('dragleave', (e) => {
        if (!node.contains(e.relatedTarget)) node.classList.remove('is-dragover');
      });
      node.addEventListener('drop', (e) => {
        e.preventDefault();
        node.classList.remove('is-dragover');
        const draggedId = e.dataTransfer.getData('text/plain');
        const targetId = node.dataset.id;
        if (!draggedId || draggedId === targetId) return;
        const dragged = ticketById(draggedId);
        const target = ticketById(targetId);
        if (!dragged || !target) return;

        dragged.dependsOn = dragged.dependsOn || [];
        if (dragged.dependsOn.includes(targetId)){
          toast(`${dragged.ticketNumber} already depends on ${target.ticketNumber}`);
          return;
        }
        // Cycle guard: reject if target already (transitively) depends on the dragged ticket.
        const wouldCycle = (id, seen = new Set()) => {
          if (id === draggedId) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          const tt = ticketById(id);
          return (tt && tt.dependsOn || []).some(depId => wouldCycle(depId, seen));
        };
        if (wouldCycle(targetId)){
          toast('That would create a circular dependency');
          return;
        }
        dragged.dependsOn.push(targetId);
        dragged.updatedAt = todayISO();
        saveState();
        toast(`${dragged.ticketNumber} now depends on ${target.ticketNumber}`);
        render();
      });
    });

    document.querySelectorAll('.epic-card').forEach(card => {
      card.addEventListener('click', () => openEpicModal(epicById(card.dataset.id)));
    });
    const newEpicBtn = document.getElementById('newEpicBtn');
    if (newEpicBtn) newEpicBtn.addEventListener('click', () => openEpicModal(null));

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => {
      downloadTextFile(`pulse-resource-report-${todayISO()}.csv`, 'text/csv;charset=utf-8;', buildResourceReportCSV());
      toast('Report downloaded');
    });

    const printReportBtn = document.getElementById('printReportBtn');
    if (printReportBtn) printReportBtn.addEventListener('click', () => window.print());

    document.querySelectorAll('.period-tab[data-period]').forEach(btn => {
      btn.addEventListener('click', () => { ui.reportPeriod = btn.dataset.period; render(); });
    });
    document.querySelectorAll('.period-tab[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => { ui.adminTab = btn.dataset.adminTab; render(); });
    });
    const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
    if (addTeamMemberBtn) addTeamMemberBtn.addEventListener('click', () => openTeamMemberModal(null));

    document.querySelectorAll('.team-dev-row').forEach(row => {
      row.addEventListener('click', () => {
        if (row.getAttribute('data-dragging') === '1') return;
        openTeamMemberModal(devById(row.dataset.devId));
      });
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', row.dataset.devId);
        row.setAttribute('data-dragging', '1');
        setTimeout(() => row.classList.add('is-dragging'), 0);
      });
      row.addEventListener('dragend', () => {
        row.removeAttribute('data-dragging');
        row.classList.remove('is-dragging');
      });
    });
    document.querySelectorAll('.team-group-row').forEach(row => {
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('dragenter', (e) => { e.preventDefault(); row.classList.add('is-dragover'); });
      row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('is-dragover'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('is-dragover');
        const devId = e.dataTransfer.getData('text/plain');
        const dev = devById(devId);
        if (!dev) return;
        const newGroupId = row.dataset.groupDrop || null;
        if ((dev.groupId || '') === newGroupId) return;
        dev.groupId = newGroupId || null;
        saveState();
        toast(`${dev.name} moved to ${groupById(newGroupId) ? groupById(newGroupId).name : 'Ungrouped'}`);
        render();
      });
    });

    const adminResourceFilter = document.getElementById('adminResourceFilter');
    if (adminResourceFilter) adminResourceFilter.addEventListener('change', (e) => { ui.adminResourceFilter = e.target.value; render(); });

    document.querySelectorAll('.plan-override-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const groupId = inp.dataset.group;
        const week = inp.dataset.week;
        const val = parseFloat(inp.value);
        if (!state.weeklyPlan.overrides[groupId]) state.weeklyPlan.overrides[groupId] = {};
        state.weeklyPlan.overrides[groupId][week] = isNaN(val) ? null : val;
        saveState();
        toast('Weekly estimate updated');
      });
    });
    document.querySelectorAll('.reason-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const devId = inp.dataset.reasonDev;
        const week = inp.dataset.reasonWeek;
        if (!state.weeklyPlan.reasons[devId]) state.weeklyPlan.reasons[devId] = {};
        state.weeklyPlan.reasons[devId][week] = inp.value.trim();
        saveState();
        toast('Reason saved');
      });
    });

    const adminSettingsForm = document.getElementById('adminSettingsForm');
    if (adminSettingsForm) adminSettingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.settings.standupTime = document.getElementById('s_standup').value || state.settings.standupTime;
      state.settings.eodTime = document.getElementById('s_eod').value || state.settings.eodTime;
      state.settings.notifyTime = document.getElementById('s_notify').value || state.settings.notifyTime;
      state.settings.dailyEstimateHours = parseFloat(document.getElementById('s_dailyHours').value) || state.settings.dailyEstimateHours;
      saveState();
      toast('Settings saved for the whole team');
      if (ui.view === 'dashboard') setView('dashboard');
    });

    const releaseForm = document.getElementById('releaseForm');
    if (releaseForm) releaseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('rel_name').value.trim();
      if (!name) return;
      state.releases.push({
        id: uid('rel'), name,
        startDate: document.getElementById('rel_start').value || null,
        endDate: document.getElementById('rel_end').value || null,
        isDefault: false,
      });
      saveState();
      toast(`${name} added`);
      render();
    });
    document.querySelectorAll('.deleteReleaseBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rel = releaseById(btn.dataset.id);
        if (!rel) return;
        const count = state.tickets.filter(t => t.releaseId === rel.id).length;
        if (!confirm(`Delete "${rel.name}"?${count ? ` ${count} ticket(s) will move to the default release.` : ''}`)) return;
        const fallback = state.releases.find(r => r.isDefault) || state.releases[0];
        state.tickets.forEach(t => { if (t.releaseId === rel.id) t.releaseId = fallback.id; });
        state.epics.forEach(ep => { if (ep.releaseId === rel.id) ep.releaseId = fallback.id; });
        state.releases = state.releases.filter(r => r.id !== rel.id);
        if (ui.releaseId === rel.id) ui.releaseId = '';
        saveState();
        toast(`${rel.name} deleted`);
        render();
      });
    });
  }

  /* ---------------- Global nav + search ---------------- */
  document.getElementById('nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.rail__link[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    ui.search = e.target.value;
    if (ui.view === 'board' || ui.view === 'tickets') render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      if (!ticketModalOverlay.hidden) closeTicketModal();
      if (!logModalOverlay.hidden) closeLogModal();
    }
  });

  /* ---------------- PWA install + service worker ---------------- */
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').hidden = false;
  });
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { document.getElementById('installBtn').hidden = true; });

  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
    });
  }

  /* ---------------- Log-time reminder notification (best-effort) ---------------- */
  // Fires a browser notification once per day at state.settings.notifyTime if the
  // current user hasn't logged any hours yet today. Only works while this tab/app
  // is open (or backgrounded, depending on the browser) — a guaranteed alert even
  // when the app is fully closed would need a server-side push (e.g. FCM), which
  // is a separate, bigger addition.
  function startReminderScheduler(){
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default'){
      // Ask once, quietly — don't block boot on the result.
      Notification.requestPermission().catch(() => {});
    }
    setInterval(() => {
      if (Notification.permission !== 'granted') return;
      const me = currentUser();
      if (!me) return;
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      if (hhmm !== state.settings.notifyTime) return;
      const flagKey = `pulse_notified_${todayISO()}_${me.id}`;
      if (localStorage.getItem(flagKey)) return;
      const loggedToday = state.timeLogs.some(l => l.devId === me.id && l.date === todayISO());
      if (loggedToday) return;
      new Notification('Pulse — log your time', {
        body: `Hey ${me.name}, you haven't logged any hours today yet.`,
        icon: 'icons/icon-192.png',
      });
      localStorage.setItem(flagKey, '1');
    }, 30000); // check every 30s; cheap and keeps the minute match simple
  }

  /* ---------------- Boot ---------------- */
  function setSyncStatus(mode, text){
    const el = document.getElementById('syncStatus');
    const textEl = document.getElementById('syncStatusText');
    el.className = 'sync-status is-' + mode;
    textEl.textContent = text;
  }

  async function boot(){
    const sync = window.PulseSync;
    if (sync && sync.enabled){
      setSyncStatus('local', 'Connecting…');
      try{
        const remote = await sync.fetchInitial();
        if (remote){
          state = migrateState(remote);
        } else {
          // First developer to connect seeds the shared board.
          sync.push(state);
        }
        setSyncStatus('live', 'Synced — shared board');
        sync.onRemoteChange((remoteState) => {
          state = migrateState(remoteState);
          render();
        });
      }catch(err){
        console.error(err);
        setSyncStatus('error', 'Sync error — working locally');
      }
    } else {
      setSyncStatus('local', 'Local only — not shared');
    }
    saveState();

    // If already signed in with Google from a previous visit, resolve identity
    // automatically instead of asking again.
    if (window.PulseAuth && window.PulseAuth.enabled){
      try{
        const googleUser = await new Promise((resolve) => {
          const unsub = window.PulseAuth.onAuthChange((u) => { unsub(); resolve(u); });
        });
        if (googleUser){
          const dev = resolveDevByEmail(googleUser.email, googleUser.name, googleUser.photoURL);
          localStorage.setItem(IDENTITY_KEY, dev.id);
          usingGoogleAuth = true;
        }
      }catch(err){ console.error('Pulse: Google auth check failed.', err); }
    }

    if (!currentUser()){
      openIdentityModal(false);
    } else {
      setView('dashboard');
    }
    startReminderScheduler();

    // Zero-setup way to test "shared board" behavior: any other tab open on
    // this same origin picks up localStorage changes instantly, no Firebase
    // required. (Firebase sync above still takes over across devices/browsers.)
    window.addEventListener('storage', (e) => {
      if (e.key !== STORE_KEY || !e.newValue) return;
      try{
        state = migrateState(JSON.parse(e.newValue));
        render();
      }catch(err){ console.error('Pulse: could not read update from another tab.', err); }
    });
  }

  boot();
})();
