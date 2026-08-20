import type { MembershipDocument } from '../../modules/membership/schemas/membership.schema';

export interface AuthenticatedUserRef {
  _id?: { toString(): string } | string;
}

/**
 * Request shape shared by tenant guards, decorators and interceptors.
 * `activeMembership` is attached only after TenantMembershipGuard validates
 * the authenticated user against X-Organization-Id.
 */
export interface TenantRequest {
  user?: AuthenticatedUserRef;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  activeMembership?: MembershipDocument;
}
