# Phạm vi nghiệp vụ TaskForge

> **Trạng thái:** Accepted baseline v0.2 — 2026-08-22.  
> Tài liệu này là nguồn sự thật cho **phạm vi nghiệp vụ mục tiêu** của TaskForge. Source code phản ánh trạng thái đang chạy; `.spec-kit/` mô tả kế hoạch và vertical slice triển khai. Thay đổi làm lệch các quyết định baseline trong tài liệu này phải được xem là thay đổi scope, không phải refactor thuần kỹ thuật.

## 1. Định nghĩa sản phẩm

TaskForge là một **multi-tenant work management platform** dành cho các tổ chức, team và agency quy mô nhỏ đến vừa. Sản phẩm tập trung vào việc tổ chức thành viên, phối hợp nhiều team trong cùng project, lập kế hoạch, giao việc, theo dõi tiến độ, cộng tác và kiểm soát các task quan trọng cần phê duyệt.

TaskForge không bị giới hạn cho lĩnh vực phần mềm. Các primitive cốt lõi như Organization, Team, Project, Task, Milestone, Document, File và Risk phải đủ tổng quát để áp dụng cho software, marketing, HR, operations, event, construction và các mô hình công việc tương tự.

TaskForge ưu tiên bốn giá trị:

1. Ranh giới dữ liệu và quyền hạn giữa các Organization phải rõ ràng.
2. Project phải đủ linh hoạt để nhiều Team cùng tham gia mà không tạo hierarchy cứng `Team -> Project`.
3. Task workflow phải đủ đơn giản để dùng hằng ngày; approval chỉ xuất hiện khi nghiệp vụ thực sự yêu cầu.
4. Các thay đổi quan trọng phải truy vết được mà không biến sản phẩm thành ERP hoặc enterprise governance suite.

Quy mô mục tiêu ban đầu là khoảng **5–100 active members trong một Organization**. Đây là product target, không phải giới hạn kỹ thuật cứng.

## 2. Vấn đề sản phẩm giải quyết

Một Organization cần có thể:

- quản lý thành viên và Organization role trong đúng tenant;
- tổ chức thành viên thành các Team có Lead và Member;
- tạo nhiều Project độc lập trong cùng Organization;
- chọn một hoặc nhiều Team tham gia từng Project;
- lập kế hoạch và chia nhỏ công việc bằng Task và các module Project được bật;
- quản lý Task bằng Board/List, assignment, status, priority, due date, checklist và comment;
- cho phép Task thông thường hoàn thành trực tiếp và Task quan trọng đi qua approval khi được cấu hình;
- theo dõi Activity, Notification và Audit Log;
- bảo đảm dữ liệu, quyền truy cập, aggregate và thao tác nền không vượt qua tenant boundary.

TaskForge không hướng tới thay thế Jira ở mức cấu hình sâu, ERP, HRM, accounting platform, real-time chat platform hay low-code database builder.

## 3. Ranh giới tenant và business hierarchy

`User` là global identity. `Organization` là tenant và là ranh giới dữ liệu. Quan hệ giữa User và Organization được biểu diễn bằng `Membership`; Organization role không phải thuộc tính toàn cục của User.

Business hierarchy mục tiêu:

```text
User
  └─ Membership ──> Organization
                      │
                      ├─ Members
                      ├─ Teams
                      │   ├─ Team Lead
                      │   └─ Member
                      │
                      └─ Projects
                          │
                          ├─ Core
                          │   ├─ Overview
                          │   ├─ Participants
                          │   ├─ Tasks
                          │   └─ Activity
                          │
                          └─ Enabled Modules
                              ├─ Milestones
                              ├─ Documents
                              ├─ Files
                              └─ Risks
```

### 3.1. Ý nghĩa các cấp

- `Organization` là tenant, thường đại diện cho một công ty, agency, tổ chức hoặc nhóm làm việc độc lập.
- `Team` là một đơn vị nhân sự có thể tái sử dụng trong nhiều Project. Team trả lời câu hỏi **ai cùng làm việc như một nhóm ổn định**.
- `Project` là một work container có mục tiêu và lifecycle riêng. Project không thuộc một Team duy nhất.
- `Participants` không phải một loại Team mới; đây là tập các Team của Organization được chọn tham gia Project.
- `Task` là đơn vị công việc chính và luôn thuộc đúng một Project.
- Mỗi Task có đúng một `owning Team`, là Team chịu trách nhiệm chính cho Task đó.

