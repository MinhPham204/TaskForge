# Plan: Phase 8 - Deploy (tránh cold start)

## 1. Architectural Alignment
- Verification against `constitution.md`:
  - Nguyên tắc 1 (Multi-Tenancy Isolation): Seed script demo phải tạo ít nhất 2 Organization và 1-2 user demo có Membership ở CẢ HAI org, phản ánh đúng mô hình multi-org đang có.
  - Nguyên tắc 3 (RBAC): User demo cần role khác nhau ở mỗi org (vd Admin ở A, Member ở B) để nhà tuyển dụng trải nghiệm đúng phân quyền theo Membership và tính năng Workspace Switcher — điểm nhấn kỹ thuật lớn nhất của phiên bản này.
  - Cấu hình production (Docker, CORS, biến môi trường) nhất quán với các quyết định đã chốt ở Phase 3 (`BASE_URL` dùng biến môi trường).
- Technical approach & Edge cases to handle:
  - Dockerfile backend multi-stage, production stage không copy devDependencies.
  - `docker-compose.yml` production không expose port MongoDB/Redis, chỉ backend API public.
  - CORS production trỏ đúng domain frontend, không dùng wildcard.
  - Seed demo data phải show rõ tính năng multi-org: user demo thuộc 2 org với role khác nhau, mỗi org có vài Team và Task ở đủ trạng thái.

## 2. Affected Files
- `backend/Dockerfile`: Dockerfile multi-stage mới cho production.
- `docker-compose.yml`: Điều chỉnh không expose port MongoDB/Redis.
- `backend/scripts/seed-demo-data.ts`: Script mới tạo 2 Organization, user demo có Membership ở cả hai org với role khác nhau, Team/Task mẫu.
- `backend/.env.example`: Bổ sung đầy đủ biến môi trường cần thiết.
- `backend/src/main.ts`: Cập nhật cấu hình CORS cho đúng domain frontend production.

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: Viết Dockerfile multi-stage cho `backend/` (build stage node:20, production stage chỉ copy `dist/` + production dependencies).
- [ ] TASK-2: Điều chỉnh `docker-compose.yml` cho môi trường production (không expose port MongoDB/Redis, chỉ backend API public).
- [ ] TASK-3: Viết `backend/scripts/seed-demo-data.ts`: tạo 2 Organization ("Demo Agency A", "Demo Agency B"); tạo 1 user demo có Membership ở CẢ HAI org với role khác nhau (Admin ở A, Member ở B); mỗi org có vài Team, vài Task ở đủ trạng thái; in ra thông tin đăng nhập demo.
- [ ] TASK-4: Rà soát `backend/.env.example` đảm bảo đủ biến môi trường (MONGODB_URI, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, EMAIL config, PORT, CORS_ORIGIN).
- [ ] TASK-5: Cập nhật CORS trong `main.ts` cho đúng domain frontend production, không dùng wildcard.
- [ ] TASK-6: Triển khai backend + Redis + MongoDB lên hạ tầng đã chọn (Oracle Cloud/Railway), hướng dẫn từng bước tạo instance, set biến môi trường, trỏ domain, verify service.
- [ ] TASK-7: Deploy frontend lên Vercel/Netlify, trỏ đúng API production.
- [ ] TASK-8: Verify tài khoản demo multi-org đăng nhập được, trải nghiệm Workspace Switcher hoạt động ổn định, link demo không cold start khi test nhiều lần trong ngày.
