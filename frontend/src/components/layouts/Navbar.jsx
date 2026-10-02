import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SideMenu from './SideMenu';
import { HiOutlineMenu, HiOutlineX } from 'react-icons/hi';
import { LuSearch, LuLayoutGrid } from 'react-icons/lu';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import CommandPalette from '../CommandPalette.jsx';
import useUserAuth from '../../hooks/useUserAuth.jsx';

const Navbar = ({ activeMenu }) => {
  const [openSideMenu, setOpenSideMenu] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { activeOrganizationId } = useUserAuth();

  // Keyboard shortcut listener: Ctrl+K / Cmd+K (Search)
  useEffect(() => {
    if (!activeOrganizationId) return;

    const handleKeyDown = (e) => {
      // Ctrl+K / Cmd+K -> Command Palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOrganizationId]);

  return (
    <header className="h-12 bg-surface border-b border-border sticky top-0 z-30 px-4 flex items-center justify-between text-content select-none">
      {/* Left: Mobile Toggle + Logo + Breadcrumb / Workspace Switcher */}
      <div className="flex items-center gap-2.5">
        <button
          className="inline-flex items-center justify-center rounded-md p-1 text-content-muted transition-colors hover:bg-surface-muted hover:text-content lg:hidden cursor-pointer"
          onClick={() => setOpenSideMenu(!openSideMenu)}
          aria-label="Toggle menu"
          aria-expanded={openSideMenu}
        >
          {openSideMenu ? (
            <HiOutlineX className="w-5 h-5" />
          ) : (
            <HiOutlineMenu className="w-5 h-5" />
          )}
        </button>

        <Link
          to="/dashboard"
          className="flex items-center gap-2 font-medium text-content hover:opacity-90 transition-opacity"
        >
          <div className="w-5 h-5 rounded bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 shadow-2xs">
            <LuLayoutGrid className="w-3 h-3" />
          </div>
          <span className="font-semibold text-content tracking-tight text-xs sm:text-sm">TaskForge</span>
        </Link>

        {activeOrganizationId && (
          <>
            <span className="text-border select-none">/</span>
            <WorkspaceSwitcher />
          </>
        )}
      </div>

      {/* Center: Search Command Bar (Raycast / Linear style) */}
      {activeOrganizationId && (
        <div className="flex-1 max-w-md mx-3 sm:mx-6 hidden sm:block">
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="w-full relative flex items-center bg-surface-muted/70 hover:bg-surface-muted text-xs text-content-muted hover:text-content pl-8 pr-12 py-1.5 rounded-md border border-transparent hover:border-border transition-colors cursor-pointer text-left shadow-2xs group"
            aria-label="Search tasks, projects, docs (Ctrl+K)"
          >
            <LuSearch className="w-3.5 h-3.5 text-content-muted absolute left-2.5 pointer-events-none group-hover:text-content transition-colors" />
            <span className="truncate">Search tasks, projects, docs...</span>
            <kbd className="absolute right-2 text-[10px] font-mono text-content-muted bg-surface border border-border px-1.5 py-0.5 rounded shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Right: Quick actions (Mobile Search, Notifications, New Task) */}
      <div className="flex items-center gap-2">
        {activeOrganizationId && (
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="sm:hidden inline-flex items-center justify-center rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content cursor-pointer"
            aria-label="Search workspace"
          >
            <LuSearch className="w-4 h-4" />
          </button>
        )}

        <NotificationCenter />


      </div>

      {/* Command Palette Modal */}
      {activeOrganizationId && (
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      {openSideMenu && (
        <>
          <div
            className="fixed inset-0 top-12 bg-black/30 backdrop-blur-xs z-30 lg:hidden"
            onClick={() => setOpenSideMenu(false)}
            aria-hidden="true"
          />
          <div className="fixed top-12 bottom-0 left-0 z-40 bg-surface shadow-2xl lg:hidden">
            <SideMenu activeMenu={activeMenu} onClose={() => setOpenSideMenu(false)} />
          </div>
        </>
      )}
    </header>
  );
};

export default Navbar;
