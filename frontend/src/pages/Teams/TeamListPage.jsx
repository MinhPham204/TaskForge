import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPlus, LuUsersRound, LuArrowRight } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetTeamsQuery, useCreateTeamMutation } from '../../services/teamApi';

const TeamListPage = () => {
  const navigate = useNavigate();
  const { role } = useUserAuth();
  const isOrgAdmin = role === 'owner' || role === 'admin';

  const { data: teams = [], isLoading, isError, error, refetch } = useGetTeamsQuery();
  const [createTeam, { isLoading: isCreating }] = useCreateTeamMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

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
      <div className="my-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
            <p className="text-sm text-gray-500 mt-1">
              Organize members into reusable collaboration groups across your organization.
            </p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
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
            {teams.map((team) => (
              <div
                key={team.id}
                onClick={() => navigate(`/teams/${team.id}`)}
                className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-base font-semibold text-gray-900 hover:text-primary transition-colors">
                      {team.name}
                    </h2>
                    <span className="p-1 text-gray-400 hover:text-primary transition-colors">
                      <LuArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-3 mb-4 leading-relaxed">
                    {team.description || 'No description provided.'}
                  </p>
                </div>
                <div className="pt-3 border-t border-gray-50 text-[11px] text-gray-400 flex items-center justify-between">
                  <span>Created {new Date(team.createdAt).toLocaleDateString()}</span>
                  <span className="text-primary font-medium">View details</span>
                </div>
              </div>
            ))}
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
              <label htmlFor="team-name" className="block text-xs font-semibold text-gray-700 mb-1">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="team-desc" className="block text-xs font-semibold text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="team-desc"
                name="teamDesc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the primary role and responsibilities of this team..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isCreating}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
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
