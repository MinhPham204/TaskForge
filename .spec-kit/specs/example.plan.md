Act as a Principal Software Engineer executing Spec-Driven Development (SDD) via Spec Kit.

Context provided:
1. Complete codebase of TaskForge (Multi-Tenant SaaS with NestJS ALS + React RTK Query)
2. `.spec-kit/constitution.md` (Core architectural rules)

Your Task:
Analyze the codebase and generate the execution plan file: `.spec-kit/specs/phase-[X]-[Tên-Phase].plan.md` for [Điền số Phase & Tên Phase vào đây, ví dụ: Phase 1 — Vá lỗi Backend].

The generated plan file MUST strictly use the following markdown template:

---
# Plan: Phase [X] - [Tên Phase]

## 1. Architectural Alignment
- Verification against `constitution.md`: [Explain how this phase honors the core rules]
- Technical approach & Edge cases to handle.

## 2. Affected Files
- `backend/...`: [Brief explanation of changes]
- `frontend/...`: [Brief explanation of changes]

## 3. Step-by-Step Task Checklist
- [ ] TASK-1: [Precise sub-task 1]
- [ ] TASK-2: [Precise sub-task 2]
- [ ] TASK-3: [Precise sub-task 3]
---

Requirements for the output:
- Write the plan completely in Vietnamese (except code tokens/file paths).
- Do not write code implementations inside the plan; focus entirely on the architectural breakdown and the actionable task checklist.
- Keep it highly concise, strict, and ready to be used as context for the next implementation agent.