### 3.2. Quan hệ mục tiêu

- Một User có thể có Membership tại nhiều Organization.
- Một Organization có đúng một active Owner tại một thời điểm và có thể có nhiều Admin.
- Một Team chỉ thuộc một Organization, có ít nhất một active Team Lead khi Team đang hoạt động và có nhiều Member.
- Một Membership có thể thuộc nhiều Team trong cùng Organization.
- Một Project chỉ thuộc một Organization.
- Một Project có thể có nhiều participating Team và một Team có thể tham gia nhiều Project.
- Quan hệ Project–Team là N:N; không tạo Team mới chỉ vì Team tham gia Project.
- Một Task thuộc đúng một Project và đúng một owning Team.
- Owning Team của Task bắt buộc phải nằm trong Participants của Project.
- Một Task có thể có nhiều assignee nhưng assignee phải là active member của owning Team.
- Các entity con của Project không được tham chiếu resource thuộc Organization khác.

Quan hệ khái niệm:

```text
Organization
├── Team A ─────────────┐
├── Team B ────────┐    │
└── Project X      │    │
    ├── Participants
    │   ├── Team A ◄────┘
    │   └── Team B ◄─────
    └── Tasks
        ├── Task 1 -> owning Team A
        └── Task 2 -> owning Team B
```

## 4. Vai trò và nguyên tắc phân quyền

TaskForge có **hai lớp role** trong phạm vi hiện tại. Không có `ProjectRole` ở v1.

| Lớp quyền | Role | Ý nghĩa |
|---|---|---|
| Organization | Owner | Sở hữu tenant, kiểm soát các thao tác nhạy cảm nhất |
| Organization | Admin | Quản lý Membership, Team, Project và cấu hình vận hành trong giới hạn Owner |
| Team | Team Lead | Điều phối Team, quản lý công việc của Team và approve Task khi Task yêu cầu approval |
| Team | Member | Thực thi công việc của Team |

### 4.1. Nguyên tắc chính

- Owner/Admin có quyền quản trị tenant nhưng **không mặc nhiên là người thực thi hoặc approver của mọi Task**.
- Team Lead có elevated permission trong Team nhưng **không phải gatekeeper của mọi state transition**.
- Assignee và người có quyền sửa Task được phép cập nhật workflow thông thường của Task.
- Approval là một policy của Task, không phải bước bắt buộc cho tất cả Task của Team hoặc Project.
- Project visibility được suy ra từ Organization role và Project participation; không tạo Project role mới chỉ để giải quyết quyền xem/sửa.

### 4.2. Ma trận quyền baseline

| Hành động | Owner | Admin | Team Lead | Member |
|---|:---:|:---:|:---:|:---:|
| Xem toàn bộ dữ liệu Organization | Có | Có | Không | Không |
| Sửa cấu hình Organization | Có | Có, trừ Owner-only | Không | Không |
| Chuyển quyền sở hữu/đóng Organization | Có | Không | Không | Không |
| Mời, khóa hoặc đổi Organization role | Có | Có, trong giới hạn Owner | Không | Không |
| Tạo/quản lý Team | Có | Có | Team mình, phạm vi hạn chế | Không |
| Tạo/quản lý Project | Có | Có | Không mặc định | Không |
| Xem Project Team mình tham gia | Có | Có | Có | Có |
| Quản lý Participants của Project | Có | Có | Không mặc định | Không |
| Tạo Task cho Team mình trong Project | Nếu thuộc participating Team | Nếu thuộc participating Team | Có | Có |
| Sửa nội dung Task | Theo quyền thực thi Task | Theo quyền thực thi Task | Task của Team mình | Task do mình tạo/được giao theo policy |
| Cập nhật status/progress thông thường | Theo quyền thực thi Task | Theo quyền thực thi Task | Có | Nếu là assignee/người có quyền |
| Submit Task cần approval | Theo quyền sửa Task | Theo quyền sửa Task | Có | Theo quyền sửa Task |
| Approve/reject Task cần approval | Nếu đồng thời là Lead phù hợp | Nếu đồng thời là Lead phù hợp | Có, với owning Team | Không |
| Xem Audit Log | Có | Có | Không | Không |

Owner/Admin có thể tham gia Team theo quy trình quản trị nếu cần can thiệp trực tiếp; hệ thống không âm thầm bypass quyền Team.

