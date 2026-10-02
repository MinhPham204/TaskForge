import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  LuLayoutDashboard,
  LuClipboardCheck,
  LuBell,
  LuFolderKanban,
  LuUsersRound,
  LuBuilding2,
  LuUserRound,
  LuChevronsUpDown,
  LuLogOut,
  LuSettings,
} from 'react-icons/lu';
import { logout } from '../../store/authSlice';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetDashboardQuery } from '../../services/dashboardApi.js';
import { useGetNotificationsQuery } from '../../services/collaborationApi.js';

const SideMenu = ({ activeMenu, onClose }) => {
  const { user, activeOrganizationId } = useUserAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Queries for live counts and favorites
  const { data: dashboardData } = useGetDashboardQuery(undefined, {
    skip: !user || !activeOrganizationId,
  });

  const { data: notifications = [] } = useGetNotificationsQuery(undefined, {
    skip: !activeOrganizationId,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const myTasksCount = dashboardData?.focus?.active || dashboardData?.assignedTasks?.length || 0;
  const projectsCount = dashboardData?.recentProjects?.length || 0;
  const favoriteProjects = dashboardData?.recentProjects?.slice(0, 3) || [];

  const handleNavigate = (path) => {
    if (onClose) onClose();
    setIsProfileMenuOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    if (onClose) onClose();
    setIsProfileMenuOpen(false);
    dispatch(logout());
    navigate('/login');
  };

  // Close profile popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileMenuOpen]);

  // Active checks
  const isItemActive = (path) => {
    if (activeMenu) return activeMenu === path;
    if (path === '/dashboard') return currentPath === '/dashboard';
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  const initials = user?.name
    ? user.name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <aside className="sticky top-12 z-20 flex h-[calc(100vh-48px)] w-56 flex-col justify-between overflow-y-auto border-r border-border bg-surface select-none text-content">
      <div className="p-2 space-y-4">
        {/* Main Navigation Links */}
        <nav className="space-y-0.5 text-xs" aria-label="Main Navigation">
          {/* Overview / Dashboard */}
          <button
            type="button"
            onClick={() => handleNavigate('/dashboard')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              isItemActive('/dashboard')
                ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LuLayoutDashboard
                className={`w-4 h-4 ${
                  isItemActive('/dashboard') ? 'text-primary' : 'text-content-muted'
                }`}
              />
              <span>Overview</span>
            </div>
          </button>

          {/* My Tasks */}
          <button
            type="button"
            onClick={() => handleNavigate('/tasks/my')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              isItemActive('/tasks/my')
                ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LuClipboardCheck
                className={`w-4 h-4 ${
                  isItemActive('/tasks/my') ? 'text-primary' : 'text-content-muted'
                }`}
              />
              <span>My Tasks</span>
            </div>
          </button>

          {/* Inbox */}
          <button
            type="button"
            onClick={() => handleNavigate('/inbox')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              isItemActive('/inbox')
                ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LuBell
                className={`w-4 h-4 ${
                  isItemActive('/inbox') ? 'text-primary' : 'text-content-muted'
                }`}
              />
              <span>Inbox</span>
            </div>
          </button>

          {/* Projects */}
          <button
            type="button"
            onClick={() => handleNavigate('/projects')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              isItemActive('/projects')
                ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LuFolderKanban
                className={`w-4 h-4 ${
                  isItemActive('/projects') ? 'text-primary' : 'text-content-muted'
                }`}
              />
              <span>Projects</span>
            </div>
          </button>

          {/* Teams */}
          <button
            type="button"
            onClick={() => handleNavigate('/teams')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              isItemActive('/teams')
                ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LuUsersRound
                className={`w-4 h-4 ${
                  isItemActive('/teams') ? 'text-primary' : 'text-content-muted'
                }`}
              />
              <span>Teams</span>
            </div>
          </button>
        </nav>

        {/* Section: Favorites */}
        <div className="pt-2">
          <div className="px-2.5 pb-1 text-[11px] font-medium text-content-muted uppercase tracking-wider">
            Favorites
          </div>
          <div className="space-y-0.5 text-xs">
            {favoriteProjects.length > 0 ? (
              favoriteProjects.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleNavigate(`/projects/${p.id}`)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted/60 transition-colors text-left cursor-pointer"
                  title={p.name}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      idx === 0
                        ? 'bg-emerald-500'
                        : idx === 1
                        ? 'bg-blue-500'
                        : 'bg-zinc-400'
                    }`}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('/projects')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted/60 transition-colors text-left cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">View all projects</span>
              </button>
            )}
          </div>
        </div>

        {/* Section: Settings */}
        <div className="pt-2">
          <div className="px-2.5 pb-1 text-[11px] font-medium text-content-muted uppercase tracking-wider">
            Settings
          </div>
          <div className="space-y-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleNavigate('/settings/workspace')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                isItemActive('/settings/workspace')
                  ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
              }`}
            >
              <LuBuilding2 className="w-3.5 h-3.5 text-content-muted" />
              <span>Workspace Settings</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('/account')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                isItemActive('/account')
                  ? 'text-content bg-surface-muted font-semibold shadow-2xs'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
              }`}
            >
              <LuUserRound className="w-3.5 h-3.5 text-content-muted" />
              <span>Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* User Footer Profile (Linear / Stitch Style) */}
      <div className="p-2 border-t border-border/80 relative" ref={profileMenuRef}>
        {/* Profile Popover Menu */}
        {isProfileMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 p-1 bg-surface border border-border rounded-lg shadow-lg space-y-0.5 text-xs z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              type="button"
              onClick={() => handleNavigate('/account')}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted transition-colors text-left cursor-pointer"
            >
              <LuUserRound className="w-3.5 h-3.5" />
              <span>Profile &amp; Account</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('/settings/personal')}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted transition-colors text-left cursor-pointer"
            >
              <LuSettings className="w-3.5 h-3.5" />
              <span>Personal Settings</span>
            </button>

            <div className="border-t border-border/60 my-1" />

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
            >
              <LuLogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        )}

        {/* User Card Trigger */}
        <button
          type="button"
          onClick={() => setIsProfileMenuOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-surface-muted transition-colors cursor-pointer group text-left"
          aria-expanded={isProfileMenuOpen}
          aria-label="User profile options"
        >
          <div className="flex items-center gap-2 min-w-0">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.name || 'User'}
                className="w-6 h-6 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-content text-surface text-[11px] font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-medium text-content truncate">
                {user?.name || 'User'}
              </div>
              <div className="text-[10px] text-content-muted truncate">
                {user?.email || ''}
              </div>
            </div>
          </div>
          <LuChevronsUpDown className="w-3.5 h-3.5 text-content-muted group-hover:text-content shrink-0" />
        </button>
      </div>
    </aside>
  );
};

export default SideMenu;
