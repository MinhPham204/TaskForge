import { organizationRoleName } from '../utils/organizationPermissions.js';

export default function RoleBadge({ role, roleSummary, isOwner = false }) {
  const summary = roleSummary || (typeof role === 'object' ? role : null);
  const name = organizationRoleName(summary || role);
  const owner = isOwner || summary?.systemCode === 'OWNER';
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${owner
      ? 'border-primary/20 bg-primary/10 text-primary'
      : 'border-border/60 bg-surface-muted text-content-muted'}`}>
      {name}
    </span>
  );
}