## 5. Project model và module system

Mỗi Project có một tập **Core capabilities** luôn tồn tại và một tập **Enabled Modules** được bật/tắt theo Project.

### 5.1. Core capabilities

#### Overview

Overview là read model tổng hợp, không phải source of truth riêng. Nó hiển thị tối thiểu:

- metadata và lifecycle của Project;
- participating Teams;
- tổng số Task và phân bố theo status;
- Task sắp/quá hạn;
- progress tổng hợp;
- summary từ các module đang bật khi phù hợp.

#### Participants

Participants biểu diễn các Team của Organization đang tham gia Project.

- Participants không tạo Team mới.
- Chỉ Team thuộc cùng Organization mới được tham gia Project.
- Một Project có thể có một hoặc nhiều participating Team.
- Một Team có thể tham gia nhiều Project.
- Removing a Team khỏi Project phải xử lý các Task đang dùng Team đó làm owning Team trước khi hoàn tất.

#### Tasks

Tasks là module cốt lõi của Project và là nơi thực thi công việc chính.

Task management cung cấp tối thiểu hai view:

```text
Tasks
├── Board View      <- primary workflow view
└── List View       <- dense/filterable management view
```

Board được sinh từ **Task Status configuration của từng Project** thay vì hard-code một tập cột duy nhất cho toàn hệ thống. Khi tạo Project mới, TaskForge cung cấp workflow mặc định:

```text
Pending | In Progress | Pending Approval | Completed
```

Project có thể đổi tên, thêm và sắp xếp các status để phù hợp với cách làm việc thực tế, ví dụ:

```text
To Do | In Progress | In Review | QA | Done
```

hoặc:

```text
Backlog | Doing | Waiting Client | Done
```

Mỗi custom status bắt buộc map vào một **semantic category** do hệ thống kiểm soát, để UI linh hoạt nhưng business logic vẫn có ý nghĩa thống nhất:

```text
NOT_STARTED
IN_PROGRESS
REVIEW
COMPLETED
```

Ví dụ `To Do` và `Backlog` có thể cùng thuộc `NOT_STARTED`; `In Review`, `QA` hoặc `Waiting Client` có thể thuộc `REVIEW`; `Done` và `Closed` có thể thuộc `COMPLETED`.

`Pending Approval` không bắt buộc tồn tại với đúng tên này. Với Task cần approval, Project phải có ít nhất một status thuộc semantic category phù hợp cho trạng thái review/approval. Approval là business rule của Task chứ không phụ thuộc vào tên hiển thị của column.

Board/List là projection của Task data, không phải nguồn trạng thái độc lập.

#### Activity

Activity là timeline thân thiện với người dùng trong Project/Task, phản ánh các thay đổi có ý nghĩa cộng tác như:

- Task được tạo hoặc đổi status;
- assignee thay đổi;
- checklist thay đổi;
- comment được thêm;
- Task được submit/approve/reject;
- Team được thêm hoặc rời Project.

Activity khác Audit Log và không dùng thay cho Audit Log.

### 5.2. Enabled Modules của v1

Project v1 hỗ trợ bốn module tùy chọn cố định:

| Module | Vai trò |
|---|---|
| Milestones | Lập kế hoạch theo mốc/giai đoạn lớn của Project |
| Documents | Lưu knowledge/nội dung được tạo và duy trì trong TaskForge |
| Files | Quản lý asset/tệp được upload cho Project |
| Risks | Theo dõi rủi ro có thể ảnh hưởng mục tiêu Project |

Project được cấu hình bật/tắt từng module. Việc tắt module **không mặc định xóa dữ liệu cũ**; module bị ẩn khỏi luồng sử dụng và bị chặn tạo/cập nhật mới cho đến khi bật lại, trừ khi có chính sách riêng.

### 5.3. Module roadmap, chưa thuộc v1

Các module sau được ghi nhận cho roadmap nhưng chưa thuộc baseline triển khai v1:

- Goals / Objectives;
- Meetings;
- Issues;
- Decisions;
- Budget;
- KPIs / Metrics;
- Calendar / Timeline view;
- Reports nâng cao.

TaskForge v1 không hỗ trợ user tự định nghĩa entity/module tùy ý. `Custom Entity`, `Custom Collection`, `Custom Field Builder` và low-code schema builder nằm ngoài phạm vi.

## 6. Phạm vi chức năng chi tiết

