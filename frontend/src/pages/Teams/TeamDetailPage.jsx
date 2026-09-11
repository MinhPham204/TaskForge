import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LuArrowLeft,
  LuPlus,
  LuPencil,
  LuArchive,
  LuUser,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Breadcrumb from '../../components/Breadcrumb';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import {
  useGetTeamByIdQuery,
  useUpdateTeamMutation,
  useArchiveTeamMutation,
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
} from '../../services/teamApi';

const TeamDetailPage = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { role } = useUserAuth();
  const isOrgAdmin = role === 'owner' || role === 'admin';

  const {
    data: team,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetTeamByIdQuery(teamId);

  const [updateTeam, { isLoading: isUpdating }] = useUpdateTeamMutation();
  const [archiveTeam, { isLoading: isArchiving }] = useArchiveTeamMutation();
  const [addTeamMember, { isLoading: isAddingMember }] = useAddTeamMemberMutation();
  const [removeTeamMember, { isLoading: isRemovingMember }] = useRemoveTeamMemberMutation();

  // Modals state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');

  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [membershipId, setMembershipId] = useState('');
  const [addMemberError, setAddMemberError] = useState('');

  const [memberToRemove, setMemberToRemove] = useState(null);
  const [removeError, setRemoveError] = useState('');

  const openEditModal = () => {
    if (!team) return;
    setEditName(team.name || '');
    setEditDescription(team.description || '');
    setEditError('');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Team name is required');
      return;
    }
    try {
      await updateTeam({
        teamId,
        name: trimmed,
        description: editDescription.trim(),
      }).unwrap();
      setIsEditOpen(false);
    } catch (err) {
      setEditError(err?.data?.message || err?.message || 'Failed to update team');
    }
  };

  const handleArchiveConfirm = async () => {
    setArchiveError('');
    try {
      await archiveTeam(teamId).unwrap();
      setIsArchiveOpen(false);
      navigate('/teams');
    } catch (err) {
      setArchiveError(err?.data?.message || err?.message || 'Failed to archive team');
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    setAddMemberError('');
    const trimmedId = membershipId.trim();
    if (!trimmedId) {
      setAddMemberError('Organization Membership ID is required');
      return;
    }
    try {
      await addTeamMember({
        teamId,
        organizationMembershipId: trimmedId,
      }).unwrap();
      setIsAddMemberOpen(false);
      setMembershipId('');
    } catch (err) {
      setAddMemberError(err?.data?.message || err?.message || 'Failed to add member to team');
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!memberToRemove) return;
    setRemoveError('');
    try {
      await removeTeamMember({
        teamId,
        organizationMembershipId: memberToRemove.organizationMembershipId,
      }).unwrap();
      setMemberToRemove(null);
    } catch (err) {
      setRemoveError(err?.data?.message || err?.message || 'Failed to remove member from team');
    }
  };

  const breadcrumbs = [
    { label: 'Teams', href: '/teams' },
    { label: team?.name || 'Team Details' },
  ];

  return (
    <DashboardLayout activeMenu="/teams">
      <div className="my-6">
        <Breadcrumb items={breadcrumbs} />

        {isLoading && <LoadingState message="Loading team details..." />}

        {isError && (
          <ErrorState
            title="Unable to load team"
            message={error?.data?.message || 'The requested team could not be found or access was restricted.'}
            onRetry={refetch}
          />
        )}

        {!isLoading && !isError && team && (
          <>
            {/* Team Summary Header Card */}
            <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs mb-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => navigate('/teams')}
                    aria-label="Back to teams list"
                    className="mt-1 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <LuArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
                    <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
                      {team.description || 'No description provided for this team.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>Created {new Date(team.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-gray-600 font-medium">
                        <LuUsers className="w-3.5 h-3.5 text-primary" />
                        {team.members?.length || 0} active member{(team.members?.length || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {isOrgAdmin && (
                  <div className="flex items-center gap-2 self-start">
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <LuPencil className="w-3.5 h-3.5" />
                      Edit Team
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveError('');
                        setIsArchiveOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <LuArchive className="w-3.5 h-3.5" />
                      Archive
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Team Members Section */}
            <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
              <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Active workspace members participating in this team.
                  </p>
                </div>
                {isOrgAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMembershipId('');
                      setAddMemberError('');
                      setIsAddMemberOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
                  >
                    <LuPlus className="w-4 h-4" />
                    Add Member
                  </button>
                )}
              </div>

              {(!team.members || team.members.length === 0) ? (
                <EmptyState
                  icon={LuUser}
                  title="No members yet"
                  description={
                    isOrgAdmin
                      ? 'Add active workspace members to this team.'
                      : 'No members are currently assigned to this team.'
                  }
                  action={
                    isOrgAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMembershipId('');
                          setAddMemberError('');
                          setIsAddMemberOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                      >
                        <LuPlus className="w-4 h-4" />
                        Add Member
                      </button>
                    ) : null
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Member</th>
                        <th className="py-3 px-4">Organization Role</th>
                        <th className="py-3 px-4">Joined Team</th>
                        {isOrgAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {team.members.map((member) => (
                        <tr key={member.organizationMembershipId} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={member.user?.profileImageUrl || '/default-avatar.png'}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover bg-gray-200 border border-gray-100"
                              />
                              <div>
                                <p className="font-medium text-gray-900 text-sm">
                                  {member.user?.name || 'Unnamed User'}
                                </p>
                                <p className="text-xs text-gray-500">{member.user?.email || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                              {member.organizationRole || 'MEMBER'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-500">
                            {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
                          </td>
                          {isOrgAdmin && (
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveError('');
                                  setMemberToRemove(member);
                                }}
                                aria-label={`Remove ${member.user?.name || 'member'} from team`}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              >
                                <LuTrash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Edit Team Modal */}
        <Modal isOpen={isEditOpen} onClose={() => !isUpdating && setIsEditOpen(false)} title="Edit Team">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {editError}
              </div>
            )}
            <div>
              <label htmlFor="edit-team-name" className="block text-xs font-semibold text-gray-700 mb-1">
                Team Name <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-team-name"
                name="teamName"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="edit-team-desc" className="block text-xs font-semibold text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="edit-team-desc"
                name="teamDesc"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={isUpdating}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Archive Confirmation Modal */}
        <Modal
          isOpen={isArchiveOpen}
          onClose={() => !isArchiving && setIsArchiveOpen(false)}
          title="Archive Team"
        >
          <div className="space-y-4">
            {archiveError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {archiveError}
              </div>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">
              Are you sure you want to archive <strong>{team?.name}</strong>? Archiving removes the team from active list while preserving past historical activity.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                disabled={isArchiving}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveConfirm}
                disabled={isArchiving}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isArchiving ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Add Member Modal */}
        <Modal
          isOpen={isAddMemberOpen}
          onClose={() => !isAddingMember && setIsAddMemberOpen(false)}
          title="Add Team Member"
        >
          <form onSubmit={handleAddMemberSubmit} className="space-y-4">
            {addMemberError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {addMemberError}
              </div>
            )}
            <div>
              <label htmlFor="member-org-id" className="block text-xs font-semibold text-gray-700 mb-1">
                Organization Membership ID <span className="text-red-500">*</span>
              </label>
              <input
                id="member-org-id"
                name="membershipId"
                type="text"
                value={membershipId}
                onChange={(e) => setMembershipId(e.target.value)}
                placeholder="UUID format (e.g. 123e4567-e89b-12d3-a456-426614174000)"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary font-mono text-xs"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Member must possess an active membership in this organization.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsAddMemberOpen(false)}
                disabled={isAddingMember}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingMember}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isAddingMember ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Remove Member Confirmation Modal */}
        <Modal
          isOpen={!!memberToRemove}
          onClose={() => !isRemovingMember && setMemberToRemove(null)}
          title="Remove Team Member"
        >
          <div className="space-y-4">
            {removeError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {removeError}
              </div>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">
              Are you sure you want to remove <strong>{memberToRemove?.user?.name || 'this member'}</strong> from <strong>{team?.name}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={isRemovingMember}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveMemberConfirm}
                disabled={isRemovingMember}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isRemovingMember ? 'Removing...' : 'Confirm Removal'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default TeamDetailPage;
