import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_KEY = 'skipTenant';

/**
 * Đánh dấu route/controller KHÔNG cần header `X-Organization-Id` / Membership hợp lệ.
 * Dùng cho các route tenant-agnostic — vận hành trên `User`/`Organization`, cả hai đã
 * nằm trong `excludedModels` của `tenantPlugin` nên không phụ thuộc ALS org context.
 *
 * Bắt buộc phải có với các route "bootstrap" (đăng nhập, xem/chọn workspace) — nếu không,
 * user vừa đăng nhập sẽ không có header nào để gửi trước khi biết mình thuộc org nào,
 * dẫn tới deadlock.
 *
 * Flow sử dụng:
 *   @SkipTenant()
 *   @Controller('auth')
 */
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);