### 6.1. Identity và active workspace

- Đăng ký, xác minh email, đăng nhập, đăng xuất, refresh token và khôi phục/đổi mật khẩu.
- Một User dùng cùng global identity để tham gia nhiều Organization.
- User có thể liệt kê Organization có active Membership và chọn active workspace.
- Mọi request tenant-scoped phải xác định active Organization.
- Profile toàn cục chỉ chứa identity data; role, membership status và joined date thuộc Membership.

### 6.2. Organization và Membership

- Tạo Organization khi onboarding hoặc theo quyền được cấp.
- Mời người dùng qua email với Organization role, thời hạn và khả năng revoke.
- Người nhận accept/reject invitation; active Membership chỉ xuất hiện sau khi accept thành công.
- Mỗi cặp User–Organization có tối đa một Membership có hiệu lực.
- Membership lifecycle tối thiểu phân biệt active, suspended/locked, revoked và left về mặt nghiệp vụ hoặc equivalent state/reason.
- Organization luôn có đúng một active Owner.
- Transfer Owner phải atomic.
- Không thể suspend/revoke/leave nếu thao tác làm mất Owner cuối cùng.
- Leave/revoke Membership không xóa User identity hoặc lịch sử nghiệp vụ.
- Không tạo invitation mới nếu User đã có active Membership; duplicate pending invitation phải được kiểm soát.

### 6.3. Team

- Owner/Admin tạo, sửa, archive Team và quản lý Team membership.
- Chỉ active Membership của cùng Organization được thêm vào Team.
- Team đang active phải có ít nhất một active Team Lead.
- Một Member có thể thuộc nhiều Team.
- Team Lead quản lý phạm vi công việc của Team nhưng không được nâng Organization role hay mời người ngoài Organization.
- Không được remove/suspend/revoke một Membership nếu thao tác khiến một active Team mất Team Lead cuối cùng, trừ khi Lead đã được chuyển giao hợp lệ trước đó.

### 6.4. Project

- Owner/Admin tạo Project, đặt tên, mô tả, thời gian và lifecycle status.
- Project không thuộc riêng một Team.
- Owner/Admin chọn Participants từ các Team hiện có của Organization.
- Owner/Admin nhìn thấy mọi Project trong tenant.
- Team Lead/Member nhìn thấy Project khi ít nhất một Team active mà họ thuộc về đang tham gia Project.
- Trong Project được phép xem, member có thể nhìn thấy Task/Activity của các participating Team để hỗ trợ cross-team collaboration; quyền mutation vẫn bị giới hạn bởi owning Team và resource policy.
- Private Task không thuộc v1.
- Archive là hành vi xóa nghiệp vụ mặc định cho Project. Project archived ở read-only và không nhận mutation nghiệp vụ mới, trừ thao tác restore/administrative operation được cho phép.

### 6.5. Task

Task có tối thiểu:

- title, description;
- status, priority, due date;
- progress;
- creator;
- owning Team;
- zero or more assignees;
- optional Milestone khi module Milestones được bật;
- checklist;
- comment;
- attachment/file reference;
- optional approval requirement;
- activity/history liên quan.

Business rules:

- Task luôn thuộc đúng một Project.
- Owning Team phải đang tham gia Project.
- Assignee phải có active Membership và thuộc owning Team.
- Multi-assignee thể hiện shared responsibility; Task chỉ có một workflow state chung, không có status riêng cho từng assignee trong v1.
- Khi checklist có item, progress được suy ra từ tỷ lệ item hoàn thành.
- Khi không có checklist, người có quyền có thể cập nhật progress thủ công từ 0–100.
- `Completed` phải tương thích với progress cuối cùng; baseline coi completed Task có effective progress 100%.
- Status của Task tham chiếu một Project Task Status hợp lệ thuộc chính Project đó.
- Project có thể thêm, đổi tên và sắp xếp status nhưng không được làm mất semantic meaning mà business rule đang phụ thuộc.
- Status chỉ được thay đổi qua transition hợp lệ theo semantic category và Task policy.

### 6.6. Task status, workflow và approval

TaskForge tách **status hiển thị** khỏi **semantic state**. Mỗi Project quản lý danh sách Task Status của riêng mình. Một status có tối thiểu:

