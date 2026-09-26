import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuSearch,
  LuX,
  LuFolderKanban,
  LuListTodo,
  LuUsers,
  LuPlus,
  LuClock,
  LuCornerDownLeft,
  LuArrowUp,
  LuArrowDown,
  LuRotateCcw,
  LuSparkles,
  LuTrash2,
} from 'react-icons/lu';
import useUserAuth from '../hooks/useUserAuth.jsx';
import { useSearchQuery } from '../services/searchApi.js';
import {
  getResourceDestination,
  getRecentDestinations,
  addRecentDestination,
  clearRecentDestinations,
} from '../utils/navigation.js';

const KIND_CONFIG = {
  PROJECT: {
    label: 'Project',
    icon: LuFolderKanban,
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  },
  TASK: {
    label: 'Task',
    icon: LuListTodo,
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
  TEAM: {
    label: 'Team',
    icon: LuUsers,
    badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900',
  },
};

const CommandPalette = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, activeOrganizationId } = useUserAuth();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cachedQuickCreate, setCachedQuickCreate] = useState(null);
  const [recentItems, setRecentItems] = useState([]);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef([]);

  // Debounce search query
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed.slice(0, 120));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Load recent items when palette opens or workspace changes
  useEffect(() => {
    if (isOpen && user?.id && activeOrganizationId) {
      setRecentItems(getRecentDestinations(user.id, activeOrganizationId));
    }
  }, [isOpen, user?.id, activeOrganizationId]);

  // Reset state on workspace switch
  useEffect(() => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedIndex(0);
    setCachedQuickCreate(null);
  }, [activeOrganizationId]);

  // Focus input and reset selected index when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [isOpen]);

  const {
    data: searchData,
    isLoading: isSearching,
    isFetching,
    isError,
    error,
    refetch,
  } = useSearchQuery(
    { query: debouncedQuery, limit: 10 },
    { skip: !isOpen || !debouncedQuery || debouncedQuery.length < 1 }
  );

  // Cache quickCreate when available from search response
  useEffect(() => {
    if (searchData?.quickCreate) {
      setCachedQuickCreate(searchData.quickCreate);
    }
  }, [searchData?.quickCreate]);

  // Quick actions derived strictly from backend quickCreate capability
  const quickActions = useMemo(() => {
    const caps = searchData?.quickCreate || cachedQuickCreate;
    if (!caps) return [];
    const actions = [];
    if (caps.canCreateProject) {
      actions.push({
        id: 'qa-project',
        type: 'QUICK_ACTION',
        title: 'Create Project',
        description: 'Set up a new project in this workspace',
        path: '/projects?create=true',
        icon: LuFolderKanban,
      });
    }
    if (caps.canCreateTeam) {
      actions.push({
        id: 'qa-team',
        type: 'QUICK_ACTION',
        title: 'Create Team',
        description: 'Create a reusable collaboration group',
        path: '/teams?create=true',
        icon: LuUsers,
      });
    }
    if (Array.isArray(caps.taskProjectIds) && caps.taskProjectIds.length > 0) {
      actions.push({
        id: 'qa-task',
        type: 'QUICK_ACTION',
        title: 'Create Task',
        description: 'Add a task in a project you manage',
        path: `/projects/${caps.taskProjectIds[0]}?createTask=true`,
        icon: LuListTodo,
      });
    }
    return actions;
  }, [searchData?.quickCreate, cachedQuickCreate]);

  // Build the selectable item list
  const activeItems = useMemo(() => {
    if (debouncedQuery) {
      const results = (searchData?.results || []).map((r) => ({
        ...r,
        type: 'RESULT',
      }));
      // In search mode, results come first, followed by quick actions if available
      return [...results, ...quickActions];
    }
    // In empty-query mode: quick actions first, then recent destinations
    const recents = recentItems.map((r) => ({
      ...r,
      type: 'RECENT',
    }));
    return [...quickActions, ...recents];
  }, [debouncedQuery, searchData?.results, quickActions, recentItems]);

  // Ensure selectedIndex is within bounds when activeItems changes
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (activeItems.length === 0) return 0;
      if (prev >= activeItems.length) return activeItems.length - 1;
      return prev;
    });
  }, [activeItems.length]);

  // Auto-scroll the active item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  const handleSelectItem = (item) => {
    if (!item) return;

    if (item.type === 'QUICK_ACTION') {
      onClose();
      navigate(item.path);
      return;
    }

    if (item.type === 'RESULT' || item.type === 'RECENT') {
      if (user?.id && activeOrganizationId) {
        addRecentDestination(user.id, activeOrganizationId, item);
      }
      const destination = getResourceDestination(item.kind, item.id, item.projectId);
      if (destination) {
        onClose();
        navigate(destination);
      }
    }
  };

  const handleClearRecents = (e) => {
    e.stopPropagation();
    if (user?.id && activeOrganizationId) {
      clearRecentDestinations(user.id, activeOrganizationId);
      setRecentItems([]);
      setSelectedIndex(0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % activeItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + activeItems.length) % activeItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItems[selectedIndex]) {
        handleSelectItem(activeItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette and Global Search"
    >
      <div
        className="relative w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface">
          <LuSearch className="w-5 h-5 text-content-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-items-list"
            aria-activedescendant={
              activeItems[selectedIndex] ? `palette-item-${selectedIndex}` : undefined
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={120}
            placeholder="Search projects, tasks, teams..."
            className="flex-1 bg-transparent text-sm text-content placeholder:text-content-muted focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded text-content-muted hover:text-content hover:bg-surface-muted transition-colors cursor-pointer"
              aria-label="Clear search input"
            >
              <LuX className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono text-content-muted">
            ESC
          </kbd>
        </div>

        {/* Results & Quick Actions Body */}
        <div
          id="palette-items-list"
          ref={listRef}
          role="listbox"
          className="overflow-y-auto p-2 flex-1 space-y-1"
        >
          {/* Loading State */}
          {debouncedQuery && (isSearching || isFetching) && (
            <div className="flex items-center justify-center gap-2 p-8 text-xs text-content-muted">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Searching visible projects, tasks, and teams...</span>
            </div>
          )}

          {/* Error State */}
          {debouncedQuery && !isSearching && isError && (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs font-medium text-destructive">Failed to perform search</p>
              <p className="text-[11px] text-content-muted">
                {error?.data?.message || 'Could not reach the search service at this time.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 cursor-pointer"
              >
                <LuRotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* Search Empty State */}
          {debouncedQuery &&
            !isSearching &&
            !isFetching &&
            !isError &&
            searchData?.results?.length === 0 && (
              <div className="p-8 text-center space-y-1">
                <p className="text-xs font-medium text-content">
                  No matches found for &ldquo;{debouncedQuery}&rdquo;
                </p>
                <p className="text-[11px] text-content-muted">
                  Results only include projects, tasks, and teams you have access to.
                </p>
              </div>
            )}

          {/* Query is empty and no recents / quick actions */}
          {!debouncedQuery && activeItems.length === 0 && (
            <div className="p-8 text-center space-y-1 text-content-muted">
              <LuSearch className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs font-medium text-content">Type to search your workspace</p>
              <p className="text-[11px]">
                Search across visible projects, tasks, and teams with instant results.
              </p>
            </div>
          )}

          {/* Render Active Items */}
          {activeItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const isQuickAction = item.type === 'QUICK_ACTION';
            const kindInfo = KIND_CONFIG[item.kind] || {
              label: item.kind,
              icon: LuFolderKanban,
              badgeClasses: 'bg-surface-muted text-content-muted border-border',
            };
            const Icon = isQuickAction ? item.icon || LuPlus : kindInfo.icon;

            return (
              <div
                key={item.id}
                id={`palette-item-${index}`}
                ref={(el) => (itemRefs.current[index] = el)}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-content hover:bg-surface-muted border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-primary text-white'
                        : isQuickAction
                        ? 'bg-primary/10 text-primary'
                        : 'bg-surface-muted text-content-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-xs truncate">{item.title}</p>
                      {item.type === 'RECENT' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-content-muted">
                          <LuClock className="w-2.5 h-2.5" />
                          Recent
                        </span>
                      )}
                      {isQuickAction && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold uppercase tracking-wider">
                          <LuSparkles className="w-2.5 h-2.5" />
                          Action
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-content-muted truncate mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isQuickAction && item.kind && (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${kindInfo.badgeClasses}`}
                    >
                      {kindInfo.label}
                    </span>
                  )}
                  {isSelected && (
                    <LuCornerDownLeft className="w-3.5 h-3.5 text-primary opacity-80" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with Recent Clear & Keyboard Hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-muted/40 text-[11px] text-content-muted">
          <div>
            {!debouncedQuery && recentItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearRecents}
                className="inline-flex items-center gap-1 text-[11px] text-content-muted hover:text-destructive transition-colors cursor-pointer"
                title="Clear recent destinations"
              >
                <LuTrash2 className="w-3 h-3" />
                <span>Clear recents</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <LuArrowUp className="w-2.5 h-2.5" />
              <LuArrowDown className="w-2.5 h-2.5" />
              <span>Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <LuCornerDownLeft className="w-2.5 h-2.5" />
              <span>Select</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono text-[9px]">ESC</kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
