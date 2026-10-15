import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  useGetTaskAssignmentCandidatesQuery,
  useCreateProjectTaskMutation,
  useUpdateProjectTaskMutation,
  useConfigureApprovalMutation,
  useAssignTaskMutation,
  useUnassignTaskMutation,
  useTransitionTaskStatusMutation,
  useGetProjectTaskDetailQuery,
} from '../../../services/taskApi';
import {
  useGetProjectsQuery,
  useGetProjectByIdQuery,
  useGetProjectTeamsQuery,
  useGetProjectStatusesQuery,
  useGetProjectMembersQuery,
  useGetProjectMilestonesQuery,
} from '../../../services/projectApi';
import TaskAssigneePicker from '../../../components/task/TaskAssigneePicker.jsx';
import { requireEligibleNewAssignees } from '../../../utils/taskAssignments.js';
import { useDispatch } from 'react-redux';
import { taskApi } from '../../../services/taskApi.js';
import { taskEditorDraft, editorPermissions, editorReason, eligibleTaskApprovers, saveTaskEditor } from '../../../utils/taskEditor.js';
import useUserAuth from '../../../hooks/useUserAuth.jsx';
import {
  LuLayoutGrid,
  LuMaximize2,
  LuMinimize2,
  LuX,
  LuSquareCheck,
  LuChevronDown,
  LuBold,
  LuItalic,
  LuCode,
  LuList,
  LuListChecks,
  LuLink,
  LuFileText,
  LuUsers,
  LuUser,
  LuCircleDot,
  LuFlag,
  LuCalendar,
  LuMilestone,
  LuTag,
  LuPlus,
  LuCirclePlus,
  LuShieldCheck,
} from 'react-icons/lu';

const PRIORITY_OPTIONS = [
  { value: 'URGENT', label: '🔴 Urgent (P0)' },
  { value: 'HIGH', label: '🟠 High (P1)' },
  { value: 'MEDIUM', label: '🟡 Medium (P2)' },
  { value: 'LOW', label: '🟢 Low (P3)' },
];