- `name`: tên hiển thị như `To Do`, `In Review`, `Waiting Client`, `Done`;
- `semantic category`: một trong các nhóm hệ thống như `NOT_STARTED`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`;
- `position`: thứ tự column trên Board;
- trạng thái active/archived hoặc equivalent để quản lý lifecycle của status.

Baseline rules cho status configuration:

- Project phải luôn có ít nhất một status thuộc `NOT_STARTED`, một status thuộc `IN_PROGRESS` và một status thuộc `COMPLETED`.
- Project có thể có nhiều status trong cùng một semantic category.
- Status đang được Task sử dụng không được xóa trực tiếp; Task phải được migrate sang status khác hoặc status được archive theo policy.
- Không được gán Task sang status thuộc Project khác.
- Board column được render theo status configuration và `position` của Project.
- V1 chưa cho phép user tự định nghĩa arbitrary transition graph giữa mọi status; transition vẫn phải tuân theo semantic state và các business rule của Task.

Ví dụ workflow Project có thể là:

```text
To Do -> In Progress -> In Review -> QA -> Done
  |          |             |          |      |
  v          v             v          v      v
NOT_STARTED IN_PROGRESS   REVIEW     REVIEW COMPLETED
```

Approval không bắt buộc với mọi Task. Về semantic, workflow chuẩn vẫn là:

```text
NOT_STARTED -> IN_PROGRESS -> COMPLETED                  (không cần approval)
NOT_STARTED -> IN_PROGRESS -> REVIEW -> COMPLETED        (cần approval)
                                      \-> IN_PROGRESS   (reject)
