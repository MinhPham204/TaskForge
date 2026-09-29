import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LuPlus, LuUsersRound, LuArrowRight, LuUsers } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import Avatar from '../../components/Avatar.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetTeamsQuery, useCreateTeamMutation } from '../../services/teamApi';

const TEAM_THEMES = [
  { border: 'border-blue-200 dark:border-blue-900/60', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300', accent: 'bg-blue-500' },
  { border: 'border-indigo-200 dark:border-indigo-900/60', bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300', accent: 'bg-indigo-500' },
  { border: 'border-emerald-200 dark:border-emerald-900/60', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', accent: 'bg-emerald-500' },
  { border: 'border-violet-200 dark:border-violet-900/60', bg: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300', accent: 'bg-violet-500' },
  { border: 'border-amber-200 dark:border-amber-900/60', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300', accent: 'bg-amber-500' },
  { border: 'border-rose-200 dark:border-rose-900/60', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300', accent: 'bg-rose-500' },
];

function getTeamMonogram(name = '') {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'TM';
}

function getTeamTheme(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return TEAM_THEMES[Math.abs(hash) % TEAM_THEMES.length];
}

const TeamListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useUserAuth();
  const isOrgAdmin = role === 'owner' || role === 'admin';
  const shouldCreate = searchParams.get('create') === 'true';

  const { data: teams = [], isLoading, isError, error, refetch } = useGetTeamsQuery();
  const [createTeam, { isLoading: isCreating }] = useCreateTeamMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (shouldCreate && isOrgAdmin) {
      setIsModalOpen(true);
    }
  }, [shouldCreate, isOrgAdmin]);

  const handleOpenModal = () => {
    setName('');
    setDescription('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isCreating) return;
    setIsModalOpen(false);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Team name is required');
      return;
    }

    try {
      const created = await createTeam({
        name: trimmedName,
        description: description.trim(),
      }).unwrap();
      setIsModalOpen(false);
      if (created?.id) {
        navigate(`/teams/${created.id}`);
      }
    } catch (err) {
      setFormError(err?.data?.message || err?.message || 'Failed to create team');
    }
  };

  return (
    <DashboardLayout activeMenu="/teams">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">Teams</h1>
            <p className="text-sm text-content-muted mt-1">
              Organize members into reusable collaboration groups across your organization.
            </p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <LuPlus className="w-4 h-4" />
              Create Team
            </button>
          )}
        </div>

        {/* Query state handling */}
        {isLoading && <LoadingState message="Loading teams..." />}

        {isError && (
          <ErrorState
            title="Unable to load teams"
            message={error?.data?.message || 'Failed to fetch teams in this workspace.'}
            onRetry={refetch}
          />
        )}

        {!isLoading && !isError && teams.length === 0 && (
          <EmptyState
            icon={LuUsersRound}
            title="No teams yet"
            description={
              isOrgAdmin
                ? 'Create the first team to begin organizing workspace participants.'
                : 'No teams have been created in this workspace yet.'
            }
            action={
              isOrgAdmin ? (
                <button
                  type="button"
                  onClick={handleOpenModal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <LuPlus className="w-4 h-4" />
                  Create Team
                </button>
              ) : null
            }
          />
        )}

        {!isLoading && !isError && teams.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {teams.map((team) => {
              const theme = getTeamTheme(team.id);
              const monogram = getTeamMonogram(team.name);

              return (
                <div
                  key={team.id}
                  onClick={() => navigate(`/teams/${team.id}`)}
                  className="group relative rounded-xl border border-border bg-surface shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-primary/40 cursor-pointer flex flex-col justify-between overflow-hidden"
                >
                  {/* Subtle top accent bar */}
                  <div className={`h-1 w-full ${theme.accent}`} />

                  <div className="p-5">
                    {/* Header: Monogram/Avatar + Name + Arrow */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {team.logoUrl ? (
                          <Avatar
                            src={team.logoUrl}
                            name={team.name}
                            className="h-10 w-10 rounded-lg border border-border shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs tracking-wider border shrink-0 ${theme.bg} ${theme.border}`}
                          >
                            {monogram}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h2 className="text-base font-semibold text-content group-hover:text-primary transition-colors truncate">
                            {team.name}
                          </h2>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-content-muted">
                            <LuUsers className="w-3 h-3 opacity-70" />
                            <span>Team Space</span>
                          </div>
                        </div>
                      </div>
                      <span className="p-1 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0">
                        <LuArrowRight className="w-4 h-4" />
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-content-muted line-clamp-2 leading-relaxed">
                      {team.description || 'No description provided for this team.'}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-border/50 text-[11px] text-content-muted flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>Active</span>
                    </span>
                    <span className="font-medium text-primary group-hover:underline">
                      View team →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Team Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title="Create New Team"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {formError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {formError}
              </div>
            )}
            <div>
              <label htmlFor="team-name" className="block text-xs font-semibold text-content mb-1">
                Team Name <span className="text-red-500">*</span>
              </label>
              <input
                id="team-name"
                name="teamName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Frontend Engineering"
                required
                className="w-full px-3 py-2 text-sm bg-surface text-content placeholder:text-content-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="team-desc" className="block text-xs font-semibold text-content mb-1">
                Description (optional)
              </label>
              <textarea
                id="team-desc"
                name="teamDesc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the primary role and responsibilities of this team..."
                className="w-full px-3 py-2 text-sm bg-surface text-content placeholder:text-content-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isCreating}
                className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-md hover:bg-surface-muted disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCreating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default TeamListPage;
