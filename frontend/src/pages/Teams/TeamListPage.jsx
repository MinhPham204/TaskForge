import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LuPlus, LuUsers, LuLayoutGrid, LuList } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import SystemStatusBar from '../../components/common/SystemStatusBar';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetTeamsQuery, useCreateTeamMutation } from '../../services/teamApi';
import TeamCard from './components/TeamCard';
import TeamListView from './components/TeamListView';
import TeamOverviewSidebar from './components/TeamOverviewSidebar';
import TeamFilterStrip from './components/TeamFilterStrip';
import CreateTeamModal from './components/CreateTeamModal';
import InviteOrgMemberModal from './components/InviteOrgMemberModal';

const KEYBOARD_SHORTCUTS = [{ key: 'C', desc: 'Create new team' }];

const TeamListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, activeOrganization, activeOrganizationId } = useUserAuth();
  const canCreateTeam = hasPermission('team.create');
  const canInvite = hasPermission('org.members.invite');

  const { data: teams = [], isLoading, isError, error, refetch } = useGetTeamsQuery();
  const [createTeam, { isLoading: isCreating }] = useCreateTeamMutation();

  const [viewMode, setViewMode] = useState('grid');
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  useEffect(() => {
    setIsModalOpen(canCreateTeam && searchParams.get('create') === 'true');
  }, [canCreateTeam, searchParams, activeOrganizationId]);
  useEffect(() => {
    setIsInviteModalOpen(false);
  }, [canInvite, activeOrganizationId]);

  const filterTabs = useMemo(() => {
    const isCross = (t) => t.name?.toLowerCase().includes('cross') || t.isCrossFunctional;
    const deptCount = teams.filter((t) => !isCross(t)).length;
    const crossCount = teams.filter(isCross).length;
    return [
      { id: 'ALL', label: 'All Teams', count: teams.length },
      { id: 'DEPARTMENTS', label: 'Departments', count: deptCount },
      { id: 'CROSS_FUNCTIONAL', label: 'Cross-functional', count: crossCount },
    ];
  }, [teams]);

  const filteredTeams = useMemo(() => {
    const isCross = (t) => t.name?.toLowerCase().includes('cross') || t.isCrossFunctional;
    return teams.filter((t) => {
      if (activeTab === 'DEPARTMENTS' && isCross(t)) return false;
      if (activeTab === 'CROSS_FUNCTIONAL' && !isCross(t)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [teams, activeTab, searchQuery]);

  const totalMembers = useMemo(
    () => teams.reduce((acc, t) => acc + (t.membersCount || t.members?.length || 4), 0),
    [teams]
  );

  const handleCreateTeamSubmit = async (payload) => {
    if (!canCreateTeam) return;
    const created = await createTeam(payload).unwrap();
    if (created?.id) navigate(`/teams/${created.id}`);
    return created;
  };

  return (
    <DashboardLayout activeMenu="/teams">
      <div className="space-y-5 pb-12 select-none">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
              <Link to="/dashboard" className="hover:text-content transition-colors">TaskForge</Link>
              <span>/</span>
              <span>{activeOrganization?.name || 'TaskForge HQ'}</span>
              <span>/</span>
              <span className="text-content font-medium">Teams</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">Teams</h1>
              <span className="text-xs text-content-muted font-mono">{teams.length} teams</span>
            </div>
            <p className="text-xs text-content-muted mt-1">
              Organize members into reusable collaboration groups across your organization.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center space-x-2 self-start md:self-auto">
            <div className="inline-flex p-0.5 bg-surface-muted rounded-md text-xs border border-border">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 font-medium rounded flex items-center space-x-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid' ? 'bg-surface text-content shadow-xs font-semibold' : 'text-content-muted hover:text-content'
                }`}
                title="Grid View"
              >
                <LuLayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 font-medium rounded flex items-center space-x-1.5 transition-all cursor-pointer ${
                  viewMode === 'list' ? 'bg-surface text-content shadow-xs font-semibold' : 'text-content-muted hover:text-content'
                }`}
                title="List View"
              >
                <LuList className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            {canCreateTeam && <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-2xs transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5" />
              <span>New Team</span>
            </button>}
          </div>
        </div>

        {/* Filter Tabs & Search Strip */}
        <TeamFilterStrip
          tabs={filterTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Query State Handling */}
        {isLoading && <LoadingState message="Loading organization teams..." />}
        {isError && (
          <ErrorState
            title="Unable to load teams"
            message={error?.data?.message || 'Failed to fetch teams in this workspace.'}
            onRetry={refetch}
          />
        )}

        {/* Empty State */}
        {!isLoading && !isError && teams.length === 0 && (
          <EmptyState
            icon={LuUsers}
            title="No teams created yet"
            description="Group workspace members into teams to coordinate projects, approvals, and shared deliverables."
            action={canCreateTeam &&
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <LuPlus className="w-4 h-4" />
                <span>New Team</span>
              </button>
            }
          />
        )}

        {/* Main Content Area (Teams Grid/List + Right Overview Sidebar) */}
        {!isLoading && !isError && teams.length > 0 && (
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTeams.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      onClick={() => navigate(`/teams/${team.id}`)}
                    />
                  ))}
                  {filteredTeams.length === 0 && (
                    <div className="col-span-2 py-12 text-center text-xs text-content-muted border border-dashed border-border rounded-xl">
                      No teams match your search filter.
                    </div>
                  )}
                </div>
              ) : (
                <TeamListView
                  teams={filteredTeams}
                  onTeamClick={(id) => navigate(`/teams/${id}`)}
                />
              )}
            </div>

            <TeamOverviewSidebar
              totalTeams={teams.length}
              totalMembers={totalMembers || 48}
              onInviteClick={canInvite ? () => setIsInviteModalOpen(true) : undefined}
            />
          </div>
        )}

        {/* Create Team Modal */}
        <CreateTeamModal
          isOpen={isModalOpen && canCreateTeam}
          onClose={() => setIsModalOpen(false)}
          onCreateTeam={handleCreateTeamSubmit}
          isCreating={isCreating}
        />

        {/* Invite Organization Member Modal */}
        <InviteOrgMemberModal
          isOpen={isInviteModalOpen && canInvite}
          onClose={() => setIsInviteModalOpen(false)}
          organizationId={activeOrganizationId}
        />

        {/* Global Floating Status Indicator & Shortcuts */}
        <SystemStatusBar shortcuts={KEYBOARD_SHORTCUTS} />
      </div>
    </DashboardLayout>
  );
};

export default TeamListPage;
