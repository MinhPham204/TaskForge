import { useState } from 'react';
import { Dialog, ErrorState, LoadingState } from '../../components/PageState.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import {
  useGetOrganizationRolesQuery, useGetOrganizationPermissionCatalogQuery,
  useCreateOrganizationRoleMutation, useUpdateOrganizationRoleMutation,
  useReplaceOrganizationRolePermissionsMutation, useArchiveOrganizationRoleMutation,
  useAssignOrganizationMemberRoleMutation,
} from '../../services/organizationApi.js';
import { apiErrorMessage } from '../../utils/workspaceSettings.js';

const button = 'rounded-lg border border-border px-3 py-2 text-xs font-medium text-content hover:bg-surface-muted disabled:opacity-50';
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content';
const message = (error) => error?.status === 409
  ? `${apiErrorMessage(error, 'Role has changed.')} Reload the latest role before trying again.`
  : apiErrorMessage(error, 'Unable to save role.');

export default function OrganizationRoles({ organizationId }) {
  const rolesQuery = useGetOrganizationRolesQuery(organizationId);
  const catalogQuery = useGetOrganizationPermissionCatalogQuery(organizationId);
  const [createRole] = useCreateOrganizationRoleMutation();
  const [updateRole] = useUpdateOrganizationRoleMutation();
  const [replacePermissions] = useReplaceOrganizationRolePermissionsMutation();
  const [archiveRole] = useArchiveOrganizationRoleMutation();
  const [editor, setEditor] = useState(null);
  const [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const roles = rolesQuery.currentData || [];
  const catalog = catalogQuery.currentData || [];
  const openEditor = (role = null) => {
    setError(null);
    setFeedback(null);
    setEditor({ role, name: role?.name || '', description: role?.description || '', permissionCodes: [...(role?.permissionCodes || [])] });
  };
  const save = async (kind) => {
    setError(null);
    setFeedback(null);
    if (kind !== 'permissions' && !editor.name.trim()) { setError('Enter a role name.'); return; }
    setBusy(true);
    try {
      const common = { organizationId, roleId: editor.role?.id, expectedVersion: editor.role?.version };
      const result = !editor.role
        ? await createRole({ organizationId, name: editor.name.trim(), description: editor.description.trim(), permissionCodes: editor.permissionCodes }).unwrap()
        : kind === 'permissions'
          ? await replacePermissions({ ...common, permissionCodes: editor.permissionCodes }).unwrap()
          : await updateRole({ ...common, name: editor.name.trim(), description: editor.description.trim() }).unwrap();
      setEditor({ ...editor, role: result });
      setFeedback('Role saved successfully.');
      if (!editor.role) setEditor(null);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  const reloadEditor = async () => {
    setBusy(true);
    try {
      const latest = await rolesQuery.refetch().unwrap();
      const role = latest.find((item) => item.id === editor.role.id);
      if (!role || role.archivedAt) { setEditor(null); setFeedback('This role is no longer available to edit.'); }
      else openEditor(role);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  if (rolesQuery.isLoading || catalogQuery.isLoading) return <LoadingState label="Loading roles and permissions…" />;
  if (rolesQuery.error || catalogQuery.error) return <ErrorState title="Unable to load roles" message={apiErrorMessage(rolesQuery.error || catalogQuery.error)} onRetry={() => { rolesQuery.refetch(); catalogQuery.refetch(); }} />;
  const groups = [...new Set(catalog.map((permission) => permission.resourceGroup))];
  return <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-content">Roles &amp; Permissions</h2><button className={button} onClick={() => openEditor()}>Create Role</button></div>
    <p className="text-xs text-content-muted">Organization permissions control workspace governance and visibility. Project actions still require Project membership and role.</p>
    {feedback && <p role="status" className="text-sm text-success-content">{feedback}</p>}
    <div className="space-y-3">{roles.map((role) => <article key={role.id} className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><RoleBadge roleSummary={role} />{role.isDefault && <span className="text-xs text-content-muted">Default</span>}{role.isProtected && <span className="text-xs text-content-muted">Protected</span>}{role.archivedAt && <span className="text-xs text-content-muted">Archived</span>}</div>
      <p className="text-sm text-content-muted">{role.description || 'No description.'}</p>
      <p className="text-xs text-content-muted">{role.membershipCount} memberships · {role.pendingInvitationCount || 0} pending invitations · {role.permissionCodes.length} permissions</p>
      <p className="text-xs text-content-muted">{role.permissionCodes.map((code) => catalog.find((item) => item.code === code)?.name || code).join(', ') || 'No governance permissions.'}</p>
      {!role.archivedAt && <div className="flex gap-2"><button className={button} onClick={() => openEditor(role)}>{role.isProtected ? 'View Role' : 'Edit Role'}</button>
        {!role.isDefault && !role.isProtected && <button className={button} disabled={role.membershipCount > 0 || role.pendingInvitationCount > 0} title={role.membershipCount || role.pendingInvitationCount ? 'Reassign memberships and revoke pending invitations before archiving.' : undefined} onClick={() => { setError(null); setArchive(role); }}>Archive</button>}</div>}
    </article>)}</div>
    <Dialog open={!!editor} title={editor?.role ? `${editor.role.isProtected ? 'View' : 'Edit'} Role` : 'Create Role'} onClose={() => { if (!busy) setEditor(null); }} actions={<button className={button} disabled={busy} onClick={() => setEditor(null)}>Close</button>}>
      {editor && <div className="max-h-[65vh] overflow-y-auto space-y-4">
        {error && <p role="alert" className="text-danger-content">{error}</p>}
        {feedback && <p role="status" className="text-success-content">{feedback}</p>}
        {editor.role && !editor.role.isProtected && <button className={button} disabled={busy} onClick={reloadEditor}>Reload latest role (discard edits)</button>}
        <label className="block">Role name<input className={input} maxLength={80} value={editor.name} disabled={busy || editor.role?.isDefault || editor.role?.isProtected} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
        <label className="block">Description<textarea className={input} maxLength={500} value={editor.description} disabled={busy || editor.role?.isDefault || editor.role?.isProtected} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
        {editor.role && !editor.role.isDefault && !editor.role.isProtected && <button className={button} disabled={busy} onClick={() => save('metadata')}>Save name and description</button>}
        {editor.role?.isDefault && !editor.role.isProtected && <p className="text-xs">Default role names and descriptions are fixed. You can edit their permissions.</p>}
        {groups.map((group) => <fieldset key={group} className="space-y-2 border-t border-border pt-3"><legend className="font-semibold">{group}</legend>{catalog.filter((permission) => permission.resourceGroup === group).map((permission) => <label key={permission.code} className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={editor.permissionCodes.includes(permission.code)} disabled={busy || editor.role?.isProtected || !permission.isAssignable} onChange={(event) => setEditor({ ...editor, permissionCodes: event.target.checked ? [...editor.permissionCodes, permission.code] : editor.permissionCodes.filter((code) => code !== permission.code) })} />
          <span>{permission.name}{!permission.isAssignable && ' (Owner only)'}<span className="block text-xs text-content-muted">{permission.description}</span></span>
        </label>)}</fieldset>)}
        {!editor.role?.isProtected && <button className={button} disabled={busy} onClick={() => save('permissions')}>{busy ? 'Saving…' : editor.role ? 'Save permissions' : 'Create Role'}</button>}
      </div>}
    </Dialog>
    <Dialog open={!!archive} title="Archive Role" onClose={() => { if (!busy) setArchive(null); }} actions={<><button className={button} disabled={busy} onClick={() => setArchive(null)}>Cancel</button><button className={button} disabled={busy} onClick={async () => {
      setBusy(true); setError(null); setFeedback(null);
      try { await archiveRole({ organizationId, roleId: archive.id, expectedVersion: archive.version }).unwrap(); setArchive(null); setFeedback('Role archived.'); }
      catch (err) { setError(message(err)); rolesQuery.refetch(); }
      finally { setBusy(false); }
    }}>{busy ? 'Archiving…' : 'Archive Role'}</button></>}>
      <p>Archive {archive?.name}? All memberships must be reassigned and pending invitations revoked first.</p>{error && <p role="alert" className="mt-3 text-danger-content">{error}</p>}
    </Dialog>
  </section>;
}

export function ChangeMemberRole({ organizationId, member, onClose, onSaved }) {
  const query = useGetOrganizationRolesQuery(organizationId, { refetchOnMountOrArgChange: true });
  const [assign, { isLoading }] = useAssignOrganizationMemberRoleMutation();
  const [roleId, setRoleId] = useState(member.roleId);
  const [error, setError] = useState(null);
  const roles = (query.currentData || []).filter((role) => !role.archivedAt && !role.isProtected && role.systemCode !== 'OWNER');
  return <Dialog open title={`Change Role for ${member.name}`} onClose={() => { if (!isLoading) onClose(); }} actions={<><button className={button} disabled={isLoading} onClick={onClose}>Cancel</button><button className={button} disabled={isLoading || query.isFetching || !!query.error || !roles.some((role) => role.id === roleId)} onClick={async () => {
    try { await assign({ organizationId, userId: member.userId, roleId }).unwrap(); onSaved?.(); onClose(); }
    catch (err) { setError(message(err)); query.refetch(); }
  }}>{isLoading ? 'Saving…' : 'Save Role'}</button></>}>
    {query.isLoading && <LoadingState label="Loading roles…" />}
    {query.error && <ErrorState message={apiErrorMessage(query.error)} onRetry={query.refetch} />}
    <label className="block">Organization role<select className={input} value={roleId} disabled={isLoading || query.isFetching} onChange={(event) => setRoleId(event.target.value)}><option value="" disabled>Select a role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    <p className="mt-3 text-xs">Project and Team memberships remain unchanged.</p>
    {error && <p role="alert" className="mt-3 text-danger-content">{error}</p>}
  </Dialog>;
}
