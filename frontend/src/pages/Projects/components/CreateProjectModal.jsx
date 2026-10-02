import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserAuth from '../../../hooks/useUserAuth.jsx';
import { useCreateProjectMutation } from '../../../services/projectApi';
import { useGetOrganizationMembersQuery } from '../../../services/organizationApi';
import { useGetTeamsQuery } from '../../../services/teamApi';
import {
  LuFolderGit2,
  LuGlobe,
  LuLock,
  LuKanban,
  LuList,
  LuArrowRight,
  LuX,
  LuExternalLink,
  LuCircleCheck,
} from 'react-icons/lu';

const EMPTY_ARRAY = [];

const ACCENT_COLORS = [
  { id: 'blue', label: 'Blue', colorClass: 'bg-blue-600', ringClass: 'ring-blue-600', bgBox: 'bg-blue-50 dark:bg-blue-950/40', textBox: 'text-blue-600 dark:text-blue-400', borderBox: 'border-blue-200 dark:border-blue-800' },
  { id: 'emerald', label: 'Emerald', colorClass: 'bg-emerald-500', ringClass: 'ring-emerald-500', bgBox: 'bg-emerald-50 dark:bg-emerald-950/40', textBox: 'text-emerald-600 dark:text-emerald-400', borderBox: 'border-emerald-200 dark:border-emerald-800' },
  { id: 'violet', label: 'Violet', colorClass: 'bg-violet-600', ringClass: 'ring-violet-600', bgBox: 'bg-violet-50 dark:bg-violet-950/40', textBox: 'text-violet-600 dark:text-violet-400', borderBox: 'border-violet-200 dark:border-violet-800' },
  { id: 'amber', label: 'Amber', colorClass: 'bg-amber-500', ringClass: 'ring-amber-500', bgBox: 'bg-amber-50 dark:bg-amber-950/40', textBox: 'text-amber-700 dark:text-amber-400', borderBox: 'border-amber-200 dark:border-amber-800' },
  { id: 'rose', label: 'Rose', colorClass: 'bg-rose-500', ringClass: 'ring-rose-500', bgBox: 'bg-rose-50 dark:bg-rose-950/40', textBox: 'text-rose-600 dark:text-rose-400', borderBox: 'border-rose-200 dark:border-rose-800' },
];

