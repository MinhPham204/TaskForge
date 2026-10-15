import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LuMoon, LuSun } from 'react-icons/lu';
import useTheme from '../../hooks/useTheme';
import { THEME_PREFERENCES } from '../../utils/theme';
import workspaceOverview from '../../assets/images/landing-workspace-banner.png';
import './landing.css';

export default function LandingPage() {
  const { setThemePreference } = useTheme();
  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    setThemePreference(dark ? THEME_PREFERENCES.LIGHT : THEME_PREFERENCES.DARK);
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'TaskForge — Project & Workspace Platform';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div id="top" className="landing-page bg-[#fafafa] dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-600 selection:text-white transition-colors duration-150">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>
      {/* Top Announcement Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 text-[13px] py-2 px-4 text-slate-600 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900">TaskForge</span>
          <span className="">Bring your teams, projects, and approvals into one workspace.</span>
          <a className="font-medium text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1 ml-0.5" href="#features">
            Explore features
            <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
          </a>
        </div>
      </div>
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand Logo */}
          <a className="flex items-center gap-2.5 group" href="#top">
            <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-950 flex items-center justify-center shadow-sm">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2"></path>
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">TaskForge</span>
              <span className="hidden sm:inline text-[11px] font-mono text-slate-400 dark:text-slate-500">/ core</span>
            </div>
          </a>
          {/* Navigation Links */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-600 dark:text-slate-300">
            <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Features</a>
            <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#workflow">Workflow</a>
            <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#teams">Teams &amp; Projects</a>
            <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#faq">FAQ</a>
          </nav>
          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button type="button" aria-label="Toggle color theme" className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors" onClick={toggleTheme}>
              <LuSun className="hidden dark:block w-4 h-4" aria-hidden="true" />
              <LuMoon className="block dark:hidden w-4 h-4" aria-hidden="true" />
            </button>
            <Link className="text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 active:scale-95 transition-all px-3 py-1.5 rounded-md border border-slate-900 dark:border-white flex items-center gap-1.5" to="/login">
              <span className="">Get Started</span>
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </Link>
          </div>
        </div>
        <nav aria-label="Mobile navigation" className="flex md:hidden justify-around gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
          <a href="#features">Features</a><a href="#workflow">Workflow</a><a href="#teams">Teams &amp; Projects</a><a href="#faq">FAQ</a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {/* Hero Section */}
        <section className="relative pt-16 pb-16 md:pt-24 md:pb-24 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
          <div className="absolute inset-0 grid-pattern pointer-events-none"></div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Status pill */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Purpose-built for modern product and operations teams
            </div>
            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-950 dark:text-white max-w-3xl mx-auto leading-[1.12]">
              Workspaces built for clarity. Cross-functional project execution.
            </h1>
            {/* Subheadline */}
            <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Connect teams, manage initiatives with strict approval workflows, and track deliverables from backlog to verified completion.
            </p>
            {/* CTA Row */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 active:scale-[0.98] transition-all shadow-sm" to="/login">
                <span className="">Start using TaskForge</span>
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7l5 5m0 0l-5 5m5-5H6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </Link>
              <a className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all border border-slate-200 dark:border-slate-800 shadow-sm" href="#product-preview">
                <svg aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <span className="">Explore the board</span>
              </a>
            </div>
            {/* Realistic Product UI Frame */}
            <div id="product-preview" className="mt-12 max-w-5xl mx-auto text-left">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                {/* Window Title Bar */}
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span className="ml-2 text-[11px] font-mono text-slate-400 dark:text-slate-500">TaskForge / Example workspace / Core platform</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800">ACTIVE</span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Product preview</span>
                  </div>
                </div>
                {/* Board Inner */}
                <div className="p-4 sm:p-5 bg-white dark:bg-slate-950">
                  {/* Project Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <span className="">Projects</span>
                        <span className="">/</span>
                        <span className="text-slate-800 dark:text-slate-200 font-sans font-medium">Core Platform 2.0</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">Acme Cloud Platform Core</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Multi-tenant persistence layer, RBAC hierarchy, and real-time collaboration pipeline.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                        Settings
                      </span>
                      <span className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-700 text-white shadow-sm flex items-center gap-1">
                        <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        New Task
                      </span>
                    </div>
                  </div>
                  {/* View Tabs */}
                  <div className="flex items-center gap-5 pt-3 pb-1 border-b border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="text-blue-700 dark:text-blue-400 font-semibold border-b-2 border-blue-700 pb-2.5 -mb-1 flex items-center gap-1.5">
                      <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      Board
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">List</span>
                    <span className="text-slate-500 dark:text-slate-400">Overview</span>
                    <span className="text-slate-500 dark:text-slate-400">Milestones</span>
                    <span className="text-slate-500 dark:text-slate-400">Approvals</span>
                    <span className="text-slate-500 dark:text-slate-400">Activity</span>
                  </div>
                  {/* Kanban Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
                    {/* Col 1 */}
                    <div className="bg-slate-50/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/80 dark:border-slate-800">
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">To Do</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">1</span>
                      </div>
                      {/* Card */}
                      <div className="bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-2.5 shadow-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-medium text-slate-900 dark:text-white leading-snug">Finalize review acceptance checklist</h4>
                          <span className="text-[10px] font-mono text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.5 rounded border border-amber-200/50 dark:border-amber-900">P2</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Capture browser regression coverage for the client workspace flow.</p>
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="text-slate-600 dark:text-slate-400 font-sans">General Team</span>
                          <span className="">Sep 19</span>
                        </div>
                      </div>
                    </div>
                    {/* Col 2 */}
                    <div className="bg-slate-50/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/80 dark:border-slate-800">
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">In Progress</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">1</span>
                      </div>
                      {/* Card */}
                      <div className="bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-2.5 shadow-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-medium text-slate-900 dark:text-white leading-snug">Implement project task board views</h4>
                          <span className="text-[10px] font-mono text-red-600 bg-red-50 dark:bg-red-950/60 px-1 py-0.5 rounded border border-red-200/50 dark:border-red-900">P1</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Support responsive column virtualization and optimistic drag reordering.</p>
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="text-slate-600 dark:text-slate-400 font-sans">Frontend Eng</span>
                          <span className="">Sep 16</span>
                        </div>
                      </div>
                    </div>
                    {/* Col 3 */}
                    <div className="bg-slate-50/80 dark:bg-slate-900/60 rounded-lg p-3 border border-slate-200/80 dark:border-slate-800">
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Completed</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">1</span>
                      </div>
                      {/* Card */}
                      <div className="bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 p-2.5 shadow-sm space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-medium text-slate-900 dark:text-white leading-snug">Validate PostgreSQL task read models</h4>
                          <span className="text-[10px] font-mono text-purple-600 bg-purple-50 dark:bg-purple-950/60 px-1 py-0.5 rounded border border-purple-200/50 dark:border-purple-900">Strict</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Regression coverage completed across workspace partitioning queries.</p>
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-600 dark:text-slate-400 font-sans">Backend &amp; Infra</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Approved</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Key Value Pillars Section */}
        <section className="py-14 sm:py-16 bg-white dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Pillar 1 */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                <div className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400 mb-1.5">01 / STRUCTURE</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Hierarchical Workspaces</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Organize distinct business units, departments, or companies in separate workspaces with granular role-based permissions.
                </p>
              </div>
              {/* Pillar 2 */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                <div className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400 mb-1.5">02 / QUALITY</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Strict Mode &amp; Approvals</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Eliminate premature handoffs. Enforce mandatory sign-off from designated team leads before mission-critical tasks can be resolved.
                </p>
              </div>
              {/* Pillar 3 */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                <div className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400 mb-1.5">03 / VELOCITY</div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Board &amp; List Flexibility</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Switch effortlessly between a visual kanban board and high-density tabular task lists with calculated progress percentages.
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* Detailed Features Section */}
        <section className="py-20 md:py-28 bg-[#fafafa] dark:bg-slate-900/30" id="features">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="max-w-2xl mb-16">
              <span className="text-xs font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium">Core Architecture</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white mt-1.5 tracking-tight">
                Engineered for structured collaboration across cross-functional teams
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Designed for operations, engineering, product, and leadership teams requiring auditability and crisp organizational boundaries.
              </p>
            </div>
            {/* Feature 1: Multi-Team Coordination */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
              <div>
                <div className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2">ORG ARCHITECTURE</div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
                  Multi-tier workspace isolation with dedicated team ownership
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                  Keep projects, members, and permissions organized within separate workspaces. Within each space, coordinate work through dedicated teams and shared projects.
                </p>
                <ul className="mt-6 space-y-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span className="">Explicit role governance: Owner, Admin, Manager, and Member.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span className="">Invite colleagues into your workspace and organize them into dedicated teams.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span className="">Granular visibility: Workspace Public or Invite-Only Private projects.</span>
                  </li>
                </ul>
              </div>
              {/* UI Component Mockup (Teams Structure) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-mono font-medium text-slate-400 uppercase tracking-wider text-[11px]">Workspace Teams</span>
                  <span className="text-slate-400 font-mono text-[11px]">3 Active Groups</span>
                </div>
                <div className="mt-3.5 space-y-2.5">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-medium text-xs flex items-center justify-center">GE</div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">General</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Default project participants for all members</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">● Active</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-medium text-xs flex items-center justify-center">FE</div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Frontend Engineering</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Design systems, web clients, and interface architecture</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">● Active</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-medium text-xs flex items-center justify-center">BI</div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Backend &amp; Infrastructure</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">PostgreSQL persistence, Redis cache, and API gateways</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">● Active</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Feature 2: Task Detail & Approval Workflow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
              {/* UI Card */}
              <div className="order-2 lg:order-1 bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-mono text-slate-400">
                  <span className="">TASK-124</span>
                  <span className="text-blue-700 font-semibold uppercase">Approval Required</span>
                </div>
                <div className="mt-3">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Implement OAuth2 &amp; JWT session management</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure secure refresh token rotation and multi-tenant authorization hooks.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">Owning Team</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">DevOps &amp; Infrastructure</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">Assignee</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">Alexandre Lin</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">Priority</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">● Medium (P2)</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">Due Date</span>
                    <span className="font-medium font-mono text-slate-800 dark:text-slate-200">May 15, 2026</span>
                  </div>
                </div>
                <div className="mt-3.5 p-3 rounded bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/60 flex items-start gap-2.5">
                  <input aria-label="Example checklist item" defaultChecked className="mt-0.5 rounded text-blue-700 w-3.5 h-3.5" disabled type="checkbox" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">Requires approval before completion</span>
                      <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">STRICT MODE</span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Locks task resolution until signed off by designated Project Lead or QA Reviewer.</span>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2">GOVERNANCE &amp; AUDIT</div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
                  Transparent accountability with Strict Mode approvals
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                  Every deliverable in TaskForge is tied to a clear Owning Team, Assignee, explicit due date, and severity rating.
                </p>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                  For critical milestones, <strong>Strict Mode</strong> routes finished work directly into the Approval Queue, preventing premature sign-offs and maintaining verifiable audit trails.
                </p>
                <div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Urgent</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> High</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Medium</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Low</span>
                </div>
              </div>
            </div>
            {/* Feature 3: Collaboration & Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2">EXECUTION &amp; ALIGNMENT</div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white tracking-tight">
                  Acceptance checklists and context-rich discussions
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                  Break down complex initiatives into clear sub-task checklists with automated progress calculations, rich markdown descriptions, and persistent task attachments.
                </p>
                <div className="grid grid-cols-2 gap-3.5 mt-6">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs font-mono text-blue-700 font-semibold block">Stay informed</span>
                    <h5 className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Workspace Notifications</h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">Inbox updates whenever tasks are assigned or approvals are requested.</p>
                  </div>
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs font-mono text-blue-700 font-semibold block">Context</span>
                    <h5 className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Threaded Feedback</h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">Keep reviews and technical discussions directly inside the work item.</p>
                  </div>
                </div>
              </div>
              {/* UI Component (Checklist & Comments) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="">Acceptance Checklist</span>
                  <span className="text-blue-700 font-mono text-[11px]">2 / 3 Completed (66%)</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/50 text-slate-400 line-through">
                    <input aria-label="Example checklist item" defaultChecked className="rounded text-blue-700 w-3.5 h-3.5" disabled type="checkbox" />
                    <span className="">Define PostgreSQL schema &amp; foreign keys</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/50 text-slate-400 line-through">
                    <input aria-label="Example checklist item" defaultChecked className="rounded text-blue-700 w-3.5 h-3.5" disabled type="checkbox" />
                    <span className="">Configure connection pooling and connection limits</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium">
                    <input aria-label="Example checklist item" className="rounded text-blue-700 w-3.5 h-3.5" disabled type="checkbox" />
                    <span className="">Run end-to-end regression test suite</span>
                  </div>
                </div>
                {/* Thread item */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2.5">
                  <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-medium flex items-center justify-center shrink-0">AL</div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg text-xs flex-1">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Alexandre Lin</span>
                      <span className="font-mono">14:32</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">Schema migration script verified on staging. Ready for final review approval.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Workflow Section */}
        <section className="py-20 md:py-24 bg-white dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800" id="workflow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-14">
              <span className="text-xs font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium">Operational Rhythm</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white mt-1.5 tracking-tight">
                A four-step cycle from initial scoping to certified sign-off
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Clean handoffs between squads without friction, duplicate trackers, or status ambiguity.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Step 1 */}
              <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <span className="text-xs font-mono text-slate-400 block mb-2">01</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create Workspace</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Create a workspace for your team or organization with isolated data and customizable workspace settings.
                </p>
              </div>
              {/* Step 2 */}
              <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <span className="text-xs font-mono text-slate-400 block mb-2">02</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Invite Members</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Invite colleagues by email and organize members into the teams responsible for your next initiative.
                </p>
              </div>
              {/* Step 3 */}
              <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <span className="text-xs font-mono text-slate-400 block mb-2">03</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create Projects &amp; Assign</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Group work under projects, designate Owning Teams, and assign actionable tasks with explicit checklist items and due dates.
                </p>
              </div>
              {/* Step 4 */}
              <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                <span className="text-xs font-mono text-slate-400 block mb-2">04</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Track &amp; Approve</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Monitor progress via Kanban or List views, evaluate deliverables, and approve Strict Mode items before final closure.
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* Cross-team Visibility Section */}
        <section className="py-16 md:py-20 bg-slate-900 dark:bg-slate-900 text-white border-b border-slate-800" id="teams">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="text-xs font-mono uppercase tracking-wider text-blue-400 font-medium">Cross-Team Visibility</span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
                Eliminate informational silos across your organization
              </h2>
              <p className="text-slate-300 text-sm sm:text-base mt-3 leading-relaxed">
                Instead of scattering updates across separate silos, TaskForge unifies cross-department initiatives in one cohesive surface: resource allocations, 7-day delivery schedules, and dedicated "Assigned to You" queues.
              </p>
              <div className="mt-8 flex flex-wrap gap-2.5 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">✓ Kanban &amp; Table Views</span>
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">✓ Strict Approval Queues</span>
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">✓ Multi-Tenant Isolation</span>
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">✓ Workspace Invitations</span>
              </div>
            </div>
            <div className="mt-12 rounded-xl border border-slate-700/60 bg-slate-950/90 overflow-hidden shadow-xl">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/70 border-b border-slate-700/60 text-xs font-mono text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                  <span className="ml-2 text-[11px] text-slate-400">Unified Cross-Team Operating Architecture</span>
                </div>
                <span className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Workspace overview</span>
              </div>
              <div className="relative overflow-hidden">
                <img
                  alt="Unified Cross-Team Operating Architecture"
                  className="w-full h-auto block rounded-b-xl"
                  src={workspaceOverview}
                  loading="lazy"
                  decoding="async"
                  width="1376"
                  height="768"
                />
              </div>
            </div>
          </div>
        </section>
        {/* FAQ Section */}
        <section className="py-20 md:py-24 bg-white dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800" id="faq">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="text-xs font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium">FAQ</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white mt-1.5 tracking-tight">
                Frequently asked questions
              </h2>
            </div>
            <div className="space-y-3">
              {/* Q1 */}
              <details className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 [&amp;_summary::-webkit-details-marker]:hidden" open>
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-sm text-slate-900 dark:text-white">
                  <span className="">Is TaskForge suitable for non-technical teams?</span>
                  <span className="ml-4 transition-transform group-open:rotate-180 text-slate-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </span>
                </summary>
                <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Yes. TaskForge is built with neutral, flexible terminology. Marketing, Operations, Product, and HR teams use it daily for milestone tracking, vendor deliverables, compliance checklists, and recurring cross-department sprints.
                </p>
              </details>
              {/* Q2 */}
              <details className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 [&amp;_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-sm text-slate-900 dark:text-white">
                  <span className="">How does Strict Mode approval work?</span>
                  <span className="ml-4 transition-transform group-open:rotate-180 text-slate-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </span>
                </summary>
                <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  When "Requires approval before completion" is enabled on any task, the assignee cannot mark it as Done unilaterally. Instead, it moves to the Approval Queue for designated project owners or team leads to inspect and sign off.
                </p>
              </details>
              {/* Q3 */}
              <details className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 [&amp;_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-sm text-slate-900 dark:text-white">
                  <span className="">Can one account belong to multiple workspaces?</span>
                  <span className="ml-4 transition-transform group-open:rotate-180 text-slate-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </span>
                </summary>
                <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Yes. A single user profile can create or join multiple isolated workspaces. Switching between them takes one click using the Workspace Selector in the navigation bar.
                </p>
              </details>
              {/* Q4 */}
              <details className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 [&amp;_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-sm text-slate-900 dark:text-white">
                  <span className="">What views are supported across projects?</span>
                  <span className="ml-4 transition-transform group-open:rotate-180 text-slate-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </span>
                </summary>
                <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  TaskForge provides customizable Kanban Boards, high-density Task Tables, Project Overview analytics, Milestone progress views, and centralized Document attachments.
                </p>
              </details>
            </div>
          </div>
        </section>
        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-white dark:bg-slate-950" id="get-started">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-950 dark:text-white tracking-tight">
              Ready to standardize your team's project workflow?
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto mt-3 leading-relaxed">
              Launch your first workspace in minutes, invite your colleagues, and start coordinating initiatives with confidence.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 active:scale-[0.98] transition-all shadow-sm" to="/login">
                <span className="">Get Started</span>
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </Link>
              <a className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-800 shadow-sm" href="#features">
                Explore features
              </a>
            </div>
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 py-12 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Col 1 */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-[11px] flex items-center justify-center">
                  TF
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">TaskForge</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 max-w-sm leading-relaxed">
                Centralized project and workspace execution for multi-team organizations. High-craft, predictable, and audited delivery.
              </p>
              <div className="mt-4 text-[11px] font-mono text-slate-400">
                Built for <span className="text-slate-700 dark:text-slate-300 font-medium">teams that deliver together</span>
              </div>
            </div>
            {/* Col 2 */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2.5">Features</h4>
              <ul className="space-y-1.5 text-xs">
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Workspace Management</a></li>
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Team Classification</a></li>
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Kanban &amp; Tables</a></li>
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Strict Approvals</a></li>
              </ul>
            </div>
            {/* Col 3 */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2.5">Product</h4>
              <ul className="space-y-1.5 text-xs">
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#workflow">Operating Workflow</a></li>
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#faq">Frequently Asked Questions</a></li>
                <li className=""><a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#product-preview">Explore the board</a></li>
                <li className=""><Link className="hover:text-slate-900 dark:hover:text-white transition-colors" to="/login">Get Started</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
            <div className="">
              © {new Date().getFullYear()} TaskForge. All rights reserved.
            </div>
            <div className="flex items-center gap-5">
              <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#features">Product features</a>
              <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#workflow">How it works</a>
              <a className="hover:text-slate-900 dark:hover:text-white transition-colors" href="#faq">Help &amp; FAQ</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
