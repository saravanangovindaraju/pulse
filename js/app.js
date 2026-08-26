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
      const w = (n) => addDaysISO(start, n*7);
      s.releases.push({
        id: uid('rel'), name: 'Sprint 24.1', startDate: start, endDate: addDaysISO(start, 27), isDefault: true,
        releasePlan: {
          summary: { totalEpics: 5, backlogBugs: 311, totalProfiles: 82 },
          weeks: [
            { id: uid('rw'), week: '#1', from: w(0), to: addDaysISO(w(0),4), task: '20 Profiles' },
            { id: uid('rw'), week: '#2', from: w(1), to: addDaysISO(w(1),4), task: '20 Profiles + Internal bug fixes' },
            { id: uid('rw'), week: '#3', from: w(2), to: addDaysISO(w(2),4), task: '20 Profiles + Internal bug fixes' },
            { id: uid('rw'), week: '#4', from: w(3), to: addDaysISO(w(3),4), task: '22 Profiles + Internal bug fixes' },
          ],
          deliverablesLabel: 'End of sprint deliverables',
          deliverables: ['5 Epics', '100 Backlog Bugs', '82 Profile Migration'],
        },
      });
    }
    s.releases.forEach(r => {
      if (!r.releasePlan){
        r.releasePlan = {
          summary: { totalEpics: null, backlogBugs: null, totalProfiles: null },
          weeks: [],
          deliverablesLabel: '',
          deliverables: [],
        };
      }
    });
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
      t.scenarios.forEach(sc => {
        if (sc.type === 'test'){
          if (sc.tester === undefined) sc.tester = null;
          if (!sc.result) sc.result = 'not-run';
        }
      });
      if (t.status === 'review') t.status = 'in-progress'; // "In review" column was retired
      if (t.type === 'change-request') t.type = 'task'; // Change Request type was retired
      if (!Array.isArray(t.dependsOn)) t.dependsOn = [];
      if (!t.releaseId) t.releaseId = defaultReleaseId;
      if (t.plannedWeekStart === undefined) t.plannedWeekStart = null;
      if (t.component === undefined) t.component = '';
      if (t.themeCustomer === undefined) t.themeCustomer = '';
      if (t.remarks === undefined) t.remarks = '';
      if (t.allocationPct === undefined || t.allocationPct === null) t.allocationPct = 100;
      if (t.plannedStartDate === undefined) t.plannedStartDate = null;
      if (t.plannedEndDate === undefined) t.plannedEndDate = null;
      if (t.actualStartDate === undefined) t.actualStartDate = null;
      if (t.actualEndDate === undefined) t.actualEndDate = null;
    });
    s.epics.forEach(e => { if (!e.releaseId) e.releaseId = defaultReleaseId; });
    if (!s.weeklyPlan) s.weeklyPlan = {};
    if (!s.weeklyPlan.overrides) s.weeklyPlan.overrides = {}; // { [groupId]: { [weekStartISO]: hours } }
    if (!s.weeklyPlan.reasons) s.weeklyPlan.reasons = {};     // { [devId]: { [weekStartISO]: "reason text" } }
    if (!s.deploymentGuide || !Array.isArray(s.deploymentGuide.sections)){
      s.deploymentGuide = DEFAULT_DEPLOY_GUIDE();
    } else if (!s.deploymentGuide.updatedAt && (s.deploymentGuide.version||1) < DEPLOY_GUIDE_VERSION){
      // Nobody has customized it yet, so it's safe to refresh to the latest default content.
      s.deploymentGuide = DEFAULT_DEPLOY_GUIDE();
    }
    return s;
  }

  const DEPLOY_GUIDE_VERSION = 2;

  function DEFAULT_DEPLOY_GUIDE(){
    return {
      version: DEPLOY_GUIDE_VERSION,
      updatedAt: null,
      updatedBy: null,
      sections: [
        {
          id: uid('sec'),
          title: '1. Merge to the release library',
          body: 'After committing to your own branch → merge to the release library (e.g. uxmgrcco-library).\n\nNote: Bamboo build (one for Quality, one for the actual build) runs automatically as soon as the merge completes.',
        },
        {
          id: uid('sec'),
          title: '2. Find the build number in Bitbucket / Bamboo',
          body: 'Select the corresponding repo in Bitbucket (if changes were merged to uxmgrcco-library, select that repo).\nhttps://pln-stash.calix.local/projects/CCS\n\n![Selecting the repository in Bitbucket](assets/deploy-guide/01-select-repo.png)\n\nClick the Builds option.\n\n![Builds tab showing recent build results](assets/deploy-guide/02-builds-tab.png)\n\nSelect the corresponding branch from the "Branch, tag, or commit" dropdown.\n\n![Branch dropdown, e.g. release/26.3](assets/deploy-guide/03-branch-dropdown.png)\n\nSelect the build to get the build number.\n\n![Selecting a specific build](assets/deploy-guide/04-select-build.png)\n\nThis opens the Bamboo Build Result summary — the build number is in the Comments.\n\n![Build number shown in the Bamboo build comments](assets/deploy-guide/05-build-number-comment.png)',
        },
        {
          id: uid('sec'),
          title: '3. Update uxmgr-web with the new library build number',
          body: 'Create a branch from release/uxmgr-web to update this library\'s build number in uxmgr-web for the corresponding release/* branch.\n\nFiles to update with the new build number:\n\na. package.json\n\n![package.json dependency line updated with the new library build number](assets/deploy-guide/06-package-json.png)\n\nb. Dockerfile\n\n![Dockerfile line updated with the new library build number](assets/deploy-guide/07-dockerfile.png)\n\nRaise a PR to merge this change into release/uxmgr-web.\nBamboo build runs automatically as soon as it\'s merged and gives you a new build number.\n\n![Successful release build showing the new build number](assets/deploy-guide/08-release-build-success.png)',
        },
        {
          id: uid('sec'),
          title: '4. Promote with Aryabhata',
          body: 'Once uxmgr-web has built successfully, promote release/hotfix branches using the Aryabhata bot:\n\n@Aryabhata promote <uxmgr-web:build number> to perf\n\nExample:\n@Aryabhata promote uxmgr-web:1.0.0-357rbwb17.de55a36 to perf\n\nNote: Bamboo is configured to auto-build on all of these branches:\n1. feature/*\n2. develop\n3. release/*\n4. hotfix/*',
        },
        {
          id: uid('sec'),
          title: '5. Artifact storage',
          body: 'Bamboo-generated artifacts are stored in GAR (Google Artifact Registry).\n\nOnly the develop branch is stored by default — other branches build and deploy without being retained in GAR unless promoted.',
        },
        {
          id: uid('sec'),
          title: '6. Feature branches',
          body: 'Raise a GitOps PR to deploy a feature branch.',
        },
        {
          id: uid('sec'),
          title: '7. ArgoCD access & deployment',
          body: 'Raise a CPLE ticket for ArgoCD access.\nhttps://argocd.internal.mgmt.xilac.net\n\nAny branch\'s artifact can be deployed to any environment.\nSupports 4 environments: DEV, TEST, PERF, PROD.',
        },
        {
          id: uid('sec'),
          title: '8. Environment permissions',
          body: 'DEV, TEST, PERF: no permission needed — deploy freely.\n\nPROD: deploy through COS-D with MOP — approval needed.',
        },
      ],
    };
  }

  let state = migrateState(loadState());
  let ui = {
    view: 'dashboard',
    search: '',
    boardAssigneeFilter: '',
    tableFilters: { type: '', status: '', assignee: '' },
    reportPeriod: 'weekly',
    deployEditing: false,
    releasePlanEditing: false,
    adminTab: 'dashboard',
    adminResourceFilter: '',
    releaseId: '', // '' = all releases
    testingFilters: { tester: '', result: '' },
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
    const mkScenario = (type, title, description, tester, result) =>
      ({ id: uid('sc'), type, title, description, tester: tester || null, result: type === 'test' ? (result || 'not-run') : undefined });

    const tickets = [
      {
        id: uid('t'), ticketNumber: 'CCS-123', title: 'Build resource feedback capture form',
        type: 'story', status: 'in-progress', assignee: 'dev_mohan', priority: 'high',
        estimate: 8, storyPoints: 5, epicId: epics[0].id, dependsOn: [], blockerNote: '',
        description: 'Capture per-developer feedback at EOD for the next-day dev plan.',
        subtasks: mkSubtasks(1),
        scenarios: [
          mkScenario('flow', 'Dev submits EOD feedback', 'Dev opens form at EOD → selects blockers/mood → submits → entry appears on next-day dev plan.'),
          mkScenario('test', 'Empty submission is blocked', 'Given the form is open, when no fields are filled, then submit is disabled and a validation hint shows.', 'dev_rajeshari', 'pass'),
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
          mkScenario('test', 'Export totals match sheet after justification', 'Given a justified overtime row, when export runs, then the exported total matches the sheet total.', 'dev_rajeshari', 'fail'),
          mkScenario('test', 'Unjustified overtime is excluded from export', 'Given overtime with no justification note, when export runs, then that row is excluded from totals.', 'dev_rajeshari', 'not-run'),
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

    // demo data for the Admin Delivery Tracker view (CNAP-style)
    tickets[0].component = 'Feedback UI';
    tickets[0].themeCustomer = 'Customer Experience';
    tickets[0].allocationPct = 100;
    tickets[0].plannedStartDate = lastMonday;
    tickets[0].plannedEndDate = addDaysISO(lastMonday, 4);
    tickets[0].actualStartDate = lastMonday;
    tickets[0].actualEndDate = null; // still in progress

    tickets[1].component = 'Export Service';
    tickets[1].themeCustomer = 'Billing Ops';
    tickets[1].allocationPct = 50;
    tickets[1].remarks = 'Blocked on CCS-123 sign-off';
    tickets[1].plannedStartDate = lastMonday;
    tickets[1].plannedEndDate = addDaysISO(lastMonday, 4);

    tickets[2].component = 'Notifications';
    tickets[2].themeCustomer = 'Customer Experience';
    tickets[2].allocationPct = 60;
    tickets[2].plannedStartDate = thisMonday;
    tickets[2].plannedEndDate = addDaysISO(thisMonday, 4);

    tickets[3].component = 'QA Automation';
    tickets[3].themeCustomer = 'Internal';
    tickets[3].allocationPct = 100;
    tickets[3].plannedStartDate = todayISO(-3);
    tickets[3].plannedEndDate = todayISO(-1);
    tickets[3].actualStartDate = todayISO(-4);
    tickets[3].actualEndDate = todayISO(-1);

    tickets[4].component = 'Reporting';
    tickets[4].themeCustomer = 'Billing Ops';
    tickets[4].allocationPct = 100;
    tickets[4].plannedStartDate = todayISO(-6);
    tickets[4].plannedEndDate = todayISO(-2);
    tickets[4].actualStartDate = todayISO(-6);
    tickets[4].actualEndDate = todayISO(-3);

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

  /* ---------------- Delivery Tracker (CNAP-style) derived fields ---------------- */
  function daysBetweenISO(a, b){
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function ticketPlannedDays(t){
    const dailyHrs = state.settings.dailyEstimateHours || 8;
    return dailyHrs ? +((Number(t.estimate)||0) / dailyHrs).toFixed(1) : 0;
  }
  function ticketActualDays(t){
    const dailyHrs = state.settings.dailyEstimateHours || 8;
    return dailyHrs ? +(actualHours(t.id) / dailyHrs).toFixed(1) : 0;
  }
  function scheduleSlipDays(t){
    if (!t.plannedEndDate || !t.actualEndDate) return null;
    return daysBetweenISO(t.plannedEndDate, t.actualEndDate);
  }
  function effortVarianceDays(t){
    return +(ticketActualDays(t) - ticketPlannedDays(t)).toFixed(1);
  }
  /** Mirrors the CNAP tracker's Status column, derived from planned vs. actual dates. */
  function trackerStatus(t){
    const today = todayISO();
    if (t.status === 'done' || t.actualEndDate){
      if (!t.plannedEndDate || !t.actualEndDate) return 'Completed';
      const slip = scheduleSlipDays(t);
      if (slip > 0) return 'Completed late';
      if (slip < 0) return 'Completed early';
      return 'Completed on time';
    }
    if (t.actualStartDate){
      if (!t.plannedStartDate) return 'On track';
      const diff = daysBetweenISO(t.plannedStartDate, t.actualStartDate);
      if (diff > 0) return 'Started late';
      if (diff < 0) return 'Started early';
      return 'On track';
    }
    if (t.plannedStartDate && t.plannedStartDate < today) return 'Not started - overdue';
    return 'To be started';
  }
  const TRACKER_STATUS_CLASS = {
    'To be started': 'tobestarted', 'On track': 'ontrack', 'Started early': 'startedearly',
    'Started late': 'startedlate', 'Completed on time': 'completedontime', 'Completed early': 'completedearly',
    'Completed late': 'completedlate', 'Not started - overdue': 'notstartedoverdue', 'Completed': 'completed',
  };
  const TRACKER_CATEGORY_LABEL = { story: 'Stories', task: 'Tasks', bug: 'Defects', enhancement: 'Hardening' };
  /** True when this ticket's assignee is over-allocated across overlapping planned date ranges. */
  function hasConflictWarning(t){
    if (!t.assignee || !t.plannedStartDate || !t.plannedEndDate) return false;
    const overlapping = state.tickets.filter(o =>
      o.id !== t.id && o.assignee === t.assignee && o.plannedStartDate && o.plannedEndDate &&
      !(o.plannedEndDate < t.plannedStartDate || o.plannedStartDate > t.plannedEndDate)
    );
    const total = (Number(t.allocationPct)||0) + overlapping.reduce((s,o) => s + (Number(o.allocationPct)||0), 0);
    return total > 100;
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

  /** A radial percentage "donut" chart, drawn as plain SVG (no chart library). */
  function donutSVG(pct, color, size = 64){
    const r = size * 0.42;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const offset = c * (1 - clamped / 100);
    const mid = size / 2;
    const overflow = pct > 100;
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-chart">
        <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--surface-raised)" stroke-width="${size*0.125}"/>
        <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${size*0.125}"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          stroke-linecap="round" transform="rotate(-90 ${mid} ${mid})"/>
        <text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central"
          font-family="var(--font-display)" font-weight="700" font-size="${size*0.22}" fill="var(--text)">${Math.round(pct)}%${overflow ? '+' : ''}</text>
      </svg>`;
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
    testing: ['Testing', 'Test cases and results by epic and story'],
    team: ['Team', 'Workload and delivery by developer'],
    deploy: ['Deploy Guide', 'Build & deployment steps the whole team should know'],
    admin: ['Admin', 'Team-wide activity, filterable by resource'],
  };

  const SEARCH_VISIBLE_VIEWS = ['board', 'tickets', 'dependencies'];
  const RELEASE_VISIBLE_VIEWS = ['epics', 'board', 'tickets', 'dependencies', 'timesheet', 'testing', 'team'];

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
    else if (ui.view === 'testing') root.innerHTML = renderTesting();
    else if (ui.view === 'team'){
      const me = currentUser();
      root.innerHTML = renderTeam(me && me.isAdmin ? undefined : visibleDevIds());
    }
    else if (ui.view === 'deploy') root.innerHTML = renderDeployGuide();
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

  /* ---------------- Testing ---------------- */
  function allVisibleTestCases(){
    return scopedTickets().flatMap(t =>
      (t.scenarios||[]).filter(sc => sc.type === 'test').map(sc => ({ ...sc, ticket: t }))
    );
  }

  function renderTesting(){
    let cases = allVisibleTestCases();
    const { tester, result } = ui.testingFilters;
    if (tester) cases = cases.filter(c => c.tester === tester);
    if (result) cases = cases.filter(c => (c.result||'not-run') === result);

    const all = allVisibleTestCases();
    const counts = { total: all.length, pass: 0, fail: 0, blocked: 0, 'not-run': 0 };
    all.forEach(c => { counts[c.result||'not-run'] = (counts[c.result||'not-run']||0) + 1; });

    const visibleDevs = state.developers.filter(d => visibleDevIds().includes(d.id));

    cases.sort((a,b) => a.ticket.ticketNumber.localeCompare(b.ticket.ticketNumber, undefined, { numeric: true }));

    return `
      <div class="stat-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="stat-card" style="--accent:var(--slate)">
          <div class="stat-card__label">Total test cases</div>
          <div class="stat-card__value">${counts.total}</div>
        </div>
        <div class="stat-card" style="--accent:var(--teal)">
          <div class="stat-card__label">Pass</div>
          <div class="stat-card__value">${counts.pass}</div>
        </div>
        <div class="stat-card" style="--accent:var(--red)">
          <div class="stat-card__label">Fail</div>
          <div class="stat-card__value">${counts.fail}</div>
        </div>
        <div class="stat-card" style="--accent:var(--amber)">
          <div class="stat-card__label">Blocked</div>
          <div class="stat-card__value">${counts.blocked}</div>
        </div>
        <div class="stat-card" style="--accent:var(--slate)">
          <div class="stat-card__label">Not run</div>
          <div class="stat-card__value">${counts['not-run']}</div>
        </div>
      </div>

      <div class="table-toolbar">
        <select class="select-chip" id="testingTesterFilter">
          <option value="">All testers</option>
          ${visibleDevs.map(d => `<option value="${d.id}" ${tester===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}
        </select>
        <select class="select-chip" id="testingResultFilter">
          <option value="">All results</option>
          ${Object.entries(TEST_RESULT_LABEL).map(([v,l]) => `<option value="${v}" ${result===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Epic</th><th>Ticket</th><th>Test case</th><th>Tester</th><th>Result</th></tr>
          </thead>
          <tbody>
            ${cases.length ? cases.map(c => {
              const epic = c.ticket.epicId ? epicById(c.ticket.epicId) : null;
              const devTester = c.tester ? devById(c.tester) : null;
              return `
              <tr data-id="${c.ticket.id}">
                <td>${epic ? `<span class="epic-tag">${escapeHTML(epic.epicNumber)}</span>` : '<span class="dep-chip">—</span>'}</td>
                <td class="mono">${escapeHTML(c.ticket.ticketNumber)}</td>
                <td class="cell-title">${escapeHTML(c.title || '(untitled test case)')}</td>
                <td onclick="event.stopPropagation()">
                  <select class="tester-inline-select" data-test-tester="${c.ticket.id}" data-test-id="${c.id}">
                    <option value="">— Unassigned —</option>
                    ${visibleDevs.map(d => `<option value="${d.id}" ${c.tester===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}
                  </select>
                </td>
                <td onclick="event.stopPropagation()">
                  <select class="status-inline-select badge--result-${c.result||'not-run'}" data-test-result="${c.ticket.id}" data-test-id="${c.id}">
                    ${Object.entries(TEST_RESULT_LABEL).map(([v,l]) => `<option value="${v}" ${((c.result)||'not-run')===v?'selected':''}>${l}</option>`).join('')}
                  </select>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="5"><div class="empty"><p>No test cases yet. Add one from a ticket's Flows / use cases / test scenarios section.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ---------------- Deploy Guide ---------------- */
  function canEditDeployGuide(){ return isCurrentUserAdmin() || isCurrentUserTeamLead(); }

  function linkify(text){
    return escapeHTML(text).replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  /** Renders guide body text: preserves line breaks, auto-linkifies URLs, and turns
   *  ![alt](path) into an inline figure — a tiny markdown-image subset, no library needed. */
  function renderGuideBody(text){
    const parts = text.split(/(!\[[^\]]*\]\([^)]+\))/g);
    return parts.map(part => {
      const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch){
        const [, alt, src] = imgMatch;
        return `<figure class="guide-image"><img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="lazy">${alt ? `<figcaption>${escapeHTML(alt)}</figcaption>` : ''}</figure>`;
      }
      return linkify(part).replace(/\n/g, '<br>');
    }).join('');
  }

  function renderDeployGuide(){
    const guide = state.deploymentGuide;
    const canEdit = canEditDeployGuide();

    if (ui.deployEditing && canEdit){
      return `
        <div class="table-toolbar" style="justify-content:space-between;margin-bottom:16px">
          <span class="hint">Editing — visible to the whole team once saved</span>
          <div style="display:flex;gap:10px">
            <button class="btn btn--ghost btn--sm" id="addDeploySectionBtn">
              <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              Add section
            </button>
            <button class="btn btn--ghost btn--sm" id="cancelDeployEditBtn">Cancel</button>
            <button class="btn btn--primary btn--sm" id="saveDeployGuideBtn">Save guide</button>
          </div>
        </div>
        <div id="deploySectionsEdit">
          ${deployDraftSections.map((sec, i) => `
            <div class="panel" style="margin-bottom:14px" data-deploy-section="${sec.id}">
              <div class="form-row" style="margin-bottom:10px">
                <div class="field" style="margin-bottom:0">
                  <label>Section title</label>
                  <input type="text" class="deploy-section-title" data-sec-title="${sec.id}" value="${escapeHTML(sec.title)}" placeholder="e.g. Branching strategy">
                </div>
                <div style="display:flex;align-items:flex-end;justify-content:flex-end;margin-bottom:0">
                  <button type="button" class="btn btn--ghost btn--danger btn--sm" data-sec-remove="${sec.id}">Remove section</button>
                </div>
              </div>
              <div class="field" style="margin-bottom:0">
                <label>Content</label>
                <textarea class="deploy-section-body" data-sec-body="${sec.id}" rows="6" placeholder="Plain text — line breaks are preserved, URLs become clickable links automatically. Add a screenshot with: ![caption](assets/deploy-guide/your-image.png)">${escapeHTML(sec.body)}</textarea>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="table-toolbar" style="justify-content:flex-end;margin-bottom:16px">
        ${canEdit ? `<button class="btn btn--primary btn--sm" id="editDeployGuideBtn">
          <svg viewBox="0 0 20 20" fill="none"><path d="M12.5 3.5 16 7l-9 9-4 1 1-4 8.5-8.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          Edit guide
        </button>` : ''}
      </div>
      ${guide.sections.map(sec => `
        <div class="panel" style="margin-bottom:14px">
          <div class="panel__head"><h3>${escapeHTML(sec.title)}</h3></div>
          <div class="deploy-section-body-text">${renderGuideBody(sec.body)}</div>
        </div>
      `).join('')}
      ${guide.updatedAt ? `<p class="field__hint">Last updated ${fmtDate(guide.updatedAt.slice(0,10))}${guide.updatedBy && devById(guide.updatedBy) ? ' by ' + escapeHTML(devById(guide.updatedBy).name) : ''}.</p>` : ''}
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
    const weekEnd = addDaysISO(weekStart, 4); // Friday — work week is Mon-Fri
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

  /** A multi-segment donut (e.g. pace distribution across a team), plain SVG, no chart library. */
  function multiDonutSVG(segments, size = 96){
    const r = size * 0.38;
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const total = segments.reduce((s,x) => s + x.value, 0) || 1;
    let cumulative = 0;
    const arcs = segments.filter(seg => seg.value > 0).map(seg => {
      const frac = seg.value / total;
      const dash = frac * c;
      const gap = c - dash;
      const offset = -cumulative * c;
      cumulative += frac;
      return `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${size*0.16}"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 ${mid} ${mid})"/>`;
    }).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-chart">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--surface-raised)" stroke-width="${size*0.16}"/>
      ${arcs}
    </svg>`;
  }

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

    const paceColor = (status) => status === 'ahead' ? 'var(--teal)' : status === 'behind' ? 'var(--red)' : 'var(--amber)';
    const paceCounts = { ahead: 0, 'on-track': 0, behind: 0 };
    devs.forEach(d => { paceCounts[devAnalytics(d, period.days).status]++; });

    const chartsSection = devs.length ? `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel__head">
          <h3>Utilization at a glance</h3>
          <span class="hint">${period.label} view</span>
        </div>
        <div class="util-summary-donut" style="margin-bottom:18px">
          ${multiDonutSVG([
            { value: paceCounts.ahead, color: 'var(--teal)' },
            { value: paceCounts['on-track'], color: 'var(--amber)' },
            { value: paceCounts.behind, color: 'var(--red)' },
          ], 100)}
          <div class="util-summary-donut__legend">
            <div class="util-summary-donut__legend-item"><i style="background:var(--teal)"></i>Ahead <span class="util-summary-donut__legend-num">${paceCounts.ahead}</span></div>
            <div class="util-summary-donut__legend-item"><i style="background:var(--amber)"></i>On track <span class="util-summary-donut__legend-num">${paceCounts['on-track']}</span></div>
            <div class="util-summary-donut__legend-item"><i style="background:var(--red)"></i>Behind <span class="util-summary-donut__legend-num">${paceCounts.behind}</span></div>
          </div>
        </div>
        <div class="util-chart-grid">
          ${devs.map(dev => {
            const a = devAnalytics(dev, period.days);
            const color = paceColor(a.status);
            return `
            <div class="util-chart-card">
              <div class="util-chart-card__name">${avatarHTML(dev.id)} <span class="util-chart-card__name-text">${escapeHTML(dev.name)}</span></div>
              ${donutSVG(a.utilizationPct, color, 76)}
              <div class="util-chart-card__stats">
                <div><div class="util-chart-card__stat-num">${a.loggedTotal}h</div><div class="util-chart-card__stat-label">Logged</div></div>
                <div><div class="util-chart-card__stat-num">${a.estimateTotal}h</div><div class="util-chart-card__stat-label">Estimate</div></div>
              </div>
              <span class="util-chart-card__pace" style="color:${color}">${RAG_LABEL[a.status]}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : '';

    return `
      ${chartsSection}
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
    { id: 'tracker',      label: 'Delivery Tracker' },
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
    else if (ui.adminTab === 'tracker') body = renderDeliveryTracker();
    else if (ui.adminTab === 'releases' && admin) body = renderAdminReleases();

    return `
      <div class="table-toolbar" style="justify-content:space-between;margin-bottom:18px">
        ${ui.adminTab !== 'settings' && ui.adminTab !== 'releases' ? `<select class="select-chip" id="adminResourceFilter">${filterOptions}</select>` : '<span></span>'}
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
    const weekEnd = addDaysISO(weekStart, 4); // Friday — work week is Mon-Fri
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
    const weekEnd = addDaysISO(weekStart, 4); // Friday — work week is Mon-Fri
    return state.timeLogs
      .filter(l => l.devId === devId && l.date >= weekStart && l.date <= weekEnd)
      .reduce((s,l) => s + Number(l.hours||0), 0);
  }

  function renderReleasePlanSection(rel){
    const canEdit = isCurrentUserAdmin() || isCurrentUserTeamLead();
    const plan = rel.releasePlan;

    if (ui.releasePlanEditing && canEdit){
      const d = releasePlanDraft;
      return `
        <div class="panel" style="margin-bottom:16px">
          <div class="panel__head">
            <h3>Release plan — ${escapeHTML(rel.name)}</h3>
            <div style="display:flex;gap:10px">
              <button class="btn btn--ghost btn--sm" id="cancelReleasePlanBtn">Cancel</button>
              <button class="btn btn--primary btn--sm" id="saveReleasePlanBtn">Save release plan</button>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="rp_epics">Total epics</label>
              <input type="number" id="rp_epics" min="0" value="${d.summary.totalEpics ?? ''}">
            </div>
            <div class="field">
              <label for="rp_bugs">Backlog bugs</label>
              <input type="number" id="rp_bugs" min="0" value="${d.summary.backlogBugs ?? ''}">
            </div>
          </div>
          <div class="field">
            <label for="rp_profiles">Total profiles (or any other custom count your team tracks)</label>
            <input type="number" id="rp_profiles" min="0" value="${d.summary.totalProfiles ?? ''}">
          </div>

          <div class="field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <label style="margin:0">Weekly plan</label>
              <button type="button" class="btn btn--ghost btn--sm" id="addPlanWeekBtn">+ Add week</button>
            </div>
            <div id="planWeeksEdit">
              ${d.weeks.map(w => `
                <div class="plan-week-edit-row" data-week-id="${w.id}">
                  <input type="text" class="plan-week-input" data-week-field="week" data-week-id="${w.id}" value="${escapeHTML(w.week)}" placeholder="#1">
                  <input type="date" class="plan-week-input" data-week-field="from" data-week-id="${w.id}" value="${w.from||''}">
                  <input type="date" class="plan-week-input" data-week-field="to" data-week-id="${w.id}" value="${w.to||''}">
                  <input type="text" class="plan-week-input plan-week-input--task" data-week-field="task" data-week-id="${w.id}" value="${escapeHTML(w.task)}" placeholder="e.g. 20 Profiles + Internal bug fixes">
                  <button type="button" class="icon-btn" data-week-remove="${w.id}" aria-label="Remove week">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  </button>
                </div>
              `).join('') || `<p class="field__hint" style="margin:0">No weeks yet — add one above.</p>`}
            </div>
          </div>

          <div class="field">
            <label for="rp_delLabel">Deliverables heading</label>
            <input type="text" id="rp_delLabel" value="${escapeHTML(d.deliverablesLabel)}" placeholder="e.g. 10th Sep Deliverables">
          </div>
          <div class="field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <label style="margin:0">Deliverable items</label>
              <button type="button" class="btn btn--ghost btn--sm" id="addPlanDeliverableBtn">+ Add item</button>
            </div>
            <div id="planDeliverablesEdit">
              ${d.deliverables.map((item, i) => `
                <div class="plan-deliverable-edit-row" data-del-index="${i}">
                  <input type="text" class="plan-deliverable-input" data-del-index="${i}" value="${escapeHTML(item)}" placeholder="e.g. 5 Epics">
                  <button type="button" class="icon-btn" data-del-remove="${i}" aria-label="Remove item">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  </button>
                </div>
              `).join('') || `<p class="field__hint" style="margin:0">No deliverables listed yet.</p>`}
            </div>
          </div>
        </div>
      `;
    }

    const hasContent = plan.summary.totalEpics != null || plan.summary.backlogBugs != null || plan.summary.totalProfiles != null
      || plan.weeks.length || plan.deliverables.length;

    return `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel__head">
          <h3>Release plan — ${escapeHTML(rel.name)}</h3>
          ${canEdit ? `<button class="btn btn--ghost btn--sm" id="editReleasePlanBtn">
            <svg viewBox="0 0 20 20" fill="none"><path d="M12.5 3.5 16 7l-9 9-4 1 1-4 8.5-8.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            Edit release plan
          </button>` : ''}
        </div>
        ${!hasContent ? `<div class="empty"><p>No release plan added yet.${canEdit ? ' Click "Edit release plan" to add one.' : ''}</p></div>` : `
          ${(plan.summary.totalEpics != null || plan.summary.backlogBugs != null || plan.summary.totalProfiles != null) ? `
            <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
              <div class="stat-card" style="--accent:var(--blue)"><div class="stat-card__label">Total epics</div><div class="stat-card__value">${plan.summary.totalEpics ?? '—'}</div></div>
              <div class="stat-card" style="--accent:var(--red)"><div class="stat-card__label">Backlog bugs</div><div class="stat-card__value">${plan.summary.backlogBugs ?? '—'}</div></div>
              <div class="stat-card" style="--accent:var(--violet)"><div class="stat-card__label">Total profiles</div><div class="stat-card__value">${plan.summary.totalProfiles ?? '—'}</div></div>
            </div>
          ` : ''}
          ${plan.weeks.length ? `
            <div class="table-wrap" style="margin-bottom:18px">
              <table class="data-table">
                <thead><tr><th>Week</th><th>From</th><th>To</th><th>Task</th></tr></thead>
                <tbody>
                  ${plan.weeks.map(w => `
                    <tr>
                      <td class="mono">${escapeHTML(w.week)}</td>
                      <td class="mono">${w.from ? shortDate(w.from) : '—'}</td>
                      <td class="mono">${w.to ? shortDate(w.to) : '—'}</td>
                      <td>${escapeHTML(w.task)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
          ${plan.deliverables.length ? `
            <div class="deliverables-block">
              ${plan.deliverablesLabel ? `<div class="deliverables-block__label">${escapeHTML(plan.deliverablesLabel)}</div>` : ''}
              <ul class="deliverables-block__list">
                ${plan.deliverables.map(item => `<li>${escapeHTML(item)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        `}
      </div>
    `;
  }

  function renderAdminPlan(){
    const rel = currentRelease();
    if (!rel){
      return `<div class="empty"><p>Create a release from the Releases tab first.</p></div>`;
    }

    const releasePlan = renderReleasePlanSection(rel);

    if (!rel.startDate || !rel.endDate){
      return releasePlan + `<div class="empty"><p>Add start and end dates to "${escapeHTML(rel.name)}" in the Releases tab to also see the auto-computed weekly delivery tables here.</p></div>`;
    }
    const weeks = weeksInRange(rel.startDate, rel.endDate);
    if (!weeks.length) return releasePlan + `<div class="empty"><p>This release's date range doesn't span a full week yet.</p></div>`;

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
                const canEdit = isCurrentUserTeamLead() && myGroupId === g.id;
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
                        : `<span class="mono" title="${hasOverride ? 'Manually adjusted by the team lead' : 'Auto-summed from ticket estimates'}">${est}h</span>`}
                    </div>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p class="field__hint" style="margin-top:10px">"Delivered" sums logged hours that week. The estimate auto-sums ticket estimates planned for that week (via each ticket's "Planned week" field) — each team's Team Lead can type over their own team's number to set a manual target; admins see it read-only.</p>
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

    return `
      <div id="planPanel">
        ${releasePlan}
        <div class="table-toolbar" style="justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn--ghost btn--sm" id="planExportCsvBtn">
            <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10m0 0-3.5-3.5M10 13l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            Download CSV
          </button>
          <button class="btn btn--ghost btn--sm" id="planPrintBtn">
            <svg viewBox="0 0 20 20" fill="none"><path d="M6 7V3.5h8V7M6 14.5h8V17H6v-2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="3.5" y="7" width="13" height="7.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/></svg>
            Print / Save PDF
          </button>
        </div>
        ${highLevel}
        ${lowLevel}
      </div>
    `;
  }

  /* ---------------- Delivery Tracker (CNAP-style) ---------------- */
  function trackerScopedTickets(){
    let tickets = state.tickets.filter(t =>
      (!ui.releaseId || t.releaseId === ui.releaseId) && (isCurrentUserAdmin() || visibleDevIds().includes(t.assignee))
    );
    if (ui.adminResourceFilter) tickets = tickets.filter(t => t.assignee === ui.adminResourceFilter);
    return tickets;
  }

  function trackerEpicGroups(tickets){
    const byEpic = {};
    tickets.forEach(t => {
      const key = t.epicId || '__none__';
      (byEpic[key] = byEpic[key] || []).push(t);
    });
    const groups = Object.keys(byEpic).map(key => ({
      epic: key === '__none__' ? null : epicById(key),
      tickets: byEpic[key],
    }));
    groups.sort((a,b) => {
      if (!a.epic && b.epic) return 1;
      if (a.epic && !b.epic) return -1;
      if (!a.epic && !b.epic) return 0;
      return a.epic.epicNumber.localeCompare(b.epic.epicNumber, undefined, { numeric: true });
    });
    return groups;
  }

  function renderDeliveryTracker(){
    const tickets = trackerScopedTickets();
    const groups = trackerEpicGroups(tickets);

    const statusCounts = {};
    tickets.forEach(t => { const s = trackerStatus(t); statusCounts[s] = (statusCounts[s]||0) + 1; });

    const engineerIds = [...new Set(tickets.map(t => t.assignee).filter(Boolean))];
    const engineerWorkload = engineerIds.map(id => {
      const dev = devById(id);
      const devTickets = tickets.filter(t => t.assignee === id);
      return { dev, flagged: devTickets.filter(hasConflictWarning).length, total: devTickets.length };
    }).filter(e => e.dev).sort((a,b) => b.flagged - a.flagged);

    const epicRollup = groups.filter(g => g.epic).map(g => {
      const planned = +g.tickets.reduce((s,t) => s + ticketPlannedDays(t), 0).toFixed(1);
      const actual = +g.tickets.reduce((s,t) => s + ticketActualDays(t), 0).toFixed(1);
      return { epic: g.epic, planned, actual, variance: +(actual - planned).toFixed(1) };
    });

    const dashboard = `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel__head">
          <h3>Dashboard</h3>
          <span class="hint">Live as of ${fmtDate(todayISO())} · ${tickets.length} total rows on Tracker</span>
        </div>
        <div class="tracker-dash-grid">
          <div>
            <div class="tracker-dash-subhead">Status breakdown</div>
            <table class="data-table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>
              ${Object.entries(statusCounts).map(([s,c]) => `<tr><td><span class="badge badge--tstatus-${TRACKER_STATUS_CLASS[s]||'tobestarted'}">${s}</span></td><td class="mono">${c}</td></tr>`).join('')
                || `<tr><td colspan="2"><div class="empty"><p>No rows yet.</p></div></td></tr>`}
            </tbody></table>
          </div>
          <div>
            <div class="tracker-dash-subhead">Engineer workload</div>
            <table class="data-table"><thead><tr><th>Engineer</th><th>Flagged</th><th>Total</th></tr></thead><tbody>
              ${engineerWorkload.map(e => `<tr><td>${avatarHTML(e.dev.id)} ${escapeHTML(e.dev.name)}</td><td class="mono" style="${e.flagged?'color:var(--red);font-weight:700':''}">${e.flagged}</td><td class="mono">${e.total}</td></tr>`).join('')
                || `<tr><td colspan="3"><div class="empty"><p>No rows yet.</p></div></td></tr>`}
            </tbody></table>
          </div>
          <div>
            <div class="tracker-dash-subhead">Epic effort rollup</div>
            <table class="data-table"><thead><tr><th>Epic</th><th>Planned</th><th>Actual</th><th>Variance</th></tr></thead><tbody>
              ${epicRollup.map(e => `<tr><td class="mono">${escapeHTML(e.epic.epicNumber)}</td><td class="mono">${e.planned}d</td><td class="mono">${e.actual}d</td><td class="mono" style="${e.variance>0?'color:var(--red)':e.variance<0?'color:var(--teal)':''}">${e.variance>0?'+':''}${e.variance}d</td></tr>`).join('')
                || `<tr><td colspan="4"><div class="empty"><p>No epics yet.</p></div></td></tr>`}
            </tbody></table>
          </div>
        </div>
      </div>
    `;

    const rows = groups.map(g => `
      ${g.epic ? `<tr class="tracker-epic-row"><td colspan="20">${escapeHTML(g.epic.epicNumber)} — ${escapeHTML(g.epic.title)}</td></tr>`
                : (g.tickets.length ? `<tr class="tracker-epic-row"><td colspan="20">No epic</td></tr>` : '')}
      ${g.tickets.map(t => {
        const dev = devById(t.assignee);
        const rel = releaseById(t.releaseId);
        const slip = scheduleSlipDays(t);
        const variance = effortVarianceDays(t);
        const status = trackerStatus(t);
        return `
        <tr data-id="${t.id}">
          <td><span class="badge badge--prio-${t.priority}">${t.priority}</span></td>
          <td class="mono">${g.epic ? escapeHTML(g.epic.epicNumber) : '—'}</td>
          <td class="cell-title">${escapeHTML(t.title)}</td>
          <td>${escapeHTML(TRACKER_CATEGORY_LABEL[t.type] || t.type)}</td>
          <td>${rel ? escapeHTML(rel.name) : '—'}</td>
          <td>${escapeHTML(t.component || '—')}</td>
          <td>${dev ? avatarHTML(dev.id) + ' ' + escapeHTML(dev.name) : 'Unassigned'}</td>
          <td class="mono">${t.plannedStartDate ? shortDate(t.plannedStartDate) : '—'}</td>
          <td class="mono">${t.plannedEndDate ? shortDate(t.plannedEndDate) : '—'}</td>
          <td>${hasConflictWarning(t) ? `<span class="badge badge--rag-behind">Conflict</span>` : ''}</td>
          <td class="mono">${t.allocationPct||0}%</td>
          <td class="mono">${ticketPlannedDays(t)}d</td>
          <td>${escapeHTML(t.themeCustomer || '—')}</td>
          <td>${escapeHTML(t.remarks || '—')}</td>
          <td class="mono">${t.actualStartDate ? shortDate(t.actualStartDate) : '—'}</td>
          <td class="mono">${t.actualEndDate ? shortDate(t.actualEndDate) : '—'}</td>
          <td class="mono">${ticketActualDays(t)}d</td>
          <td class="mono" style="${slip>0?'color:var(--red)':slip<0?'color:var(--teal)':''}">${slip==null?'—':(slip>0?'+':'')+slip+'d'}</td>
          <td class="mono" style="${variance>0?'color:var(--red)':variance<0?'color:var(--teal)':''}">${(variance>0?'+':'')+variance}d</td>
          <td><span class="badge badge--tstatus-${TRACKER_STATUS_CLASS[status]||'tobestarted'}">${status}</span></td>
        </tr>`;
      }).join('')}
    `).join('') || `<tr><td colspan="20"><div class="empty"><p>No tickets match this view yet.</p></div></td></tr>`;

    return dashboard + `
      <div class="panel">
        <div class="panel__head">
          <h3>Tracker</h3>
          <button class="btn btn--ghost btn--sm" id="trackerExportCsvBtn">
            <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10m0 0-3.5-3.5M10 13l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            Download CSV
          </button>
        </div>
        <div class="table-wrap">
          <table class="data-table tracker-table">
            <thead>
              <tr>
                <th>PRI</th><th>EPIC-ID</th><th>Summary</th><th>Category</th><th>Release</th><th>Component</th>
                <th>Engineer</th><th>Start</th><th>End</th><th>Conflict</th><th>Alloc %</th><th>Planned Days</th>
                <th>Theme/Customer</th><th>Remarks</th><th>Actual Start</th><th>Actual End</th><th>Actual Days</th>
                <th>Slip</th><th>Variance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildDeliveryTrackerCSV(){
    const tickets = trackerScopedTickets();
    const groups = trackerEpicGroups(tickets);
    const rows = [];
    rows.push(csvRow(['Pulse — Delivery Tracker']));
    rows.push(csvRow(['Generated', new Date().toLocaleString()]));
    rows.push('');
    rows.push(csvRow([
      'PRI','EPIC-ID','Summary','Category','Release','Component','Engineer','Start','End','Conflict',
      'Alloc %','Planned Days','Theme/Customer','Remarks','Actual Start','Actual End','Actual Days',
      'Slip','Variance','Status',
    ]));
    groups.forEach(g => {
      g.tickets.forEach(t => {
        const dev = devById(t.assignee);
        const rel = releaseById(t.releaseId);
        const slip = scheduleSlipDays(t);
        const variance = effortVarianceDays(t);
        rows.push(csvRow([
          t.priority, g.epic ? g.epic.epicNumber : '', t.title, TRACKER_CATEGORY_LABEL[t.type] || t.type,
          rel ? rel.name : '', t.component || '', dev ? dev.name : 'Unassigned',
          t.plannedStartDate || '', t.plannedEndDate || '', hasConflictWarning(t) ? 'Conflict' : '',
          (t.allocationPct||0) + '%', ticketPlannedDays(t), t.themeCustomer || '', t.remarks || '',
          t.actualStartDate || '', t.actualEndDate || '', ticketActualDays(t),
          slip == null ? '' : slip, effortVarianceDays(t), trackerStatus(t),
        ]));
      });
    });
    return rows.join('\r\n');
  }

  function buildDeliveryPlanCSV(){
    const rel = currentRelease();
    const weeks = weeksInRange(rel.startDate, rel.endDate);
    const admin = isCurrentUserAdmin();
    const myGroupId = currentUser() ? currentUser().groupId : null;
    const groupsToShow = admin ? state.groups : state.groups.filter(g => g.id === myGroupId);
    const devIds = admin ? (ui.adminResourceFilter ? [ui.adminResourceFilter] : state.developers.map(d=>d.id)) : visibleDevIds();
    const planDevs = state.developers.filter(d => devIds.includes(d.id));

    const rows = [];
    rows.push(csvRow(['Pulse — Delivery Plan']));
    rows.push(csvRow(['Release', rel.name]));
    rows.push(csvRow(['Range', `${rel.startDate} to ${rel.endDate}`]));
    rows.push(csvRow(['Generated', new Date().toLocaleString()]));
    rows.push('');
    rows.push(csvRow(['High-level: weekly delivery by team']));
    rows.push(csvRow(['Team', ...weeks.map(w => `${weekRangeLabel(w)} — Estimated`), ...weeks.map(w => `${weekRangeLabel(w)} — Delivered`)]));
    groupsToShow.forEach(g => {
      rows.push(csvRow([
        g.name,
        ...weeks.map(w => groupWeekEstimate(g.id, w, rel.id)),
        ...weeks.map(w => groupWeekActual(g.id, w)),
      ]));
    });
    rows.push('');
    rows.push(csvRow(['Low-level: weekly plan vs actual by developer']));
    rows.push(csvRow(['Developer', 'Week', 'Estimated', 'Actual', 'Variance', 'Reason']));
    planDevs.forEach(d => {
      weeks.forEach(w => {
        const est = devWeekEstimate(d.id, w, rel.id);
        const act = devWeekActual(d.id, w);
        const over = act > est;
        const reason = (state.weeklyPlan.reasons[d.id] || {})[w] || '';
        rows.push(csvRow([
          d.name, weekRangeLabel(w), est, act,
          over ? `+${(act-est).toFixed(1)}h over` : 'On plan',
          reason,
        ]));
      });
    });

    return rows.join('\r\n');
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
    document.getElementById('f_component').value = ticket ? ticket.component || '' : '';
    document.getElementById('f_themeCustomer').value = ticket ? ticket.themeCustomer || '' : '';
    document.getElementById('f_allocationPct').value = ticket && ticket.allocationPct != null ? ticket.allocationPct : 100;
    document.getElementById('f_remarks').value = ticket ? ticket.remarks || '' : '';
    document.getElementById('f_plannedStart').value = ticket ? ticket.plannedStartDate || '' : '';
    document.getElementById('f_plannedEnd').value = ticket ? ticket.plannedEndDate || '' : '';
    document.getElementById('f_actualStart').value = ticket ? ticket.actualStartDate || '' : '';
    document.getElementById('f_actualEnd').value = ticket ? ticket.actualEndDate || '' : '';

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
  let deployDraftSections = [];
  let releasePlanDraft = null;
  const SCENARIO_TYPE_LABEL = { flow: 'Flow', usecase: 'Use case', test: 'Test scenario' };
  const TEST_RESULT_LABEL = { 'not-run': 'Not run', pass: 'Pass', fail: 'Fail', blocked: 'Blocked' };

  function renderScenarioList(){
    const container = document.getElementById('scenarioList');
    if (!modalScenarios.length){
      container.innerHTML = `<p class="field__hint" style="margin:2px 0 4px">No scenarios yet. Add a flow, use case or test case for this step.</p>`;
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
        ${s.type === 'test' ? `
        <div class="scenario-test-row">
          <select class="scenario-tester" data-scenario-tester="${s.id}">
            <option value="">— Unassigned tester —</option>
            ${state.developers.map(d => `<option value="${d.id}" ${s.tester===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}
          </select>
          <select class="scenario-result" data-scenario-result="${s.id}">
            ${Object.entries(TEST_RESULT_LABEL).map(([v,l]) => `<option value="${v}" ${((s.result)||'not-run')===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('[data-scenario-type]').forEach(sel => {
      sel.addEventListener('change', () => {
        const s = modalScenarios.find(x => x.id === sel.dataset.scenarioType);
        if (s) s.type = sel.value;
        renderScenarioList();
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
    container.querySelectorAll('[data-scenario-tester]').forEach(sel => {
      sel.addEventListener('change', () => {
        const s = modalScenarios.find(x => x.id === sel.dataset.scenarioTester);
        if (s) s.tester = sel.value || null;
      });
    });
    container.querySelectorAll('[data-scenario-result]').forEach(sel => {
      sel.addEventListener('change', () => {
        const s = modalScenarios.find(x => x.id === sel.dataset.scenarioResult);
        if (s) s.result = sel.value;
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
    modalScenarios.push({ id: uid('sc'), type: 'test', title: '', description: '', tester: null, result: 'not-run' });
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
      component: document.getElementById('f_component').value.trim(),
      themeCustomer: document.getElementById('f_themeCustomer').value.trim(),
      allocationPct: parseFloat(document.getElementById('f_allocationPct').value) || 0,
      remarks: document.getElementById('f_remarks').value.trim(),
      plannedStartDate: document.getElementById('f_plannedStart').value || null,
      plannedEndDate: document.getElementById('f_plannedEnd').value || null,
      actualStartDate: document.getElementById('f_actualStart').value || null,
      actualEndDate: document.getElementById('f_actualEnd').value || null,
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
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#F5F6F8' : '#0F1319');
    localStorage.setItem(THEME_KEY, theme);
  }
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
  applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');

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
            toast(`Marked done — don't forget to ${missing.join(' and ')}.`);
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

    const testingTesterFilter = document.getElementById('testingTesterFilter');
    if (testingTesterFilter) testingTesterFilter.addEventListener('change', (e) => { ui.testingFilters.tester = e.target.value; render(); });
    const testingResultFilter = document.getElementById('testingResultFilter');
    if (testingResultFilter) testingResultFilter.addEventListener('change', (e) => { ui.testingFilters.result = e.target.value; render(); });

    document.querySelectorAll('[data-test-tester]').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        const t = ticketById(sel.dataset.testTester);
        const sc = t && (t.scenarios||[]).find(x => x.id === sel.dataset.testId);
        if (!sc) return;
        sc.tester = sel.value || null;
        saveState();
        toast('Tester updated');
        render();
      });
    });
    document.querySelectorAll('[data-test-result]').forEach(sel => {
      sel.className = 'status-inline-select badge--result-' + sel.value;
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        const t = ticketById(sel.dataset.testResult);
        const sc = t && (t.scenarios||[]).find(x => x.id === sel.dataset.testId);
        if (!sc) return;
        sc.result = sel.value;
        saveState();
        toast('Result updated');
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

    const editDeployGuideBtn = document.getElementById('editDeployGuideBtn');
    if (editDeployGuideBtn) editDeployGuideBtn.addEventListener('click', () => {
      deployDraftSections = state.deploymentGuide.sections.map(s => ({ ...s }));
      ui.deployEditing = true;
      render();
    });
    const cancelDeployEditBtn = document.getElementById('cancelDeployEditBtn');
    if (cancelDeployEditBtn) cancelDeployEditBtn.addEventListener('click', () => {
      ui.deployEditing = false;
      render();
    });
    const addDeploySectionBtn = document.getElementById('addDeploySectionBtn');
    if (addDeploySectionBtn) addDeploySectionBtn.addEventListener('click', () => {
      deployDraftSections.push({ id: uid('sec'), title: '', body: '' });
      render();
    });
    const saveDeployGuideBtn = document.getElementById('saveDeployGuideBtn');
    if (saveDeployGuideBtn) saveDeployGuideBtn.addEventListener('click', () => {
      state.deploymentGuide = {
        version: DEPLOY_GUIDE_VERSION,
        sections: deployDraftSections.filter(s => s.title.trim() || s.body.trim()),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser() ? currentUser().id : null,
      };
      saveState();
      ui.deployEditing = false;
      toast('Deploy guide saved');
      render();
    });
    document.querySelectorAll('[data-sec-title]').forEach(inp => {
      inp.addEventListener('input', () => {
        const s = deployDraftSections.find(x => x.id === inp.dataset.secTitle);
        if (s) s.title = inp.value;
      });
    });
    document.querySelectorAll('[data-sec-body]').forEach(ta => {
      ta.addEventListener('input', () => {
        const s = deployDraftSections.find(x => x.id === ta.dataset.secBody);
        if (s) s.body = ta.value;
      });
    });
    document.querySelectorAll('[data-sec-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        deployDraftSections = deployDraftSections.filter(x => x.id !== btn.dataset.secRemove);
        render();
      });
    });

    const editReleasePlanBtn = document.getElementById('editReleasePlanBtn');
    if (editReleasePlanBtn) editReleasePlanBtn.addEventListener('click', () => {
      const rel = currentRelease();
      if (!rel) return;
      releasePlanDraft = JSON.parse(JSON.stringify(rel.releasePlan));
      ui.releasePlanEditing = true;
      render();
    });
    const cancelReleasePlanBtn = document.getElementById('cancelReleasePlanBtn');
    if (cancelReleasePlanBtn) cancelReleasePlanBtn.addEventListener('click', () => {
      ui.releasePlanEditing = false;
      render();
    });
    const saveReleasePlanBtn = document.getElementById('saveReleasePlanBtn');
    if (saveReleasePlanBtn) saveReleasePlanBtn.addEventListener('click', () => {
      const rel = currentRelease();
      if (!rel) return;
      const numOrNull = (id) => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };
      releasePlanDraft.summary = {
        totalEpics: numOrNull('rp_epics'),
        backlogBugs: numOrNull('rp_bugs'),
        totalProfiles: numOrNull('rp_profiles'),
      };
      releasePlanDraft.deliverablesLabel = document.getElementById('rp_delLabel').value.trim();
      releasePlanDraft.deliverables = releasePlanDraft.deliverables.map(s => s.trim()).filter(Boolean);
      releasePlanDraft.weeks = releasePlanDraft.weeks.filter(w => w.week.trim() || w.task.trim());
      rel.releasePlan = releasePlanDraft;
      saveState();
      ui.releasePlanEditing = false;
      toast('Release plan saved');
      render();
    });
    const addPlanWeekBtn = document.getElementById('addPlanWeekBtn');
    if (addPlanWeekBtn) addPlanWeekBtn.addEventListener('click', () => {
      releasePlanDraft.weeks.push({ id: uid('rw'), week: `#${releasePlanDraft.weeks.length + 1}`, from: '', to: '', task: '' });
      render();
    });
    const addPlanDeliverableBtn = document.getElementById('addPlanDeliverableBtn');
    if (addPlanDeliverableBtn) addPlanDeliverableBtn.addEventListener('click', () => {
      releasePlanDraft.deliverables.push('');
      render();
    });
    document.querySelectorAll('[data-week-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const w = releasePlanDraft.weeks.find(x => x.id === inp.dataset.weekId);
        if (w) w[inp.dataset.weekField] = inp.value;
      });
    });
    document.querySelectorAll('[data-week-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        releasePlanDraft.weeks = releasePlanDraft.weeks.filter(x => x.id !== btn.dataset.weekRemove);
        render();
      });
    });
    document.querySelectorAll('.plan-deliverable-input').forEach(inp => {
      inp.addEventListener('input', () => {
        releasePlanDraft.deliverables[parseInt(inp.dataset.delIndex, 10)] = inp.value;
      });
    });
    document.querySelectorAll('[data-del-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        releasePlanDraft.deliverables.splice(parseInt(btn.dataset.delRemove, 10), 1);
        render();
      });
    });

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => {
      downloadTextFile(`pulse-resource-report-${todayISO()}.csv`, 'text/csv;charset=utf-8;', buildResourceReportCSV());
      toast('Report downloaded');
    });

    const printReportBtn = document.getElementById('printReportBtn');
    if (printReportBtn) printReportBtn.addEventListener('click', () => window.print());

    const planExportCsvBtn = document.getElementById('planExportCsvBtn');
    if (planExportCsvBtn) planExportCsvBtn.addEventListener('click', () => {
      downloadTextFile(`pulse-delivery-plan-${todayISO()}.csv`, 'text/csv;charset=utf-8;', buildDeliveryPlanCSV());
      toast('Delivery plan downloaded');
    });
    const planPrintBtn = document.getElementById('planPrintBtn');
    if (planPrintBtn) planPrintBtn.addEventListener('click', () => window.print());

    const trackerExportCsvBtn = document.getElementById('trackerExportCsvBtn');
    if (trackerExportCsvBtn) trackerExportCsvBtn.addEventListener('click', () => {
      downloadTextFile(`pulse-delivery-tracker-${todayISO()}.csv`, 'text/csv;charset=utf-8;', buildDeliveryTrackerCSV());
      toast('Delivery tracker downloaded');
    });
    document.querySelectorAll('.tracker-table tbody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => openTicketModal(ticketById(row.dataset.id)));
    });

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