```

Tên status thực tế trên UI có thể khác các semantic category trên.

Baseline approval policy:

- Approval **không bắt buộc cho tất cả Task**.
- Task có `requiresApproval = true|false` hoặc equivalent business setting.
- Task thông thường có thể đi từ `In Progress` sang `Completed` bởi người có quyền thực thi.
- Task yêu cầu approval phải đi từ `In Progress` sang `Pending Approval`; endpoint update status chung không được bypass rule này.
- Active Team Lead của owning Team là approver mặc định.
- Nhiều Team Lead có thể cùng có quyền approve; hệ thống không yêu cầu mọi Lead cùng phê duyệt trong v1.
- Một approval hợp lệ hoàn thành Task; reject đưa Task về `In Progress` và nên có reason.
- Team Lead được tự approve Task của chính mình trong v1; hành động phải được ghi Approval History/Audit Log.
- Mỗi submit/approve/reject tạo history record mới; không overwrite lịch sử cũ.
- Leader không phải gatekeeper cho các status transition thông thường của Task.

`reopen` từ `Completed` về `In Progress` được phép cho người có elevated permission theo policy và phải tạo Activity; chi tiết permission có thể được khóa trong specification của Task workflow.

### 6.7. Milestones

Khi module Milestones được bật:

- Milestone thuộc đúng một Project.
- Milestone có tên, mô tả, thời hạn và lifecycle status.
- Task có thể không thuộc Milestone; nếu thuộc thì tối đa một Milestone trong v1.
- Milestone progress được aggregate từ Task nhưng đóng Milestone là explicit action.
- Completed/closed Milestone không nhận Task mới trừ khi được reopen.
- Milestone không tạo role mới.

### 6.8. Documents

Khi module Documents được bật:

- Project có thể tạo và quản lý tài liệu knowledge nội bộ.
- Document tối thiểu có title, content, author, timestamps và trạng thái archive/delete mềm.
- Documents phục vụ knowledge/project context; không cố thay thế Google Docs hoặc collaborative editor thời gian thực trong v1.

### 6.9. Files

Khi module Files được bật:

- Project hỗ trợ upload và quản lý file/asset.
- File metadata thuộc Project/Organization context.
- Task attachment có thể reuse file/storage capability nhưng phải giữ relationship rõ ràng.
- File bị xóa nghiệp vụ không được làm phá vỡ audit/history còn cần tham chiếu.

### 6.10. Risks

Khi module Risks được bật:

- Risk biểu diễn điều có khả năng xảy ra và ảnh hưởng đến Project, không phải Task lỗi đã xảy ra.
- Risk tối thiểu có title, description, probability/likelihood, impact, owner, mitigation và status.
- Workflow risk v1 có thể giữ ở mức đơn giản như `Open -> Mitigating -> Resolved`.
- Risk có thể liên kết Task mitigation nhưng không tạo một permission layer mới.

### 6.11. Comment và cộng tác

- Người có quyền xem Project có thể đọc Comment của Task trong Project đó.
- Thành viên participating Team có thể thêm Comment vào Task được phép xem.
- Author có thể sửa/xóa Comment của mình theo policy; Owner/Admin có moderation permission.
- Comment dùng soft delete để giữ context.
- Mention cơ bản có thể tạo Notification.
- Mention candidate nên giới hạn trong active participants/members có liên quan đến Project.
- Chat, nested discussion engine phức tạp và collaborative editing thời gian thực nằm ngoài v1.

### 6.12. Notification

- Notification là side effect của business event, không phải source of truth.
- Kênh v1: in-app và email cho event quan trọng.
- Event tối thiểu gồm Organization invitation, Task assignment, due/overdue reminder, approval request và approval result.
- Recipient phải được resolve trong đúng Organization và theo Membership/Team state phù hợp.
- Duplicate delivery phải được kiểm soát bằng idempotency hoặc equivalent mechanism ở implementation layer.
- Notification failure không được rollback một business state đã commit hợp lệ chỉ vì delivery thất bại.

### 6.13. Activity và Audit Log

`Activity` và `Audit Log` là hai concept khác nhau:

- Activity phục vụ collaboration và timeline người dùng.
- Audit Log phục vụ kiểm soát, security và administrative evidence.

Audit Log tối thiểu bao phủ:

- authentication/security-sensitive event;
- Membership/Organization role change;
- Owner transfer;
- Team/Project configuration change;
- Participant change;
- sensitive Task assignment/status/approval operation;
- archive/restore hoặc business deletion quan trọng.

Audit Log là append-only đối với application user. Password, token, secret và sensitive credential không được ghi vào log.

### 6.14. Search, dashboard và báo cáo cơ bản

- Search/filter Task theo Project, Team, assignee, status, priority, due date và Milestone khi module được bật.
- Dashboard cá nhân hiển thị assigned Tasks, due/overdue Tasks và approval đang chờ nếu User là approver.
- Project Overview hiển thị aggregate cơ bản.
- Team/Project dashboard có thể hiển thị workload/progress cơ bản.
- Aggregate, search và report phải áp dụng cùng tenant/visibility policy như resource detail.

## 7. Các luồng nghiệp vụ chính

### Luồng A — Onboarding và chuyển workspace

1. User đăng ký và xác minh identity.
2. User tạo Organization đầu tiên và nhận active Owner Membership trong cùng business transaction.
3. Sau login, User nhận danh sách Organization có active Membership.
4. User chọn active workspace.
5. Request tenant-scoped tiếp theo luôn được xử lý trong active Organization context.

### Luồng B — Mời thành viên và tổ chức Team

1. Owner/Admin gửi Organization invitation.
2. Người nhận accept để tạo/kích hoạt Membership.
3. Owner/Admin thêm active Member vào một hoặc nhiều Team.
4. Team đang active phải giữ ít nhất một active Team Lead.
5. Revoke/leave Membership chặn tenant access nhưng không xóa lịch sử công việc.

### Luồng C — Tạo Project và chọn Participants

1. Owner/Admin tạo Project.
2. Owner/Admin chọn một hoặc nhiều Team của Organization làm Participants.
3. Project bật các optional module cần thiết trong tập module cố định v1.
4. Team member có quyền xem Project khi Team của họ đang tham gia Project.

### Luồng D — Lập kế hoạch và thực thi Task

1. Người có quyền tạo Milestone nếu module Milestones được bật.
2. Team member tạo Task cho owning Team đang tham gia Project.
3. Assignee được chọn từ active member của owning Team.
4. Assignee/người có quyền cập nhật Task, checklist, progress và comment.
5. Board/List phản ánh cùng Task state.
6. Hệ thống tạo Activity và Notification phù hợp.

### Luồng E — Hoàn thành Task thông thường

1. Task đang ở một status thuộc semantic category `IN_PROGRESS` và `requiresApproval = false`.
2. Người có quyền chuyển Task sang một status thuộc `COMPLETED`.
3. Effective progress trở thành 100%.
4. Hệ thống ghi Activity và side effects liên quan.

### Luồng F — Task cần approval

1. Task đang ở một status thuộc `IN_PROGRESS` và `requiresApproval = true`.
2. Người có quyền submit Task sang một status thuộc `REVIEW` được Project sử dụng cho approval.
3. Active Team Lead của owning Team nhận approval request.
4. Một approver hợp lệ approve để Task đi vào status thuộc `COMPLETED` hoặc reject để Task quay về một status thuộc `IN_PROGRESS`.
5. Hệ thống ghi Approval History, Activity, Audit Log và Notification phù hợp.

### Luồng G — Quản lý module Project

1. Owner/Admin bật một module được hỗ trợ cho Project.
2. Module xuất hiện trong Project navigation và cho phép tạo dữ liệu tương ứng.
3. Khi module bị tắt, dữ liệu hiện có không bị hard delete mặc định.
4. Module bị tắt không cho phép tạo/mutate business data mới cho đến khi bật lại.

## 8. Business invariant bắt buộc

Các điều kiện sau là acceptance criteria cấp domain:

1. Không có query, mutation, background job, export, search hoặc aggregate nào làm rò dữ liệu giữa các Organization.
2. Organization role chỉ đến từ active Membership của active Organization.
3. Resource ID hợp lệ không đồng nghĩa với được phép truy cập; mọi liên kết chéo phải kiểm tra tenant ownership và visibility.
4. Team, Project, Task, module data và các object liên quan phải thuộc cùng Organization.
5. Participating Team của Project phải là Team thuộc cùng Organization.
6. Owning Team của Task phải là participating Team của Project.
7. Task chỉ được assign cho active member của owning Team.
8. Organization không được mất active Owner cuối cùng.
9. Active Team không được mất active Team Lead cuối cùng.
10. Mọi Task Status phải thuộc cùng Project với Task và map vào một semantic category hợp lệ.
11. Project luôn phải duy trì ít nhất một status thuộc `NOT_STARTED`, `IN_PROGRESS` và `COMPLETED`.
12. Status đang được Task sử dụng không được hard delete nếu chưa migrate các Task liên quan.
13. Task status chỉ thay đổi qua transition hợp lệ theo semantic category và Task policy.
14. Task có `requiresApproval = true` không được chuyển trực tiếp từ semantic `IN_PROGRESS` sang `COMPLETED` bằng generic update.
15. Task có `requiresApproval = false` không bắt buộc đi qua semantic `REVIEW`.
16. Approval chỉ được thực hiện bởi approver hợp lệ của owning Team theo baseline policy.
17. Leader không được biến thành mandatory gatekeeper cho mọi Task transition.
19. Task ở semantic `COMPLETED` có effective progress 100%.
20. Khi checklist tồn tại, checklist là nguồn tính progress.
21. Multi-step operation làm thay đổi quyền hoặc critical state phải bảo toàn invariant ở mức business transaction.
22. Notification và Activity có thể được xử lý async nhưng không trở thành source of truth.
23. Archive/soft delete là mặc định cho business data có history; hard delete chỉ dùng theo retention/operational policy.
24. Audit Log là append-only đối với application user.
25. Search, list, dashboard, Board, report và Overview phải áp dụng cùng visibility policy với resource detail.
25. Tắt Project module không mặc định làm mất dữ liệu lịch sử của module đó.

## 9. Phạm vi phát hành v1

### 9.1. Core product

- Authentication và global User identity.
- Multi-Organization Membership, invitation và workspace switch.
- Organization Owner/Admin.
- Team, Team Lead và Team Member.
- Project lifecycle và Participants.
- Project Overview.
- Task Board + List.
- Task assignment, Project-configurable status/Board columns, priority, due date và progress.
- Checklist, Comment và Attachment/File relation.
- Optional Task approval.
- Activity, Notification và Audit Log.
- Search/filter và dashboard/report cơ bản.

### 9.2. Optional modules v1

- Milestones.
- Documents.
- Files.
- Risks.

### 9.3. Future roadmap

- Goals / Objectives.
- Meetings.
- Issues.
- Decisions.
- Budget.
- KPIs / Metrics.
- Calendar / Timeline.
- Advanced Reports.

## 10. Ngoài phạm vi v1

- Sprint, backlog Scrum, story point, velocity và đầy đủ Agile ceremony.
- Epic/Story model chuyên biệt cho software development.
- Full custom workflow engine cho phép user tự định nghĩa arbitrary transition graph, transition permission hoặc workflow scripting.
- TaskForge v1 **có** Project-configurable Task Status (thêm/đổi tên/sắp xếp status có semantic category cố định); phần ngoài scope chỉ là workflow engine tổng quát.
- Custom field/form/entity/collection builder.
- Arbitrary user-defined Project modules.
- Project template marketplace hoặc generic template engine.
- Billing, subscription, quota plan và payment.
- Time tracking, timesheet, payroll và invoicing.
- Advanced Gantt, critical path, portfolio management và dependency planning.
- Advanced BI/data warehouse/resource forecasting.
- Full chat platform, video call hoặc collaborative document editing thời gian thực.
- Guest/external collaborator với permission model riêng.
- Public integration platform/webhook marketplace diện rộng.
- Native mobile app và offline-first.
- Enterprise SSO/SAML/SCIM và enterprise policy engine.

## 11. Quyết định baseline đã chốt

1. `Organization` là tenant; `User` là global identity; `Membership` là nguồn Organization role.
2. Team tồn tại ở cấp Organization và có thể tái sử dụng giữa nhiều Project.
3. Project không nằm dưới một Team; Team và Project là hai aggregate ngang cấp trong Organization.
4. `Participants` là association giữa Project và Team, không phải một entity Team mới.
5. Không có `ProjectRole` trong v1.
6. Project có thể có nhiều participating Team; mỗi Task có đúng một owning Team.
7. Owning Team phải tham gia Project.
8. Owner/Admin thấy toàn tenant để quản trị nhưng không tự động có quyền thực thi/approve mọi Task.
9. Team Lead có elevated Team permission nhưng không phải gatekeeper của mọi status change.
10. Approval là tùy chọn theo Task/business policy, không phải cấu hình bắt buộc cho toàn Team.
11. Task thông thường có thể đi từ semantic `IN_PROGRESS` sang `COMPLETED`; Task yêu cầu approval phải đi qua một status thuộc semantic `REVIEW` trước khi hoàn thành.
12. Active Team Lead của owning Team là approver mặc định trong v1.
13. Một approval hợp lệ là đủ; không có multi-approver quorum/sequential approval trong v1.
14. Team Lead có thể self-approve trong v1 và hành động phải được audit.
15. Board là primary Task workflow view; List là secondary management view.
16. Board columns phản ánh Project Task Status; mỗi Project có thể thêm, đổi tên và sắp xếp status nhưng mỗi status phải map vào semantic category do hệ thống kiểm soát.
17. V1 không có full custom workflow engine; user không tự định nghĩa arbitrary transition graph hoặc transition permission.
18. Project luôn có Core: Overview, Participants, Tasks, Activity.
19. v1 có bốn optional module cố định: Milestones, Documents, Files, Risks.
20. Module có thể bật/tắt; tắt module không hard-delete dữ liệu mặc định.
21. Custom Entity/Custom Module system chưa thuộc v1.
22. Khi checklist tồn tại, checklist là nguồn tính progress; Completed có effective progress 100%.
23. Activity phục vụ collaboration; Audit Log phục vụ governance/security và không gộp thành một concept.
24. Archive/soft delete là hành vi xóa nghiệp vụ mặc định.
25. TaskForge giữ core domain generic, không đưa các entity IT-specific như Sprint/Epic/Story/Repository vào business core.

## 12. Tiêu chí ngăn mở rộng scope

Một yêu cầu mới chỉ được thêm vào business scope hiện tại khi đồng thời:

- giải quyết trực tiếp một problem thuộc các luồng nghiệp vụ đã chốt;
- dùng được trong model Organization/Team/Project hiện tại mà không buộc thêm role layer mới;
- không biến Project thành generic low-code database;
- không thuộc danh sách loại trừ ở mục 10;
- có tenant, permission, lifecycle và audit invariant rõ ràng;
- có thể triển khai thành một vertical slice có acceptance criteria độc lập;
- mang lại giá trị đáng kể hơn so với độ phức tạp thêm vào.

Nếu không đạt các điều kiện trên, yêu cầu được ghi vào roadmap hoặc proposal riêng thay vì chen vào refactor hiện tại.

## 13. Ranh giới giữa Business Scope và Technical Scope

Tài liệu này chỉ khóa **business behavior và business invariants**. Các quyết định như concurrency control, transaction isolation, outbox pattern, cache strategy, real-time transport, object storage implementation, search engine, observability và deployment architecture thuộc Technical Architecture/Specification riêng.

Technical solution phải phục vụ các business invariant trong tài liệu này, nhưng không được đưa thêm business complexity chỉ để trình diễn kỹ thuật.
