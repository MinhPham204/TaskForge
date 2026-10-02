import React, { useState, useEffect, useRef } from 'react';
import useUserAuth from '../../../hooks/useUserAuth.jsx';
import { useGetOrganizationMembersQuery } from '../../../services/organizationApi';
import { useAddTeamMemberMutation } from '../../../services/teamApi';
import {
  LuUsers,
  LuX,
  LuBuilding2,
  LuTarget,
  LuGlobe,
  LuCircleCheck,
  LuCrown,
  LuLock,
  LuPaintbrush,
  LuPlus,
  LuInfo,
} from 'react-icons/lu';

const EMPTY_ARRAY = [];

const COLOR_THEMES = [
  { id: 'blue', label: 'Blue', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500', ring: 'ring-blue-500' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500', ring: 'ring-indigo-500' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500', ring: 'ring-emerald-500' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500', ring: 'ring-amber-500' },
  { id: 'rose', label: 'Rose', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800', dot: 'bg-rose-500', ring: 'ring-rose-500' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-100 dark:bg-purple-950/40', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-500', ring: 'ring-purple-500' },
];

const TEAM_TYPES = [
  { id: 'Department', label: 'Department', desc: 'Core operational unit', icon: LuBuilding2 },
  { id: 'Squad', label: 'Squad', desc: 'Cross-functional', icon: LuUsers },
  { id: 'Taskforce', label: 'Taskforce', desc: 'Targeted project', icon: LuTarget },
  { id: 'Company', label: 'Company', desc: 'All organization', icon: LuGlobe },
];

const getInitials = (name) => {
  if (!name || !name.trim()) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

const CreateTeamModal = ({ isOpen, onClose, onCreateTeam, isCreating = false }) => {
  const { activeOrganization, activeOrganizationId } = useUserAuth();

  const { data: orgMembers = EMPTY_ARRAY } = useGetOrganizationMembersQuery(activeOrganizationId, {
    skip: !isOpen || !activeOrganizationId,
  });

  const [addTeamMember] = useAddTeamMemberMutation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colorTheme, setColorTheme] = useState('blue');
  const [teamType, setTeamType] = useState('Department');
  const [teamLead, setTeamLead] = useState('');
  const [teamPrivacy, setTeamPrivacy] = useState('open');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  const activeTheme = COLOR_THEMES.find((t) => t.id === colorTheme) || COLOR_THEMES[0];

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setColorTheme('blue');
      setTeamType('Department');
      setTeamLead('');
      setTeamPrivacy('open');
      setSelectedMembers([]);
      setMemberSearchQuery('');
      setIsSearchOpen(false);
      setError('');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!isCreating) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isCreating]);

  // Click outside member search dropdown to close it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cycleColorTheme = () => {
    const currentIndex = COLOR_THEMES.findIndex((t) => t.id === colorTheme);
    const nextIndex = (currentIndex + 1) % COLOR_THEMES.length;
    setColorTheme(COLOR_THEMES[nextIndex].id);
  };

  const handleAddMember = (member) => {
    const membershipId = member.membershipId || member.id;
    if (!selectedMembers.some((m) => m.membershipId === membershipId)) {
      setSelectedMembers([
        ...selectedMembers,
        {
          membershipId,
          name: member.name || member.user?.name || member.email,
          email: member.email || member.user?.email,
          initials: getInitials(member.name || member.user?.name || member.email),
        },
      ]);
    }
    setMemberSearchQuery('');
    setIsSearchOpen(false);
  };

  const handleRemoveMember = (membershipId) => {
    setSelectedMembers(selectedMembers.filter((m) => m.membershipId !== membershipId));
  };

  // Filter members for search dropdown
  const filteredMembers = orgMembers.filter((m) => {
    const memId = m.membershipId || m.id;
    const isAlreadySelected = selectedMembers.some((sm) => sm.membershipId === memId);
    if (isAlreadySelected) return false;
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase();
    const nameMatch = (m.name || m.user?.name || '').toLowerCase().includes(q);
    const emailMatch = (m.email || m.user?.email || '').toLowerCase().includes(q);
    return nameMatch || emailMatch;
  });

  // Suggested members: up to 3 non-selected members
  const suggestedMembers = orgMembers
    .filter((m) => !selectedMembers.some((sm) => sm.membershipId === (m.membershipId || m.id)))
    .slice(0, 3);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Team Name is required.');
      return;
    }

    try {
      let finalDescription = description.trim();
      const meta = [];
      if (teamType) meta.push(`Type: ${teamType}`);
      if (teamLead) meta.push(`Lead: ${teamLead}`);
      if (teamPrivacy && teamPrivacy !== 'open') meta.push(`Privacy: ${teamPrivacy}`);
      if (colorTheme) meta.push(`Color: ${colorTheme}`);

      if (meta.length > 0) {
        finalDescription = finalDescription
          ? `${finalDescription}\n\n[${meta.join(' • ')}]`
          : `[${meta.join(' • ')}]`;
      }

      const created = await onCreateTeam({
        name: trimmed,
        description: finalDescription || undefined,
      });

      // If initial members were picked, add them to team
      if (selectedMembers.length > 0 && created?.id) {
        for (const sm of selectedMembers) {
          try {
            await addTeamMember({
              teamId: created.id,
              organizationMembershipId: sm.membershipId,
            }).unwrap();
          } catch (mErr) {
            console.warn('Failed to add member to team:', mErr);
          }
        }
      }

      onClose();
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to create team');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      {/* Modal Backdrop click dismiss */}
      <div className="fixed inset-0" onClick={() => !isCreating && onClose()} aria-hidden="true" />

      {/* CreateTeamModalCard */}
      <div
        aria-labelledby="modal-title"
        aria-modal="true"
        className="relative z-10 bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-border shadow-2xl w-full max-w-[660px] my-auto flex flex-col max-h-[92vh] overflow-hidden"
        data-purpose="create-team-modal"
        role="dialog"
      >
        {/* Modal Header */}
        <div className="px-7 pt-6 pb-4 border-b border-slate-100 dark:border-border flex items-start justify-between relative bg-white dark:bg-surface rounded-t-2xl shrink-0 select-none">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-semibold border border-blue-100 dark:border-blue-900">
                <LuUsers className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-content leading-snug" id="modal-title">
                Create New Team
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-content-muted leading-relaxed">
              Form a collaborative group for your department, squad, or cross-functional initiative.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close modal"
            disabled={isCreating}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-content hover:bg-slate-100 dark:hover:bg-surface-muted rounded-lg p-2 transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <LuX className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form id="createTeamForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
          {error && (
            <div
              role="alert"
              className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-xl"
            >
              {error}
            </div>
          )}

          {/* Identity & Name Section */}
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-content-muted">
              Team Identity &amp; Details
            </label>

            <div className="flex items-start gap-4">
              {/* Monogram Customizer Block */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div
                  id="teamBadgePreview"
                  onClick={cycleColorTheme}
                  title="Click to toggle icon color style"
                  className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-xl font-bold tracking-wide shadow-inner transition-colors duration-200 cursor-pointer group relative ${activeTheme.bg} ${activeTheme.text} ${activeTheme.border}`}
                >
                  <span>{getInitials(name)}</span>
                  <span className="absolute inset-0 bg-black/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                    <LuPaintbrush className="w-4 h-4" />
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-content-muted font-medium tracking-tight">
                  Custom Badge
                </span>
              </div>

              {/* Team Name Input */}
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-700 dark:text-content" htmlFor="teamName">
                    Team Name <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-content-muted">
                    e.g. Marketing &amp; Growth
                  </span>
                </div>
                <input
                  ref={nameInputRef}
                  id="teamName"
                  name="teamName"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Marketing & Growth, Frontend Engineering"
                  className="w-full text-sm rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-slate-900 dark:text-content shadow-xs focus:border-blue-600 focus:ring-1 focus:ring-blue-600 placeholder:text-slate-400 dark:placeholder:text-content-muted py-2 px-3 transition"
                />
                <p className="text-[11px] text-slate-500 dark:text-content-muted">
                  Must be unique within the {activeOrganization?.name || 'TaskForge'} workspace.
                </p>
              </div>
            </div>

            {/* Color & Symbol Fast Picker */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-surface-muted/60 border border-slate-200/80 dark:border-border">
              <span className="text-xs text-slate-600 dark:text-content-muted font-medium">
                Choose color theme:
              </span>
              <div className="flex items-center gap-2">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setColorTheme(theme.id)}
                    title={theme.label}
                    className={`w-6 h-6 rounded-full ${theme.dot} transition-all cursor-pointer ${
                      colorTheme === theme.id
                        ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900 scale-105'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Team Classification Section */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-content-muted">
              Team Classification
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="radiogroup">
              {TEAM_TYPES.map((type) => {
                const isSelected = teamType === type.id;
                const IconComponent = type.icon;
                return (
                  <label
                    key={type.id}
                    onClick={() => setTeamType(type.id)}
                    className={`relative flex flex-col p-3 text-left border rounded-xl cursor-pointer transition select-none ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-surface-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="teamType"
                      value={type.id}
                      checked={isSelected}
                      onChange={() => setTeamType(type.id)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1.5">
                      <IconComponent className="w-5 h-5" />
                      {isSelected ? (
                        <LuCircleCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-content">
                      {type.label}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-content-muted mt-0.5 leading-snug">
                      {type.desc}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-700 dark:text-content" htmlFor="teamDescription">
                Team Mission &amp; Scope
              </label>
              <span className="text-[11px] text-slate-400 dark:text-content-muted">Optional</span>
            </div>
            <textarea
              id="teamDescription"
              name="teamDescription"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe this team's key mission, goals, and recurring responsibilities..."
              className="w-full text-sm rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-slate-900 dark:text-content shadow-xs focus:border-blue-600 focus:ring-1 focus:ring-blue-600 placeholder:text-slate-400 dark:placeholder:text-content-muted p-2.5 transition resize-none"
            />
          </div>

          {/* Leadership & Initial Members Section */}
          <div className="space-y-4 pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-content-muted">
              Leadership &amp; Initial Members
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Team Lead Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-content flex items-center gap-1.5">
                  <LuCrown className="w-3.5 h-3.5 text-amber-500" />
                  <span>Team Lead</span>
                </label>
                <div className="relative">
                  <select
                    value={teamLead}
                    onChange={(e) => setTeamLead(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 dark:border-border shadow-xs focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white dark:bg-surface text-slate-800 dark:text-content py-2 px-3 cursor-pointer"
                  >
                    <option value="">No designated lead</option>
                    {orgMembers.map((m) => {
                      const nameStr = m.name || m.user?.name || m.email || 'Member';
                      return (
                        <option key={m.membershipId || m.id} value={nameStr}>
                          {nameStr} ({m.role || 'Member'})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Team Privacy Setting */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-content flex items-center gap-1.5">
                  <LuLock className="w-3.5 h-3.5 text-slate-500 dark:text-content-muted" />
                  <span>Team Privacy</span>
                </label>
                <div className="relative">
                  <select
                    value={teamPrivacy}
                    onChange={(e) => setTeamPrivacy(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 dark:border-border shadow-xs focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white dark:bg-surface text-slate-800 dark:text-content py-2 px-3 cursor-pointer"
                  >
                    <option value="open">Open (Anyone can join)</option>
                    <option value="closed">Invite Only (Admin approval)</option>
                    <option value="private">Private (Hidden from non-members)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Add Initial Members Quick Tagging */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-content">
                Add Team Members
              </label>

              {/* Member Chip Container & Search Input */}
              <div
                ref={searchContainerRef}
                className="relative min-h-[46px] p-1.5 border border-slate-300 dark:border-border rounded-lg flex flex-wrap items-center gap-1.5 bg-white dark:bg-surface focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 transition"
              >
                {selectedMembers.map((member) => (
                  <span
                    key={member.membershipId}
                    data-purpose="member-tag"
                    className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-surface-muted text-slate-700 dark:text-content text-xs px-2.5 py-1 rounded-md transition"
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                      {member.initials}
                    </span>
                    <span>{member.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.membershipId)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-content leading-none cursor-pointer"
                    >
                      <LuX className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {/* Inline Search Input */}
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => {
                    setMemberSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder={selectedMembers.length === 0 ? 'Type member name or email...' : 'Add more...'}
                  className="flex-1 min-w-[170px] border-0 p-1 text-xs focus:ring-0 text-slate-700 dark:text-content bg-transparent placeholder:text-slate-400 dark:placeholder:text-content-muted"
                />

                {/* Dropdown Results */}
                {isSearchOpen && filteredMembers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-border">
                    {filteredMembers.map((m) => {
                      const mName = m.name || m.user?.name || m.email || 'Member';
                      const mEmail = m.email || m.user?.email || '';
                      return (
                        <button
                          key={m.membershipId || m.id}
                          type="button"
                          onClick={() => handleAddMember(m)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-surface-muted flex items-center justify-between transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">
                              {getInitials(mName)}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800 dark:text-content">{mName}</p>
                              {mEmail && <p className="text-[10px] text-slate-400">{mEmail}</p>}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            + Add
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Suggestions From Workspace */}
              {suggestedMembers.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-content-muted pt-0.5 flex-wrap">
                  <span>Suggested:</span>
                  {suggestedMembers.map((m, idx) => {
                    const mName = m.name || m.user?.name || m.email || 'Member';
                    return (
                      <React.Fragment key={m.membershipId || m.id}>
                        {idx > 0 && <span>•</span>}
                        <button
                          type="button"
                          onClick={() => handleAddMember(m)}
                          className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                        >
                          + {mName}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-7 py-4 bg-slate-50 dark:bg-surface-muted/40 border-t border-slate-200/80 dark:border-border rounded-b-2xl flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-content-muted">
            <LuInfo className="w-4 h-4 text-slate-400 shrink-0" />
            <span>You can configure granular permissions later.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isCreating}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-content hover:bg-slate-200/70 dark:hover:bg-surface-muted border border-slate-300 dark:border-border rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="createTeamForm"
              disabled={isCreating || !name.trim()}
              className="px-5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <LuPlus className="w-4 h-4" />
              <span>{isCreating ? 'Creating Team...' : 'Create Team'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTeamModal;
