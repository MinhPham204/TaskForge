import React, { useState } from 'react';
import Select from 'react-select';
import {
  LuPlus,
  LuTrash2,
  LuUsers,
  LuShield,
  LuUserCheck,
} from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { EmptyState } from '../../../components/common/PageState';
import {
  useAddProjectTeamMutation,
  useRemoveProjectTeamMutation,
  useAddProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useGetProjectTeamsQuery,
  useGetProjectMembersQuery,
} from '../../../services/projectApi';
import { useGetTeamsQuery, useLazyGetTeamByIdQuery } from '../../../services/teamApi';

const ProjectParticipantsTab = ({
  projectId,
  canManage,
}) => {
  const { data: allOrgTeams = [] } = useGetTeamsQuery();
  const { data: projectTeams = [] } = useGetProjectTeamsQuery(projectId);
  const { data: projectMembers = [] } = useGetProjectMembersQuery(projectId);
  const [loadTeam] = useLazyGetTeamByIdQuery();

  const [addProjectTeam, { isLoading: isAddingTeam }] = useAddProjectTeamMutation();
  const [removeProjectTeam, { isLoading: isRemovingTeam }] = useRemoveProjectTeamMutation();
  const [addProjectMember, { isLoading: isAddingMember }] = useAddProjectMemberMutation();
  const [removeProjectMember, { isLoading: isRemovingMember }] = useRemoveProjectMemberMutation();

  // Add Team Modal
  const [isAddTeamOpen, setIsAddTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [addTeamError, setAddTeamError] = useState('');

  // Remove Team Modal
  const [teamToRemove, setTeamToRemove] = useState(null);
  const [removeTeamError, setRemoveTeamError] = useState('');

  // Add Member Modal
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [isLoadingEligibleMembers, setIsLoadingEligibleMembers] = useState(false);
  const [memberRole, setMemberRole] = useState('CONTRIBUTOR');
  const [addMemberError, setAddMemberError] = useState('');

  // Remove Member Modal
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [removeMemberError, setRemoveMemberError] = useState('');

  const availableTeamsToAdd = allOrgTeams.filter(
    (orgTeam) => !projectTeams.some((pt) => pt.id === orgTeam.id)
  );

  React.useEffect(() => {
    let isCurrent = true;
    if (!isAddMemberOpen) return undefined;

    const teamIds = projectTeams.map((team) => team.id).filter(Boolean);
    if (teamIds.length === 0) {
      setEligibleMembers([]);
      return undefined;
    }

    setIsLoadingEligibleMembers(true);
    Promise.all(teamIds.map((teamId) => loadTeam(teamId).unwrap()))
      .then((teams) => {
        if (!isCurrent) return;
        const existingMemberIds = new Set(
          projectMembers.map((member) => member.organizationMembershipId)
        );
        const uniqueMembers = new Map();
        teams.flatMap((team) => team.members || []).forEach((member) => {
          if (!existingMemberIds.has(member.organizationMembershipId)) {
            uniqueMembers.set(member.organizationMembershipId, member);
          }
        });
        setEligibleMembers([...uniqueMembers.values()]);
      })
      .catch(() => {
        if (isCurrent) setEligibleMembers([]);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingEligibleMembers(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isAddMemberOpen, loadTeam, projectMembers, projectTeams]);

  const memberOptions = React.useMemo(
    () => eligibleMembers.map((member) => ({
      value: member.organizationMembershipId,
      label: member.user?.name || member.user?.email || 'Unnamed member',
      email: member.user?.email || '',
      organizationRole: member.organizationRole,
    })),
    [eligibleMembers]
  );

  const handleAddTeamSubmit = async (e) => {
    e.preventDefault();
    setAddTeamError('');
    if (!selectedTeamId) {
      setAddTeamError('Please select a team to add');
      return;
    }
    try {
      await addProjectTeam({ projectId, teamId: selectedTeamId }).unwrap();
      setIsAddTeamOpen(false);
      setSelectedTeamId('');
    } catch (err) {
      setAddTeamError(err?.data?.message || err?.message || 'Failed to add participating team');
    }
  };

  const handleRemoveTeamConfirm = async () => {
    if (!teamToRemove) return;
    setRemoveTeamError('');
    try {
      await removeProjectTeam({ projectId, teamId: teamToRemove.id }).unwrap();
      setTeamToRemove(null);
    } catch (err) {
      setRemoveTeamError(err?.data?.message || err?.message || 'Failed to remove participating team');
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    setAddMemberError('');
    if (!selectedMember) {
      setAddMemberError('Select a member to add');
      return;
    }
    try {
      await addProjectMember({
        projectId,
        organizationMembershipId: selectedMember.value,
        role: memberRole,
      }).unwrap();
      setIsAddMemberOpen(false);
      setSelectedMember(null);
    } catch (err) {
      setAddMemberError(err?.data?.message || err?.message || 'Failed to add project member');
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!memberToRemove) return;
    setRemoveMemberError('');
    try {
      await removeProjectMember({
        projectId,
        organizationMembershipId: memberToRemove.organizationMembershipId,
      }).unwrap();
      setMemberToRemove(null);
    } catch (err) {
      setRemoveMemberError(err?.data?.message || err?.message || 'Failed to remove project member');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Participating Teams Section */}
      <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Participating Teams</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Teams collaborating on this project. Project members must belong to at least one participating team.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setSelectedTeamId('');
                setAddTeamError('');
                setIsAddTeamOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5" />
              Add Team
            </button>
          )}
        </div>

        {projectTeams.length === 0 ? (
          <EmptyState
            icon={LuUsers}
            title="No participating teams"
            description="No teams are currently participating in this project."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectTeams.map((pt) => (
              <div
                key={pt.id}
                className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 flex items-start justify-between gap-3"
              >
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{pt.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {pt.description || 'No description.'}
                  </p>
                  <span className="text-[10px] text-gray-400 block mt-2">
                    Added {new Date(pt.addedAt).toLocaleDateString()}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveTeamError('');
                      setTeamToRemove(pt);
                    }}
                    aria-label={`Remove team ${pt.name}`}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                  >
                    <LuTrash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Project Members Section */}
      <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Project Members</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Qualified individual members holding Project Manager or Contributor roles.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setSelectedMember(null);
                setEligibleMembers([]);
                setMemberRole('CONTRIBUTOR');
                setAddMemberError('');
                setIsAddMemberOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5" />
              Add Member
            </button>
          )}
        </div>

        {projectMembers.length === 0 ? (
          <EmptyState
            icon={LuUserCheck}
            title="No project members"
            description="No members are assigned to this project yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Project Role</th>
                  <th className="py-3 px-4">Organization Role</th>
                  <th className="py-3 px-4">Added Date</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projectMembers.map((pm) => (
                  <tr key={pm.organizationMembershipId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={pm.user?.profileImageUrl || '/default-avatar.png'}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover bg-gray-200 border border-gray-100"
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {pm.user?.name || 'Unnamed Member'}
                          </p>
                          <p className="text-xs text-gray-500">{pm.user?.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                          pm.role === 'PROJECT_MANAGER'
                            ? 'bg-blue-50 text-primary border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {pm.role === 'PROJECT_MANAGER' ? (
                          <>
                            <LuShield className="w-3 h-3" /> Project Manager
                          </>
                        ) : (
                          <>
                            <LuUserCheck className="w-3 h-3" /> Contributor
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {pm.organizationRole || 'MEMBER'}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {pm.addedAt ? new Date(pm.addedAt).toLocaleDateString() : '—'}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveMemberError('');
                            setMemberToRemove(pm);
                          }}
                          aria-label={`Remove ${pm.user?.name || 'member'} from project`}
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

      {/* Add Team Modal */}
      <Modal
        isOpen={isAddTeamOpen}
        onClose={() => !isAddingTeam && setIsAddTeamOpen(false)}
        title="Add Participating Team"
      >
        <form onSubmit={handleAddTeamSubmit} className="space-y-4">
          {addTeamError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {addTeamError}
            </div>
          )}
          <div>
            <label htmlFor="team-select" className="block text-xs font-semibold text-gray-700 mb-1">
              Select Team <span className="text-red-500">*</span>
            </label>
            {availableTeamsToAdd.length === 0 ? (
              <p className="text-xs text-gray-500 italic p-3 bg-gray-50 border rounded-md">
                All active workspace teams are already participating in this project.
              </p>
            ) : (
              <select
                id="team-select"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">-- Select an active workspace team --</option>
                {availableTeamsToAdd.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddTeamOpen(false)}
              disabled={isAddingTeam}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAddingTeam || availableTeamsToAdd.length === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isAddingTeam ? 'Adding...' : 'Add Team'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Remove Team Modal */}
      <Modal
        isOpen={!!teamToRemove}
        onClose={() => !isRemovingTeam && setTeamToRemove(null)}
        title="Remove Participating Team"
      >
        <div className="space-y-4">
          {removeTeamError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {removeTeamError}
            </div>
          )}
          <p className="text-sm text-gray-600 leading-relaxed">
            Are you sure you want to remove <strong>{teamToRemove?.name}</strong> from this project? Removal is guarded: it will be rejected if it leaves members orphaned without another participating team, or if it is the project's final participating team.
          </p>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setTeamToRemove(null)}
              disabled={isRemovingTeam}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveTeamConfirm}
              disabled={isRemovingTeam}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRemovingTeam ? 'Removing...' : 'Confirm Remove'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddMemberOpen}
        onClose={() => !isAddingMember && setIsAddMemberOpen(false)}
        title="Add Project Member"
      >
        <form onSubmit={handleAddMemberSubmit} className="space-y-4">
          {addMemberError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {addMemberError}
            </div>
          )}
          <div>
            <label htmlFor="project-member-select" className="block text-xs font-semibold text-gray-700 mb-1">
              Project Member <span className="text-red-500">*</span>
            </label>
            <Select
              inputId="project-member-select"
              value={selectedMember}
              onChange={setSelectedMember}
              options={memberOptions}
              isLoading={isLoadingEligibleMembers}
              isDisabled={isLoadingEligibleMembers || memberOptions.length === 0}
              placeholder={isLoadingEligibleMembers ? 'Loading eligible members...' : 'Search by name or email'}
              noOptionsMessage={() => 'No eligible members found in participating teams'}
              formatOptionLabel={(option) => (
                <div>
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.email}{option.organizationRole ? ` · ${option.organizationRole}` : ''}</p>
                </div>
              )}
              classNamePrefix="project-member-picker"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Only active members of a participating team are available. Add a team first if the person is not listed.
            </p>
          </div>
          <div>
            <label htmlFor="member-role" className="block text-xs font-semibold text-gray-700 mb-1">
              Project Role <span className="text-red-500">*</span>
            </label>
            <select
              id="member-role"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="CONTRIBUTOR">Contributor</option>
              <option value="PROJECT_MANAGER">Project Manager</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsAddMemberOpen(false);
                setSelectedMember(null);
              }}
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

      {/* Remove Member Modal */}
      <Modal
        isOpen={!!memberToRemove}
        onClose={() => !isRemovingMember && setMemberToRemove(null)}
        title="Remove Project Member"
      >
        <div className="space-y-4">
          {removeMemberError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {removeMemberError}
            </div>
          )}
          <p className="text-sm text-gray-600 leading-relaxed">
            Are you sure you want to remove <strong>{memberToRemove?.user?.name || 'this member'}</strong> from this project? Removal will be rejected if this is the last active Project Manager in an Active project.
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
              {isRemovingMember ? 'Removing...' : 'Confirm Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectParticipantsTab;