const getProjectMonogram = (name) => {
  if (!name) return 'TF';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const EMPTY_ARRAY = [];

const TaskFormModal = ({
  isOpen,
  onClose,
  projectId: initialProjectId,
  task = null, // null for create, object for edit
  onSuccess,
  projects: incomingProjects = null,
  onSelectProject,
}) => {
  const { user, activeOrganizationId } = useUserAuth();
  const dispatch = useDispatch();
  const [savedTaskId, setSavedTaskId] = useState(null);
  const isEditing = Boolean(task || savedTaskId);
  const sessionRef = useRef(null);
  const initializedKey = useRef(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const currentScopeRef = useRef('');
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Queries
  const { data: cachedProjects = EMPTY_ARRAY } = useGetProjectsQuery(undefined, {
    skip: !isOpen,
  });
  const allProjects = Array.isArray(incomingProjects) && incomingProjects.length > 0
    ? incomingProjects
    : cachedProjects;

  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId || allProjects[0]?.id || ''
  );
  const effectiveProjectId = task?.projectId || (task ? initialProjectId : selectedProjectId) || initialProjectId || allProjects[0]?.id || '';
  currentScopeRef.current = `${user?.id}:${activeOrganizationId}:${effectiveProjectId}:${task?.id || 'create'}:${isOpen}`;

  const { currentData: activeProject } = useGetProjectByIdQuery(effectiveProjectId, { skip: !isOpen || !effectiveProjectId });
  const detailId = task?.id || savedTaskId;
  const { currentData: fullDetail, isFetching: isFetchingDetail, isError: detailError, refetch: refetchDetail } = useGetProjectTaskDetailQuery(
    { projectId: effectiveProjectId, taskId: detailId },
    { skip: !isOpen || !detailId, refetchOnMountOrArgChange: true },
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedProjectId(current => current || initialProjectId || allProjects[0]?.id || '');
  }, [isOpen, initialProjectId, allProjects]);

  const { currentData: teams = EMPTY_ARRAY } = useGetProjectTeamsQuery(effectiveProjectId, {
    skip: !isOpen || !effectiveProjectId,
  });
  const { currentData: statuses = EMPTY_ARRAY } = useGetProjectStatusesQuery(effectiveProjectId, {
    skip: !isOpen || !effectiveProjectId,
  });
  const { currentData: members = EMPTY_ARRAY } = useGetProjectMembersQuery(effectiveProjectId, {
    skip: !isOpen || !effectiveProjectId,
  });
  const { currentData: milestones = EMPTY_ARRAY } = useGetProjectMilestonesQuery(effectiveProjectId, {
    skip: !isOpen || !effectiveProjectId,
  });

  const [createTask, { isLoading: isCreating }] = useCreateProjectTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateProjectTaskMutation();
  const [configureApproval] = useConfigureApprovalMutation();
  const [assignTask] = useAssignTaskMutation();
  const [unassignTask] = useUnassignTaskMutation();
  const [transitionStatus] = useTransitionTaskStatusMutation();
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owningTeamId, setOwningTeamId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityCode, setPriorityCode] = useState('MEDIUM');
  const [dueAt, setDueAt] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approverMembershipId, setApproverMembershipId] = useState('');
  const [createAnother, setCreateAnother] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [formError, setFormError] = useState('');

  // Labels
  const [labels, setLabels] = useState([]);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  const { currentData: candidates = EMPTY_ARRAY, isFetching: candidatesLoading, isError: candidatesError, refetch: refetchCandidates } = useGetTaskAssignmentCandidatesQuery(
    { projectId: effectiveProjectId, teamId: owningTeamId },
    { skip: !isOpen || !effectiveProjectId || !owningTeamId || !(detailId ? fullDetail?.capabilities?.assign?.allowed === true : activeProject?.viewer?.canManage === true && activeProject?.viewer?.canCreateTask === true), refetchOnMountOrArgChange: true },
  );
  const descriptionRef = useRef(null);
  const titleInputRef = useRef(null);
  const createContentRef = useRef(null);
  createContentRef.current = { title, description, labels, priorityCode, dueAt };

  const openMilestones = milestones.filter((m) => m.statusCode === 'OPEN');

  // Find current user's membership in this project
  const myMembership = members.find(
    (m) => m.user?.id === user?.id || m.userId === user?.id
  );

  const applyDraft = (draft) => {
    setTitle(draft.title); setDescription(draft.description); setLabels(draft.labels);
    setOwningTeamId(draft.owningTeamId); setStatusId(draft.statusId); setPriorityCode(draft.priorityCode);
    setDueAt(draft.dueAt); setMilestoneId(draft.milestoneId); setAssigneeIds(draft.assigneeIds);
    setRequiresApproval(draft.requiresApproval); setApproverMembershipId(draft.approverMembershipId);
  };
  useEffect(() => {
    if (!isOpen) { initializedKey.current = null; sessionRef.current = null; return; }
    const key = currentScopeRef.current;
    if (initializedKey.current === key) return;
    if (task && (!fullDetail || isFetchingDetail)) return;
    const keepCreateContent = !task && !sessionRef.current?.task && initializedKey.current?.startsWith(`${user?.id}:${activeOrganizationId}:`);
    const initial = keepCreateContent
      ? { ...taskEditorDraft(), ...createContentRef.current }
      : taskEditorDraft(task ? fullDetail : undefined);
    sessionRef.current = { task: task ? fullDetail : null, initial: structuredClone(initial) };
    initializedKey.current = key;
    applyDraft(initial);
    setSavedTaskId(null); setFormError(''); setSaveFeedback(null);
  }, [isOpen, task, fullDetail, isFetchingDetail, effectiveProjectId, activeOrganizationId, user?.id]);

  const permissions = editorPermissions(detailId ? (!detailError && fullDetail || { capabilities: {} }) : null, activeProject);
  const ready = Boolean(sessionRef.current && initializedKey.current === currentScopeRef.current);
  const permitted = operation => ready && permissions[operation].allowed;
  const disabledReason = operation => permitted(operation) ? undefined : editorReason(permissions[operation].reason);
  const creatorId = sessionRef.current?.task?.creatorProjectMembershipId || myMembership?.projectMembershipId || myMembership?.id;
  const approvers = eligibleTaskApprovers(members, creatorId, assigneeIds);

  // Set default team and status once loaded if creating
  useEffect(() => {
    if (!isOpen || isEditing || !ready) return;
    if (!owningTeamId && teams.length > 0) {
      setOwningTeamId(teams[0]?.teamId || teams[0]?.id || '');
    }
  }, [isOpen, isEditing, ready, teams, owningTeamId]);

  useEffect(() => {
    if (!isOpen || isEditing) return;
    if (!statusId && statuses.length > 0) {
      setStatusId(statuses[0]?.id || '');
    }
  }, [isOpen, isEditing, ready, statuses, statusId]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!pendingRef.current) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Markdown toolbar helper
  const insertMarkdown = (prefix, suffix = '', defaultText = '') => {
    const textarea = descriptionRef.current;
    if (!textarea || !permitted('editContent') || pendingRef.current) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = description;
    const selected = text.substring(start, end) || defaultText;
    const replacement = `${prefix}${selected}${suffix}`;
    const nextValue = text.substring(0, start) + replacement + text.substring(end);
    setDescription(nextValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 0);
  };

  const handleAddLabel = () => {
    const trimmed = labelInput.trim().replace(/^#/, '');
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
    }
    setLabelInput('');
    setIsAddingLabel(false);
  };

  const handleRemoveLabel = (labelToRemove) => {
    setLabels(labels.filter((l) => l !== labelToRemove));
  };

  const handleAssignToMe = () => {
    if (myMembership) {
      const myId = myMembership.id || myMembership.projectMembershipId || myMembership.organizationMembershipId;
      setAssigneeIds(ids => [...new Set([...ids, myId])]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pendingRef.current || !ready) return;
    pendingRef.current = true;
    setIsSaving(true); setFormError('');
    const scope = currentScopeRef.current;
    const saveSession = sessionRef.current;
    const isCurrent = () => mountedRef.current && currentScopeRef.current === scope && sessionRef.current === saveSession;
    const draft = { title, description, labels, owningTeamId, statusId, priorityCode, dueAt, milestoneId, assigneeIds, requiresApproval, approverMembershipId };
    const commands = { createProjectTask: createTask, updateProjectTask: updateTask, assignTask, unassignTask, configureApproval, transitionTaskStatus: transitionStatus };
    try {
      requireEligibleNewAssignees(sessionRef.current.task?.assigneeProjectMembershipIds || [], assigneeIds, candidates);
      if (fullDetail?.id === sessionRef.current.task?.id && !isFetchingDetail) sessionRef.current.task = fullDetail;
      const result = await saveTaskEditor({
        session: sessionRef.current, draft, projectId: effectiveProjectId, project: activeProject, members, creatorId,
        execute: (name, args) => commands[name](args).unwrap(),
        readDetail: async taskId => {
          const request = dispatch(taskApi.endpoints.getProjectTaskDetail.initiate({ projectId: effectiveProjectId, taskId }, { forceRefetch: true, subscribe: false }));
          return request.unwrap();
        },
        isCurrent,
        onStep: label => { if (isCurrent()) setSaveFeedback(previous => ({ saved: [...(previous?.saved || []), label] })); },
      });
      if (!isCurrent() || result.stale) return;
      if (sessionRef.current.task?.id && !task) setSavedTaskId(sessionRef.current.task.id);
      if (!result.complete) {
        setSaveFeedback(previous => ({ ...previous, failed: result.failed, remaining: result.remaining }));
        const message = result.error?.data?.message || result.error?.message || 'Request failed.';
        const detail = Array.isArray(message) ? message.join(' ') : message;
        setFormError(sessionRef.current.uncertainCreate
          ? 'Creation result is unknown. Check the Task list before starting another creation; retry could duplicate the Task.'
          : `${detail}${result.ambiguous ? sessionRef.current.needsReconcile ? ' Server state could not be read. Retry will reload it before sending any changes.' : ' Server state has been reloaded. Retry will send only the remaining changes.' : ''}`);
        return;
      }
      toast.success(task || savedTaskId ? 'Task changes saved successfully' : 'Task created successfully');
      onSuccess?.();
      if (createAnother && !task) {
        const initial = taskEditorDraft({ owningTeamId, statusId, priorityCode });
        sessionRef.current = { task: null, initial: structuredClone(initial) };
        applyDraft(initial); setSavedTaskId(null); setSaveFeedback(null);
        titleInputRef.current?.focus();
      } else onClose();
    } catch (error) {
      if (isCurrent()) setFormError(error.data?.message || error.message || 'Operation failed.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const isSubmitting = isSaving || isCreating || isUpdating;
  const closeEditor = () => { if (!pendingRef.current) onClose(); };

  if (!isOpen) return null;

  const ticketKeyPreview = activeProject?.key
    ? `${activeProject.key}-### (Auto)`
    : 'TK-124 (Auto)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
        onClick={closeEditor}
        aria-hidden="true"
      />

      {/* CreateTaskModal Container */}
      <section
        data-purpose="create-task-modal"
        className={`relative z-10 w-full bg-surface rounded-2xl shadow-2xl border border-border flex flex-col transition-all duration-200 overflow-hidden ${
          isFullscreen
            ? 'fixed inset-0 rounded-none max-w-none max-h-none h-full'
            : 'max-w-[720px] max-h-[92vh]'
        }`}
      >
        {/* Modal Header */}
        <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface select-none shrink-0">
          {/* Breadcrumb Context & Title Indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-content-muted bg-surface-muted border border-border px-2.5 py-1 rounded-md">
              <LuLayoutGrid className="w-3.5 h-3.5 text-content-muted" />
              <span>TaskForge</span>
              <span className="text-border">/</span>
              <span className="text-content font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {activeProject?.name || 'TaskForge Platform'}
              </span>
            </div>
            <span className="text-border">•</span>
            <span className="text-content-muted font-mono text-[11px]">
              {task?.taskCode || ticketKeyPreview}
            </span>
          </div>

          {/* Quick Actions & Close */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-muted transition-colors cursor-pointer"
              title={isFullscreen ? 'Restore view' : 'Expand to Fullscreen'}
            >
              {isFullscreen ? (
                <LuMinimize2 className="w-4 h-4" />
              ) : (
                <LuMaximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="flex items-center gap-1 p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-muted transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <LuX className="w-4 h-4" />
              <kbd className="hidden sm:inline-block font-sans text-[10px] uppercase font-semibold text-content-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                Esc
              </kbd>
            </button>
          </div>
        </header>

        {/* Modal Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {formError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-xl"
            >
              {formError}
            </div>
          )}

          {detailId && !ready && !detailError && <div role="status">Loading full Task details…</div>}
          {detailError && <div role="alert">Could not load Task details. <button type="button" onClick={refetchDetail}>Retry</button></div>}
          {saveFeedback && <div role="status" className="text-xs text-content space-y-1">
            {saveFeedback.saved?.length > 0 && <p>Saved: {saveFeedback.saved.join('; ')}.</p>}
            {saveFeedback.failed && <p>Failed: {saveFeedback.failed}. Pending: {saveFeedback.remaining?.join('; ')}. Keep this form open and retry the remaining changes.</p>}
          </div>}
          {['editContent', 'editManagement', 'transition', 'assign', 'configureApproval'].filter(operation => !permissions[operation].allowed).map(operation => (
            <p key={operation} className="text-xs text-content-muted">{({ editContent: 'Content and labels', editManagement: 'Team, priority, due date and milestone', transition: 'Status', assign: 'Assignees', configureApproval: 'Approval' })[operation]}: {editorReason(permissions[operation].reason)}</p>
          ))}
          <fieldset disabled={isSubmitting || !ready} className="space-y-5">
          {/* Project and Key Selector Bar */}
          <div className="flex flex-wrap items-center gap-2 select-none">
            {/* Project Dropdown Pill */}
            {allProjects.length > 1 && !isEditing ? (
              <div className="relative inline-flex items-center">
                <span className="absolute left-2.5 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-bold pointer-events-none">
                  {getProjectMonogram(activeProject?.name)}
                </span>
                <select
                  value={effectiveProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setOwningTeamId('');
                    setStatusId('');
                    onSelectProject?.(e.target.value);
                  }}
                  className="pl-8 pr-7 py-1.5 text-xs font-medium text-content bg-surface-muted hover:bg-surface border border-border rounded-lg transition-colors focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                >
                  {allProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <LuChevronDown className="w-3 h-3 text-content-muted absolute right-2 pointer-events-none" />
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-xs font-medium text-content bg-surface-muted border border-border px-3 py-1.5 rounded-lg">
                <span className="w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                  {getProjectMonogram(activeProject?.name)}
                </span>
                <span className="truncate max-w-[210px]">
                  {activeProject?.name || 'Project'}
                </span>
              </div>
            )}

            <span className="text-border">/</span>

            {/* Quick Issue Type Selector */}
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-content-muted bg-surface-muted border border-border px-2.5 py-1.5 rounded-lg">
              <LuSquareCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-content font-medium">Task</span>
              <LuChevronDown className="w-3 h-3 text-content-muted" />
            </div>
          </div>

          {/* Task Title Input (Hero / Borderless) */}
          <div className="space-y-1">
            <label className="sr-only" htmlFor="task-title">
              Task Title
            </label>
            <input
              ref={titleInputRef}
              id="task-title"
                    disabled={!permitted('editContent')}
                    title={disabledReason('editContent')}
              type="text"
              required
              autoFocus
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title or summary..."
              className="w-full text-xl font-semibold text-content placeholder:text-content-muted/60 placeholder:font-normal border-0 focus:ring-0 px-0 py-1 tracking-tight bg-transparent"
            />
          </div>

          {/* Rich Description Editor Container */}
          <div className="space-y-2">
            <div className="border border-border rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-surface">
              {/* Editor Mini Toolbar */}
              <div className="flex items-center justify-between px-3 py-2 bg-surface-muted/60 border-b border-border text-content-muted select-none">
                <div className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => insertMarkdown('**', '**', 'bold text')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Bold"
                  >
                    <LuBold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('*', '*', 'italic text')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Italic"
                  >
                    <LuItalic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('`', '`', 'code')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Code"
                  >
                    <LuCode className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-[1px] h-3.5 bg-border mx-1" />
                  <button
                    type="button"
                    onClick={() => insertMarkdown('\n- ', '', 'List item')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Bulleted list"
                  >
                    <LuList className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('\n- [ ] ', '', 'Task item')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Checklist"
                  >
                    <LuListChecks className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('[', '](https://example.com)', 'Link title')}
                    className="p-1 hover:bg-surface-muted hover:text-content rounded transition cursor-pointer"
                    title="Link"
                  >
                    <LuLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-[11px] font-medium text-content-muted flex items-center gap-1">
                  <LuFileText className="w-3 h-3 text-primary" />
                  <span>Markdown</span>
                </div>
              </div>

              {/* Description Textarea */}
              <textarea
                ref={descriptionRef}
                id="task-desc"
                    disabled={!permitted('editContent')}
                    title={disabledReason('editContent')}
                rows={4}
                maxLength={10000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add detailed description, acceptance criteria, requirements, or type '/' for commands..."
                className="w-full border-0 focus:ring-0 p-3.5 text-sm text-content placeholder:text-content-muted/60 resize-none leading-relaxed bg-surface"
              />
            </div>
          </div>

          {/* Structured Metadata Properties Grid */}
          <div className="bg-surface-muted/60 dark:bg-surface-muted/40 rounded-xl p-4 border border-border space-y-4">
            <h4 className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
              Properties &amp; Attributes
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              {/* 1. Owning Team */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="task-team"
                  className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]"
                >
                  <LuUsers className="w-3.5 h-3.5 text-content-muted shrink-0" />
                  <span>Owning Team</span>
                </label>
                <div className="relative flex-1">
                  <select
                    id="task-team"
                    required
                    value={owningTeamId}
                    onChange={(e) => setOwningTeamId(e.target.value)}
                    disabled={teams.length === 0 || !permitted('editManagement')}
                    title={disabledReason('editManagement')}
                    className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1.5 pl-3 pr-7 hover:border-content-muted focus:border-primary focus:ring-1 focus:ring-primary transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {teams.length === 0 ? (
                      <option value="">No teams available</option>
                    ) : (
                      teams.map((t) => (
                        <option key={t.teamId || t.id} value={t.teamId || t.id}>
                          {t.teamName || t.name || t.teamId || t.id}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-content-muted">Assignees</span>
                <TaskAssigneePicker ids={assigneeIds} candidates={candidates} members={members} onChange={setAssigneeIds}
                  canAssign={permitted('assign')} canUnassign={permitted('unassign')} loading={candidatesLoading}
                  error={candidatesError} onRetry={refetchCandidates} disabled={isSubmitting} />
                {sessionRef.current?.task && owningTeamId !== sessionRef.current.task.owningTeamId && !candidatesLoading && !candidatesError && sessionRef.current.task.assigneeProjectMembershipIds?.some(id => !candidates.some(member => member.projectMembershipId === id)) && (
                  <p className="text-xs text-content-muted">Some current assignees do not belong to the selected Team. First save explicit assignee removals using the current Team, then select the new Team.</p>
                )}
              </div>

              {/* 3. Status */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="task-status"
                  className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]"
                >
                  <LuCircleDot className="w-3.5 h-3.5 text-content-muted shrink-0" />
                  <span>Status</span>
                </label>
                <div className="relative flex-1">
                  <select
                    id="task-status"
                    required
                    value={statusId}
                    onChange={(e) => setStatusId(e.target.value)}
                    disabled={statuses.length === 0 || !permitted('transition')}
                    title={disabledReason('transition')}
                    className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1.5 pl-3 pr-7 hover:border-content-muted focus:border-primary focus:ring-1 focus:ring-primary transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {statuses.length === 0 ? (
                      <option value="">No statuses available</option>
                    ) : (
                      statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.semanticCategory})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* 4. Priority */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="task-priority"
                  className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]"
                >
                  <LuFlag className="w-3.5 h-3.5 text-content-muted shrink-0" />
                  <span>Priority</span>
                </label>
                <div className="relative flex-1">
                  <select
                    id="task-priority"
                    disabled={!permitted('editManagement')}
                    title={disabledReason('editManagement')}
                    value={priorityCode}
                    onChange={(e) => setPriorityCode(e.target.value)}
                    className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1.5 pl-3 pr-7 hover:border-content-muted focus:border-primary focus:ring-1 focus:ring-primary transition shadow-2xs cursor-pointer"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. Due Date */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="task-due"
                  className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]"
                >
                  <LuCalendar className="w-3.5 h-3.5 text-content-muted shrink-0" />
                  <span>Due Date</span>
                </label>
                <div className="relative flex-1">
                  <input
                    id="task-due"
                    disabled={!permitted('editManagement')}
                    title={disabledReason('editManagement')}
                    type="date"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1 px-2.5 hover:border-content-muted focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                  />
                </div>
              </div>

              {/* 6. Milestone */}
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="task-milestone"
                  className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]"
                >
                  <LuMilestone className="w-3.5 h-3.5 text-content-muted shrink-0" />
                  <span>Milestone</span>
                </label>
                <div className="relative flex-1">
                  <select
                    id="task-milestone"
                    disabled={!permitted('editManagement')}
                    title={disabledReason('editManagement')}
                    value={milestoneId}
                    onChange={(e) => setMilestoneId(e.target.value)}
                    className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1.5 pl-3 pr-7 hover:border-content-muted focus:border-primary focus:ring-1 focus:ring-primary transition shadow-2xs cursor-pointer"
                  >
                    <option value="">No milestone assigned</option>
                    {milestoneId && !openMilestones.some(m => m.id === milestoneId) && <option value={milestoneId}>Current milestone (closed or unavailable)</option>}
                    {openMilestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Labels Chip Bar */}
            <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-content-muted flex items-center gap-1.5 min-w-[105px]">
                <LuTag className="w-3.5 h-3.5 text-content-muted shrink-0" />
                <span>Labels</span>
              </label>

              <div className="flex items-center gap-1.5 flex-wrap justify-end flex-1">
                <fieldset disabled={!permitted('editContent')} className="flex items-center gap-1.5 flex-wrap justify-end">
                {labels.map((lbl) => (
                  <span
                    key={lbl}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    {lbl}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(lbl)}
                      className="text-primary hover:text-primary/70 cursor-pointer"
                    >
                      <LuX className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {isAddingLabel ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLabel();
                        } else if (e.key === 'Escape') {
                          setIsAddingLabel(false);
                        }
                      }}
                      placeholder="Label..."
                      autoFocus
                      className="w-24 px-1.5 py-0.5 text-[11px] bg-surface text-content border border-border rounded"
                    />
                    <button
                      type="button"
                      onClick={handleAddLabel}
                      className="text-[11px] text-primary font-medium hover:underline cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingLabel(false)}
                      className="text-[11px] text-content-muted hover:underline cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingLabel(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-content-muted hover:text-content bg-surface border border-dashed border-border hover:border-content-muted px-2 py-0.5 rounded-md transition cursor-pointer"
                  >
                    <LuPlus className="w-3 h-3" />
                    <span>Add label</span>
                  </button>
                )}
                </fieldset>
              </div>
            </div>
          </div>

          {/* Advanced Governance / Approval Option */}
          <div className="border border-border bg-surface-muted/30 dark:bg-surface-muted/20 rounded-xl p-3.5 space-y-3 transition hover:bg-surface-muted/50">
            <div className="flex items-start gap-3">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  id="requires-approval"
                    disabled={!permitted('configureApproval')}
                    title={disabledReason('configureApproval')}
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>
              <label htmlFor="requires-approval" className="cursor-pointer select-none flex-1">
                <div className="text-xs font-semibold text-content flex items-center gap-1.5">
                  <span>Requires approval before completion</span>
                  <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[10px] font-medium px-1.5 py-0.5 rounded">
                    Strict Mode
                  </span>
                </div>
                <p className="text-[11px] text-content-muted mt-0.5">
                  Completion requires a decision by the designated eligible Project member.
                </p>
              </label>
            </div>

            {requiresApproval && (
              <div className="pl-7 pt-1 border-t border-border/50">
                <label
                  htmlFor="task-approver"
                  className="block text-xs font-medium text-content-muted mb-1"
                >
                  Designated Approver (Required)
                </label>
                <select
                  id="task-approver"
                    disabled={!permitted('configureApproval')}
                    title={disabledReason('configureApproval')}
                  value={approverMembershipId}
                  onChange={(e) => setApproverMembershipId(e.target.value)}
                  className="w-full text-xs font-medium text-content bg-surface border border-border rounded-lg py-1.5 px-3 focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
                >
                  <option value="">Choose a designated approver</option>
                  {approverMembershipId && !approvers.some(m => (m.projectMembershipId || m.id) === approverMembershipId) && <option value={approverMembershipId} disabled>Current approver (unavailable)</option>}
                  {approvers.map((m) => {
                    const memId = m.id || m.projectMembershipId || m.organizationMembershipId;
                    const name = m.user?.name || m.user?.email || 'Member';
                    return (
                      <option key={memId} value={memId}>
                        {name} ({m.role || 'Member'})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
          </fieldset>
        </form>

        {/* Modal Footer Actions */}
        <footer className="px-6 py-4 border-t border-border bg-surface-muted/40 flex items-center justify-between select-none shrink-0">
          {/* Create More Checkbox */}
          {!isEditing ? (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-content-muted hover:text-content">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
              />
              <span>Create another task</span>
            </label>
          ) : (
            <div />
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={closeEditor}
              className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-lg hover:bg-surface-muted transition-colors shadow-2xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !ready || !title.trim() || sessionRef.current?.uncertainCreate || (!permitted('editContent') && !permitted('editManagement') && !permitted('transition') && !permitted('configureApproval') && !permitted('assign'))}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 active:scale-[0.98] rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <LuCirclePlus className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? 'Saving...'
                  : isEditing
                  ? saveFeedback?.failed ? 'Retry Remaining Changes' : 'Save Changes'
                  : 'Create Task'}
              </span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default TaskFormModal;