const getInitials = (name) => {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const CreateProjectModal = ({
  isOpen,
  onClose,
  onCreateProject,
  isCreating: externalIsCreating = false,
}) => {
  const navigate = useNavigate();
  const { user, activeOrganizationId } = useUserAuth();

  const [createProjectMutation, { isLoading: isInternalCreating }] = useCreateProjectMutation();
  const isCreating = externalIsCreating || isInternalCreating;

  const { data: members = EMPTY_ARRAY } = useGetOrganizationMembersQuery(activeOrganizationId, {
    skip: !isOpen || !activeOrganizationId,
  });

  const { data: teams = EMPTY_ARRAY } = useGetTeamsQuery(undefined, {
    skip: !isOpen,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('blue');
  const [projectLead, setProjectLead] = useState('');
  const [primaryDepartment, setPrimaryDepartment] = useState('General Workspace');
  const [privacy, setPrivacy] = useState('public');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [defaultView, setDefaultView] = useState('kanban');
  const [createdProject, setCreatedProject] = useState(null);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);

  const activeAccent = ACCENT_COLORS.find((c) => c.id === accentColor) || ACCENT_COLORS[0];

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setAccentColor('blue');
      setProjectLead(user?.name ? `${user.name} (You)` : 'You');
      setPrimaryDepartment(teams[0]?.name || 'General Workspace');
      setPrivacy('public');
      setStartDate('');
      setDueDate('');
      setDefaultView('kanban');
      setCreatedProject(null);
      setError('');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, user?.name, teams]);

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

  const cycleAccent = () => {
    const currentIndex = ACCENT_COLORS.findIndex((c) => c.id === accentColor);
    const nextIndex = (currentIndex + 1) % ACCENT_COLORS.length;
    setAccentColor(ACCENT_COLORS[nextIndex].id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name is required');
      return;
    }

    if (startDate && dueDate && startDate > dueDate) {
      setError('Due date cannot be before start date');
      return;
    }

    try {
      let finalDescription = description.trim();
      const meta = [];
      if (accentColor && accentColor !== 'blue') meta.push(`Color: ${accentColor}`);
      if (projectLead) meta.push(`Lead: ${projectLead}`);
      if (primaryDepartment && primaryDepartment !== 'General Workspace') meta.push(`Department: ${primaryDepartment}`);
      if (privacy && privacy !== 'public') meta.push(`Privacy: ${privacy}`);
      if (defaultView && defaultView !== 'kanban') meta.push(`View: ${defaultView}`);

      if (meta.length > 0) {
        finalDescription = finalDescription
          ? `${finalDescription}\n\n[${meta.join(' • ')}]`
          : `[${meta.join(' • ')}]`;
      }

      const payload = {
        name: trimmedName,
        description: finalDescription || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
      };

      let result;
      if (onCreateProject) {
        result = await onCreateProject(payload);
      } else {
        result = await createProjectMutation(payload).unwrap();
      }

      if (result?.id) {
        setCreatedProject(result);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to create project');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      {/* Backdrop click dismiss */}
      <div className="fixed inset-0" onClick={() => !isCreating && onClose()} aria-hidden="true" />

      {/* CreateProjectModal Card */}
      <div
        data-purpose="create-project-modal"
        aria-labelledby="modal-headline"
        aria-modal="true"
        className="relative z-10 w-full max-w-[680px] bg-white dark:bg-surface rounded-2xl border border-slate-200/80 dark:border-border shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
        role="dialog"
      >
        {/* Modal Header */}
        <header className="px-6 sm:px-7 pt-6 pb-4 border-b border-slate-100 dark:border-border flex items-start justify-between bg-white dark:bg-surface shrink-0 select-none">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-content" id="modal-headline">
              Create New Project
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-content-muted mt-1 leading-relaxed">
              Set up a new initiative, define scope, timelines, and team access across your workspace.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close dialog"
            disabled={isCreating}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-content p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            <LuX className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        {createdProject ? (
          <div className="p-6 sm:p-7 space-y-5">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-semibold text-sm">
                <LuCircleCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Project created successfully!</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                <strong className="font-semibold text-emerald-900 dark:text-emerald-100">{createdProject.name}</strong> is now initialized. You can invite participating teams, configure workflow statuses, and begin tracking deliverables.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-content hover:bg-slate-100 dark:hover:bg-surface-muted border border-slate-300 dark:border-border rounded-lg transition-colors cursor-pointer"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/projects/${createdProject.id}`);
                }}
                className="px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <span>Open Project</span>
                <LuExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <form id="createProjectForm" onSubmit={handleSubmit} className="px-6 sm:px-7 py-5 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div
                role="alert"
                className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-xl"
              >
                {error}
              </div>
            )}

            {/* Visual Accent & Icon Picker */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-content-muted mb-2">
                  Project Icon &amp; Theme Accent
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Icon Display Box */}
                  <button
                    type="button"
                    onClick={cycleAccent}
                    title="Click to cycle icon accent color"
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center shadow-xs transition-colors cursor-pointer ${activeAccent.bgBox} ${activeAccent.textBox} ${activeAccent.borderBox}`}
                  >
                    <LuFolderGit2 className="w-5 h-5" />
                  </button>

                  {/* Color Palette Dots */}
                  <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-border">
                    {ACCENT_COLORS.map((accent) => (
                      <button
                        key={accent.id}
                        type="button"
                        onClick={() => setAccentColor(accent.id)}
                        aria-label={`${accent.label} color theme`}
                        title={accent.label}
                        className={`w-6 h-6 rounded-full ${accent.colorClass} transition-all cursor-pointer ${
                          accentColor === accent.id
                            ? `ring-2 ring-offset-2 ${accent.ringClass} dark:ring-offset-slate-900 scale-105`
                            : 'opacity-80 hover:opacity-100 hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 dark:text-content-muted ml-auto hidden sm:inline">
                    Identifies this project in navigation
                  </span>
                </div>
              </div>

              {/* Project Title Input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content" htmlFor="project-name">
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-xs text-slate-400 dark:text-content-muted">Required</span>
                </div>
                <input
                  ref={nameInputRef}
                  id="project-name"
                  name="projectName"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mobile Companion App, Marketing Rebrand, Core Platform"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-sm text-slate-900 dark:text-content placeholder:text-slate-400 dark:placeholder:text-content-muted focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium"
                />
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-1.5" htmlFor="project-description">
                  Description
                </label>
                <textarea
                  id="project-description"
                  name="projectDescription"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe this project's primary objectives, deliverables, and goals..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-sm text-slate-900 dark:text-content placeholder:text-slate-400 dark:placeholder:text-content-muted focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all resize-none"
                />
              </div>
            </div>

            <hr className="border-slate-100 dark:border-border" />

            {/* Attributes: Lead & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Project Lead */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-1.5" htmlFor="project-lead">
                  Project Lead
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-semibold flex items-center justify-center">
                      {getInitials(projectLead)}
                    </span>
                  </div>
                  <select
                    id="project-lead"
                    name="projectLead"
                    value={projectLead}
                    onChange={(e) => setProjectLead(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 rounded-lg border border-slate-300 dark:border-border text-xs sm:text-sm text-slate-800 dark:text-content bg-white dark:bg-surface focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
                  >
                    {user?.name && (
                      <option value={`${user.name} (You)`}>
                        {user.name} (You)
                      </option>
                    )}
                    {members.map((m) => {
                      const mName = m.name || m.user?.name || m.email;
                      if (mName === user?.name) return null;
                      return (
                        <option key={m.membershipId || m.id} value={mName}>
                          {mName} ({m.role || 'Member'})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Primary Department */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-1.5" htmlFor="primary-department">
                  Primary Department
                </label>
                <select
                  id="primary-department"
                  name="primaryDepartment"
                  value={primaryDepartment}
                  onChange={(e) => setPrimaryDepartment(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-border text-xs sm:text-sm text-slate-800 dark:text-content bg-white dark:bg-surface focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
                >
                  <option value="General Workspace">General Workspace</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Access & Privacy Options */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-2">
                Access &amp; Privacy
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-purpose="privacy-selection">
                {/* Public Option */}
                <label
                  onClick={() => setPrivacy('public')}
                  className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all select-none ${
                    privacy === 'public'
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-surface-muted'
                  }`}
                >
                  <div className="mt-0.5 mr-3 text-blue-600 dark:text-blue-400">
                    <LuGlobe className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-content">Workspace Public</p>
                    <p className="text-[11px] text-slate-500 dark:text-content-muted mt-0.5">
                      Everyone in the workspace can view &amp; participate
                    </p>
                  </div>
                </label>

                {/* Private Option */}
                <label
                  onClick={() => setPrivacy('private')}
                  className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all select-none ${
                    privacy === 'private'
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-surface-muted'
                  }`}
                >
                  <div className="mt-0.5 mr-3 text-slate-500 dark:text-content-muted">
                    <LuLock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-content">Private Project</p>
                    <p className="text-[11px] text-slate-500 dark:text-content-muted mt-0.5">
                      Only invited members can view this space
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Timeline & Schedule Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-1.5" htmlFor="start-date">
                  Start Date
                </label>
                <input
                  id="start-date"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-xs sm:text-sm text-slate-700 dark:text-content focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-1.5" htmlFor="due-date">
                  Target Due Date
                </label>
                <input
                  id="due-date"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-surface text-xs sm:text-sm text-slate-700 dark:text-content focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Workflow View Template */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-content mb-2">
                Default Workflow View
              </label>
              <div className="grid grid-cols-2 gap-3" data-purpose="view-selection">
                {/* Kanban Board */}
                <label
                  onClick={() => setDefaultView('kanban')}
                  className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                    defaultView === 'kanban'
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-surface-muted'
                  }`}
                >
                  <span className="p-2 rounded-lg bg-slate-100 dark:bg-surface-muted text-slate-600 dark:text-content">
                    <LuKanban className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-content leading-tight">
                      Kanban Board
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-content-muted">
                      Agile column sprints
                    </p>
                  </div>
                </label>

                {/* Task List */}
                <label
                  onClick={() => setDefaultView('list')}
                  className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                    defaultView === 'list'
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-border hover:bg-slate-50 dark:hover:bg-surface-muted'
                  }`}
                >
                  <span className="p-2 rounded-lg bg-slate-100 dark:bg-surface-muted text-slate-600 dark:text-content">
                    <LuList className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-content leading-tight">
                      Task List
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-content-muted">
                      Compact list view
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </form>
        )}

        {/* Modal Footer */}
        {!createdProject && (
          <footer className="px-6 sm:px-7 py-4 bg-slate-50/80 dark:bg-surface-muted/40 border-t border-slate-100 dark:border-border flex items-center justify-between shrink-0 select-none">
            <span className="text-xs text-slate-400 dark:text-content-muted hidden sm:inline">
              Press <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-200 dark:bg-surface rounded border border-slate-300 dark:border-border text-slate-700 dark:text-content">Esc</kbd> to exit
            </span>

            <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                disabled={isCreating}
                onClick={onClose}
                className="w-1/2 sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-content bg-white dark:bg-surface border border-slate-300 dark:border-border rounded-lg hover:bg-slate-50 dark:hover:bg-surface-muted transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="createProjectForm"
                disabled={isCreating || !name.trim()}
                className="w-1/2 sm:w-auto px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs shadow-blue-500/20 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{isCreating ? 'Creating...' : 'Create Project'}</span>
                <LuArrowRight className="w-4 h-4" />
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default CreateProjectModal;
