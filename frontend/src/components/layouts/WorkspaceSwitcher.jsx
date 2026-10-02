import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { LuChevronDown, LuCheck, LuSettings, LuPlus } from 'react-icons/lu';
import {
  selectActiveOrganizationId,
  selectIsOrganizationsLoading,
  selectOrganizations,
  switchOrganization,
} from '../../store/authSlice.js';

const WorkspaceSwitcher = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const organizations = useSelector(selectOrganizations);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const isLoading = useSelector(selectIsOrganizationsLoading);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeOrg = organizations.find((org) => org.organizationId === activeOrganizationId);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!organizations.length) {
    return null;
  }

  const handleSelectOrg = (orgId) => {
    setIsOpen(false);
    if (orgId !== activeOrganizationId) {
      dispatch(switchOrganization(orgId));
    }
  };

  const handleGoToSettings = () => {
    setIsOpen(false);
    navigate('/settings/workspace');
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    navigate('/workspace/onboarding');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-xs font-medium text-content hover:text-content hover:bg-surface-muted transition-colors py-1 px-1.5 rounded cursor-pointer max-w-[140px] sm:max-w-[180px]"
        aria-label="Active workspace"
        aria-expanded={isOpen}
      >
        <span className="truncate">{activeOrg?.name || 'Workspace'}</span>
        <LuChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 mt-1.5 w-56 rounded-lg border border-border bg-surface py-1 text-xs text-content shadow-lg z-50 divide-y divide-border animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="p-1 space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              Workspaces
            </div>
            {organizations.map((org) => {
              const isSelected = org.organizationId === activeOrganizationId;
              return (
                <button
                  key={org.organizationId}
                  type="button"
                  onClick={() => handleSelectOrg(org.organizationId)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-surface-muted font-semibold text-content'
                      : 'text-content-muted hover:text-content hover:bg-surface-muted/60'
                  }`}
                >
                  <span className="truncate">{org.name}</span>
                  {isSelected && <LuCheck className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>

          <div className="p-1 space-y-0.5">
            <button
              type="button"
              onClick={handleGoToSettings}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted/60 transition-colors cursor-pointer"
            >
              <LuSettings className="w-3.5 h-3.5 shrink-0" />
              <span>Workspace settings...</span>
            </button>
            <button
              type="button"
              onClick={handleCreateNew}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-muted/60 transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5 shrink-0" />
              <span>New Workspace...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSwitcher;
