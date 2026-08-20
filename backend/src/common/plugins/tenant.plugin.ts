import type { Schema, Query, Document } from 'mongoose';
import { Types } from 'mongoose';
import { tenantStorage } from '../als/tenant-storage';

/**
 * List Mongoose query hooks cần inject org filter.
 */
const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
] as const;

/**
 * Hàm được gắn vào mỗi query hook.
 * Tự động thêm { organization: orgId } vào filter nếu có tenant context.
 */

function injectOrgFilter(this: Query<unknown, unknown>): void {
  // Lớp bảo vệ 1: Kiểm tra xem query có chủ động yêu cầu bỏ qua tenant không
  // Dùng cho trường hợp gọi .setOptions({ skipTenant: true }) ở Service
  if (this.getOptions().skipTenant === true) {
    return; 
  }

  // Lớp bảo vệ 2: Bỏ qua các Collection cốt lõi không thuộc về Tenant nào cả.
  // 'Membership' là NGUỒN xác thực tenancy (1 user - N org) — bản thân nó span nhiều org,
  // nếu bị filter theo organization sẽ không thể liệt kê toàn bộ org của user và
  // TenantInterceptor không thể validate quyền truy cập trước khi có context.
  const excludedModels = ['Organization', 'User', 'Membership'];
  if (this.model && excludedModels.includes(this.model.modelName)) {
    return; // Tổ chức thì không thể thuộc về tổ chức
  }

  const orgId = tenantStorage.getStore()?.organizationId;
  if (!orgId) return; // Không có context

  const filter = this.getFilter() as Record<string, unknown>;
  if (!filter['organization']) {
    this.where({ organization: new Types.ObjectId(orgId) });
  }
}

/**
 * Mongoose Global Plugin — Multi-tenancy
 *
 * Tự động:
 * 1. Inject { organization: orgId } vào mọi query (find/update/delete/count)
 * 2. Set organization trên document mới trong pre('validate') - Trước khi
 *    Mongoose chạy required validation, đảm bảo organization: required:true pass.
 *
 * Plugin chỉ kích hoạt khi ALS có organizationId.
 * Các query bên ngoài request scope không bị ảnh hưởng
 */
export function tenantPlugin(schema: Schema): void {
  // Query Hook 
  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, injectOrgFilter);
  }

  // Document Hook (pre validate)
  // Dùng pre('validate') thay vì pre('save') vì Mongoose chạy validation
  // Trước pre('save'), nên cần set organization trước khi validate.
  schema.pre('validate', async function (this: any) {
    // 1. Kiểm tra nếu là document mới và chưa có organization
    if (this.isNew && !this.organization) {

      // 2. Lấy store từ ALS
      const store = tenantStorage.getStore();
      const orgId = store?.organizationId;
      if (orgId) {
        this.organization = new Types.ObjectId(orgId);
      }
    }
  });
}
