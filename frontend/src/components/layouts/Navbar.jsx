import React, { useState, useEffect } from 'react';
import SideMenu from './SideMenu';
import { HiOutlineMenu, HiOutlineX } from 'react-icons/hi';
import { LuSearch } from 'react-icons/lu';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import CommandPalette from '../CommandPalette.jsx';
import useUserAuth from '../../hooks/useUserAuth.jsx';

const Navbar = ({ activeMenu }) => {
  const [openSideMenu, setOpenSideMenu] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { activeOrganizationId } = useUserAuth();

  useEffect(() => {
    if (!activeOrganizationId) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeOrganizationId]);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-surface py-3 px-4 text-content backdrop-blur-[2px] sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center justify-center rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content lg:hidden"
          onClick={() => {
            setOpenSideMenu(!openSideMenu);
          }}
          aria-label="Toggle menu"
          aria-expanded={openSideMenu}
        >
          {openSideMenu ? (
            <HiOutlineX className="text-2xl" />
          ) : (
            <HiOutlineMenu className="text-2xl" />
          )}
        </button>
        <h2 className="text-lg font-bold tracking-tight">TaskForge</h2>
      </div>

      {activeOrganizationId && (
        <div className="flex-1 max-w-xs mx-2 hidden sm:block">
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-content-muted bg-surface-muted hover:bg-surface-muted/80 border border-border rounded-lg transition-colors cursor-pointer"
            aria-label="Search and command palette (Ctrl+K)"
          >
            <div className="flex items-center gap-2 min-w-0">
              <LuSearch className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Search workspace...</span>
            </div>
            <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-content-muted shrink-0">
              <abbr title="Control" className="no-underline">Ctrl</abbr> K
            </kbd>
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 ml-auto">
        {activeOrganizationId && (
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="sm:hidden inline-flex items-center justify-center rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-muted hover:text-content cursor-pointer"
            aria-label="Search workspace"
          >
            <LuSearch className="w-5 h-5" />
          </button>
        )}
        <WorkspaceSwitcher />
        <NotificationCenter />
      </div>

      {activeOrganizationId && (
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
        />
      )}

      {openSideMenu && (
        <>
          <div
            className="fixed inset-0 top-[57px] bg-black/30 backdrop-blur-xs z-30 lg:hidden"
            onClick={() => setOpenSideMenu(false)}
            aria-hidden="true"
          />
          <div className="fixed top-[57px] bottom-0 left-0 z-40 bg-surface shadow-2xl lg:hidden">
            <SideMenu activeMenu={activeMenu} onClose={() => setOpenSideMenu(false)} />
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;
