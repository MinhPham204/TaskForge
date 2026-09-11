# Plan 09 — Files & Storage

> **Execution status:** Not started; depends on Phase 5 và 8.  
> **Roadmap:** [Phase 9](../REFACTOR_ROADMAP_v0.3.md#phase-9--files-storage-task-attachment--project-files)

## 1. Outcome và invariants

Thiết lập object-storage boundary và authorization dựa trên business relation. Object key/URL không phải permission token; Task Attachment là core capability độc lập Project Files module.

## 2. Decision gate

Trước provider-specific implementation phải chốt storage provider, upload mode, size/type validation, retention và malware/security policy đủ cho v1. Các quyết định này không được đổi StoredFile/TaskAttachment/ProjectFile relations trong Frozen Data Model.

## 3. Task checklist

- [ ] `P9-01` — Chốt provider/upload/validation/retention policy và operational assumptions trong Detailed Phase Plan.
- [ ] `P9-02` — Implement small storage adapter cho put/finalize/read/delete metadata; domain không phụ thuộc provider SDK.
- [ ] `P9-03` — Implement StoredFile metadata lifecycle với Organization/Project ownership và opaque object key.
- [ ] `P9-04` — Implement upload/finalize transaction boundary và cleanup/retry cho failed/incomplete upload.
- [ ] `P9-05` — Implement TaskAttachment core relation; hoạt động dù Project Files module disabled.
- [ ] `P9-06` — Implement ProjectFile relation và enforce Project Files module gate cho normal create/mutation.
- [ ] `P9-07` — Implement authorized download qua verified tenant + resource relation/OpenFGA check; không trust raw URL/object key.
- [ ] `P9-08` — Implement unlink/archive/retention behavior; không hard-delete bytes còn historical reference.
- [ ] `P9-09` — Implement orphan detection/cleanup idempotent và audit intents.
- [ ] `P9-10` — Thêm adapter, transaction, authorization, cross-tenant/object-key abuse và module-toggle integration tests.

## 4. Verification

- [ ] Không attach/download file khác Organization/Project/Task.
- [ ] Disable Files module không ảnh hưởng Task Attachment.
- [ ] Disable giữ ProjectFile/StoredFile history và chặn normal mutation mới.
- [ ] Unlink/archive không xóa bytes còn được reference.
- [ ] Failed upload/finalize có cleanup/retry rõ và không tạo permission bypass.

## 5. Exit và deferred

Phase pass khi file boundary có provider adapter và authorization safety net. Provider production scaling/cost tuning thuộc Phase 12; legacy raw URL arrays bị xóa ở Phase 10.
