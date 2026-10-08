import React, { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  LuArrowRight,
  LuBuilding,
  LuCamera,
  LuCheck,
  LuInfo,
} from 'react-icons/lu';
import Navbar from '../../components/layouts/Navbar';
import {
  useCreateOrganizationMutation,
  useCreateOrganizationInvitationMutation,
} from '../../services/organizationApi.js';
import {
  fetchMyOrganizations,
  selectActiveOrganizationId,
  switchOrganization,
} from '../../store/authSlice.js';

const FOCUS_OPTIONS = [
  {
    id: 'projects',
    title: 'Project & Task Tracking',
    description: 'Manage milestones, deadlines, and daily assignments.',
  },
  {
    id: 'collaboration',
    title: 'Cross-Functional Collaboration',
    description: 'Coordinate across multiple departments and initiatives.',
  },
  {
    id: 'clients',
    title: 'Client & Partner Work',
    description: 'Deliver client deliverables, contracts, and shared portals.',
  },
  {
    id: 'operations',
    title: 'Operational & Ongoing Workflows',
    description: 'Run recurring processes, team routines, and roadmaps.',
  },
];

const getInitials = (str) => {
  if (!str || !str.trim()) return 'WS';
  const parts = str.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const generateSlug = (val) => {
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
};

const WorkspaceOnboarding = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const activeOrganizationId = useSelector(selectActiveOrganizationId);

  // Form states
  const [name, setName] = useState('Acme Studio');
  const [slug, setSlug] = useState('acmestudio');
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [workspaceFocus, setWorkspaceFocus] = useState('projects');
  const [inviteEmails, setInviteEmails] = useState('');
  const [domainAutoJoin, setDomainAutoJoin] = useState(true);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  // Mutations
  const [createOrganization, { isLoading }] = useCreateOrganizationMutation();
  const [createInvitation] = useCreateOrganizationInvitationMutation();

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugTouched) {
      setSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (e) => {
    setIsSlugTouched(true);
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 25));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Logo file size must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setLogoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCancel = () => {
    if (activeOrganizationId) {
      navigate(-1);
    } else {
      setName('');
      setSlug('');
      setIsSlugTouched(false);
      setLogoPreview(null);
      setLogoUrl(null);
      setInviteEmails('');
      setError('');
    }
  };

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('Enter a workspace name.');
      return;
    }

    setError('');
    try {
      const payload = {
        name: normalizedName,
        ...(logoUrl ? { logoUrl } : {}),
      };
      const result = await createOrganization(payload).unwrap();
      const organizationId = result.organizationId;
      await dispatch(fetchMyOrganizations());
      if (organizationId) {
        dispatch(switchOrganization(organizationId));

        // If invitations were specified, dispatch invite requests
        if (inviteEmails.trim()) {
          const emails = inviteEmails
            .split(',')
            .map((email) => email.trim())
            .filter((email) => Boolean(email) && email.includes('@'));

          for (const email of emails) {
            try {
              await createInvitation({
                organizationId,
                email,
                role: 'MEMBER',
              }).unwrap();
            } catch (invErr) {
              console.warn('Failed to send invite during onboarding:', email, invErr);
            }
          }
        }
      }
      toast.success('Workspace created successfully!');
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(
        requestError?.data?.message || 'Unable to create the workspace. Please try again.',
      );
    }
  };

  const derivedDomain = slug.trim() ? `${slug.trim()}.io` : 'acmestudio.io';

  return (
    <div className="min-h-screen bg-app-canvas flex flex-col text-content selection:bg-primary/20 selection:text-primary">
      {/* Kept Navbar at top as specified by user instructions */}
      <Navbar />

      {/* Main Content Container with Subtle Radial Canvas Glow */}
      <main className="canvas-glow flex-1 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[860px] mx-auto space-y-8">
          {/* Header Intro Banner */}
          <section className="text-center space-y-2.5" data-purpose="page-title-banner">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-primary/10 text-primary border border-primary/20 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Get Started
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-content">
              {activeOrganizationId ? 'Create a workspace' : 'Choose a workspace'}
            </h1>
            <p className="text-sm sm:text-base text-content-muted max-w-xl mx-auto leading-relaxed">
              Create an additional workspace for a new team, client, or initiative. Keep projects, roadmaps, and assets neatly separated.
            </p>
          </section>

          {/* Main Workspace Creation Card */}
          <section
            className="bg-surface rounded-2xl border border-border shadow-sm p-6 sm:p-9 relative overflow-hidden"
            data-purpose="workspace-form-card"
          >
            <form className="space-y-8" onSubmit={handleCreateWorkspace}>
              {/* Identity & Branding Subsection */}
              <div className="space-y-5">
                <div className="border-b border-border pb-3">
                  <h2 className="text-base font-semibold text-content">Workspace identity</h2>
                  <p className="text-xs text-content-muted mt-0.5">Customize your brand presence inside the platform.</p>
                </div>

                {/* Avatar + Name / URL Flex Section */}
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  {/* Workspace Logo Upload / Picker */}
                  <div className="flex flex-col items-center sm:items-start space-y-2">
                    <label className="text-xs font-medium text-content-muted">Workspace Logo</label>
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload workspace logo"
                    >
                      {logoPreview ? (
                        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-border shadow-inner group-hover:border-primary transition-all">
                          <img
                            src={logoPreview}
                            alt="Workspace Logo"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary text-white flex items-center justify-center font-bold text-2xl shadow-inner border-2 border-dashed border-border group-hover:border-primary transition-all select-none"
                          id="workspace-logo-preview"
                        >
                          {getInitials(name)}
                        </div>
                      )}

                      <div className="absolute inset-0 bg-slate-950/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <LuCamera className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileSelect}
                    />

                    <div className="flex items-center gap-2">
                      <button
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload file
                      </button>
                      {logoPreview && (
                        <button
                          className="text-[11px] font-medium text-danger-content hover:underline cursor-pointer"
                          type="button"
                          onClick={() => {
                            setLogoPreview(null);
                            setLogoUrl(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Name & Custom Subdomain Fields */}
                  <div className="flex-1 w-full space-y-4">
                    {/* Workspace Name */}
                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="workspace-name">
                        Workspace name <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="block w-full rounded-lg border border-border bg-surface text-content text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-shadow placeholder:text-content-muted/60 py-2.5 px-3.5 outline-none"
                        id="workspace-name"
                        name="workspace-name"
                        placeholder="e.g. Acme Corporation or Design Team"
                        required
                        type="text"
                        value={name}
                        onChange={handleNameChange}
                      />
                    </div>

                    {/* Workspace URL / Slug */}
                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="workspace-slug">
                        Workspace URL
                      </label>
                      <div className="flex rounded-lg border border-border overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                        <span className="inline-flex items-center px-3 border-r border-border bg-surface-muted text-content-muted text-xs font-mono select-none">
                          taskforge.dev/
                        </span>
                        <input
                          className="flex-1 min-w-0 block w-full bg-surface text-content text-sm font-mono py-2.5 px-3 outline-none"
                          id="workspace-slug"
                          name="workspace-slug"
                          type="text"
                          value={slug}
                          onChange={handleSlugChange}
                          placeholder="acmestudio"
                        />
                      </div>
                      {slug.trim().length >= 2 && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <LuCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>URL is available</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scope & Classification */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div>
                  <h2 className="text-base font-semibold text-content">Workspace focus</h2>
                  <p className="text-xs text-content-muted mt-0.5">Choose how your team collaborates best.</p>
                </div>

                {/* Radio Card Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {FOCUS_OPTIONS.map((option) => {
                    const isSelected = workspaceFocus === option.id;
                    return (
                      <div
                        key={option.id}
                        onClick={() => setWorkspaceFocus(option.id)}
                        className={`flex items-start p-3.5 border rounded-xl cursor-pointer transition-all select-none ${
                          isSelected
                            ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-xs'
                            : 'border-border bg-surface hover:border-border/80'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border mt-0.5 mr-3 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary'
                              : 'border-border bg-surface'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-content block">
                            {option.title}
                          </span>
                          <span className="text-[11px] text-content-muted">
                            {option.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Teammates Invite & Permissions */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div>
                  <h2 className="text-base font-semibold text-content">
                    Invite colleagues <span className="text-xs font-normal text-content-muted ml-1">(Optional)</span>
                  </h2>
                  <p className="text-xs text-content-muted mt-0.5">Send immediate invites or configure auto-join rules.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="invite-emails">
                      Email addresses
                    </label>
                    <div className="relative">
                      <input
                        className="block w-full rounded-lg border border-border bg-surface text-content text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-content-muted/60 py-2.5 pl-3.5 pr-28 outline-none"
                        id="invite-emails"
                        placeholder="sarah@acmestudio.io, dev-lead@acmestudio.io"
                        type="text"
                        value={inviteEmails}
                        onChange={(e) => setInviteEmails(e.target.value)}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <span className="text-[11px] text-content-muted">Comma separated</span>
                      </div>
                    </div>
                  </div>

                  {/* Auto-join toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-surface-muted/70 border border-border rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <LuBuilding className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-content block">Domain Auto-Join</span>
                        <span className="text-[11px] text-content-muted">
                          Allow anyone with an <strong className="text-content">@{derivedDomain}</strong> email address to join without an invite.
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={domainAutoJoin}
                      onClick={() => setDomainAutoJoin(!domainAutoJoin)}
                      className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-4 ${
                        domainAutoJoin ? 'bg-primary' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          domainAutoJoin ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="rounded-lg border border-danger-border bg-danger-surface p-3 text-xs text-danger-content">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                <button
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-border text-xs font-semibold text-content-muted hover:bg-surface-muted hover:text-content transition-colors text-center cursor-pointer"
                  type="button"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-semibold shadow-md shadow-primary/20 transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 cursor-pointer"
                    type="submit"
                    disabled={isLoading}
                  >
                    <span>{isLoading ? 'Creating workspace…' : 'Create workspace'}</span>
                    {!isLoading && <LuArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Footer Info */}
          <footer className="text-center pb-8 pt-2">
            <p className="text-xs text-content-muted flex items-center justify-center gap-1.5">
              <LuInfo className="w-3.5 h-3.5 text-content-muted shrink-0" />
              Need to manage multiple organizations? You can switch workspaces anytime from the main sidebar.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default WorkspaceOnboarding;
