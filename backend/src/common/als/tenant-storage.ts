import { AsyncLocalStorage } from 'async_hooks';
import type { UserRole } from '../../modules/user/schemas/user.schema';

export interface TenantStore {
  organizationId: string;
  /** Role của user TRONG organization đang active (từ Membership), org-scoped — không phải role toàn cục. */
  membershipRole?: UserRole;
}

/**
 * Singleton ALS instance — được import trực tiếp bởi plugin và interceptor.
 * Không phải Injectable vì cần tồn tại trước khi NestJS DI khởi động.
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();
