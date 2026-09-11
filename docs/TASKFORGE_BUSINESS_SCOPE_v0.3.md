# Phạm vi nghiệp vụ TaskForge

> **Trạng thái:** Accepted baseline v0.3 — 2026-08-23.  
> Tài liệu này là nguồn sự thật cho **phạm vi nghiệp vụ mục tiêu** của TaskForge. Source code phản ánh trạng thái đang chạy; `.spec-kit/` mô tả kế hoạch và vertical slice triển khai. Thay đổi làm lệch các quyết định baseline trong tài liệu này phải được xem là thay đổi scope, không phải refactor thuần kỹ thuật.

## 1. Định nghĩa sản phẩm

TaskForge là một **multi-tenant work management platform** dành cho các tổ chức, team và agency quy mô nhỏ đến vừa. Sản phẩm tập trung vào việc tổ chức thành viên, phối hợp nhiều nhóm trong cùng project, lập kế hoạch, giao việc, theo dõi tiến độ, cộng tác và kiểm soát các task quan trọng cần phê duyệt.

TaskForge không bị giới hạn cho lĩnh vực phần mềm. Các primitive cốt lõi như Organization, Team, Project, Task, Milestone, Document, File và Risk phải đủ tổng quát để áp dụng cho software, marketing, HR, operations, event, construction và các mô hình công việc tương tự.

TaskForge ưu tiên bốn giá trị:

1. Ranh giới dữ liệu và quyền hạn giữa các Organization phải rõ ràng.
2. Team và Project phải là hai khái niệm độc lập: Team biểu diễn nhóm người ổn định; Project biểu diễn phạm vi công việc có lifecycle riêng.
3. Project workflow phải đủ linh hoạt để dùng cho nhiều loại công việc nhưng không trở thành một generic workflow/low-code engine.
4. Các thay đổi quan trọng phải truy vết được mà không biến sản phẩm thành ERP hoặc enterprise governance suite.

Quy mô mục tiêu ban đầu là khoảng **5–100 active members trong một Organization**. Đây là product target, không phải giới hạn kỹ thuật cứng.

## 2. Vấn đề sản phẩm giải quyết

Một Organization cần có thể:

- quản lý thành viên và Organization role trong đúng tenant;
- tổ chức thành viên thành các Team có thể tái sử dụng giữa nhiều Project;
- tạo nhiều Project độc lập trong cùng Organization;
- chọn các Team tham gia Project và chọn cụ thể các Project Member từ các Team đó;
- gán Project role theo đúng trách nhiệm trong từng Project, độc lập với Organization role;
- lập kế hoạch và chia nhỏ công việc bằng Task và các module Project được bật;
- quản lý Task bằng Board/List, assignment, status, priority, due date, checklist và comment;
- cho phép Task thông thường hoàn thành trực tiếp và Task quan trọng sử dụng approval khi được cấu hình;
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
                      │
                      ├─ Teams
                      │   └─ Team Members
                      │
                      └─ Projects
                          │
                          ├─ Core
                          │   ├─ Overview
                          │   ├─ Participants
                          │   │   ├─ Participating Teams
                          │   │   └─ Project Members
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
- `Team` là một nhóm thành viên ổn định trong Organization và có thể được tái sử dụng giữa nhiều Project. Team không mang quyền quản lý Project.
- `Project` là một work container có mục tiêu, lifecycle, participants, workflow và cấu hình riêng. Project không thuộc một Team duy nhất.
- `Participants` là business concept bao gồm hai tập: `Participating Teams` và `Project Members`.
- `Participating Teams` trả lời câu hỏi **những Team nào của Organization tham gia Project**.
- `Project Members` trả lời câu hỏi **những người nào thực sự tham gia Project và họ có Project role gì**.
- `Task` là đơn vị công việc chính và luôn thuộc đúng một Project.
- Mỗi Task có đúng một `owning Team`, là participating Team chịu trách nhiệm chính cho Task đó.

### 3.2. Quan hệ mục tiêu

- Một User có thể có Membership tại nhiều Organization.
- Một Organization có đúng một active Owner tại một thời điểm, có thể có nhiều Admin và nhiều Member.
- Một Team chỉ thuộc một Organization và có nhiều Team Member; Team không có `TEAM_LEAD` trong baseline v0.3.
- Một Membership có thể thuộc nhiều Team trong cùng Organization.
- Một Project chỉ thuộc một Organization.
- Một Project có thể có nhiều Participating Team và một Team có thể tham gia nhiều Project.
- Quan hệ Project–Team là N:N; việc Team tham gia Project không tạo Team mới.
- Việc thêm một Team vào Project **không tự động biến toàn bộ Team Member thành Project Member**.
- Project Member phải là active Organization Member và thuộc ít nhất một Participating Team của Project.
- Một User chỉ có tối đa một Project Membership trong cùng Project, kể cả khi User thuộc nhiều Participating Team.
- Mỗi Project Member có đúng một Project role trong v1: `PROJECT_MANAGER` hoặc `CONTRIBUTOR`.
- Active Project phải luôn có ít nhất một active `PROJECT_MANAGER`.
- Một Task thuộc đúng một Project và đúng một owning Team.
- Owning Team của Task bắt buộc phải nằm trong Participating Teams của Project.
- Task assignee phải vừa là active Project Member, vừa là member của owning Team.
- Các entity con của Project không được tham chiếu resource thuộc Organization khác.

Quan hệ khái niệm:

```text
Organization
│
├── Team Backend
│   ├── Minh
│   ├── An
│   ├── Binh
│   └── Nam
│
├── Team QA
│   ├── Lan
│   └── Huy
│
└── Project X
    │
    ├── Participants
    │   ├── Participating Teams
    │   │   ├── Backend
    │   │   └── QA
    │   │
    │   └── Project Members
    │       ├── An   -> PROJECT_MANAGER
    │       ├── Minh -> CONTRIBUTOR
    │       └── Lan  -> CONTRIBUTOR
    │
    └── Tasks
        ├── Task 1 -> owning Team Backend -> assignee Minh
        └── Task 2 -> owning Team QA      -> assignee Lan
```

## 4. Role model và nguyên tắc phân quyền

TaskForge có **hai lớp role có ý nghĩa quyền hạn** trong phạm vi v1: Organization role và Project role. Team chỉ là organizational grouping, không có role riêng.

### 4.1. Organization role

| Role | Ý nghĩa |
|---|---|
| `OWNER` | Sở hữu tenant và kiểm soát các thao tác nhạy cảm nhất của Organization |
| `ADMIN` | Được Owner ủy quyền quản trị Membership, Team và cấu hình Organization trong phạm vi cho phép |
| `MEMBER` | Thành viên thông thường của Organization |

Organization role phục vụ **tenant governance**, không phải quyền vận hành Project hằng ngày.

Baseline:

- Organization luôn có đúng một active Owner.
- Organization có thể có `0..N` Admin.
- Owner có quyền transfer ownership, archive/close Organization và quản lý các thao tác Owner-only.
- Owner/Admin quản lý invitation, Membership và Team ở Organization scope.
- Owner/Admin có tenant-wide visibility phục vụ governance và audit, nhưng **không mặc nhiên có quyền mutation trên mọi Task/Project operation** nếu không có Project role phù hợp.

### 4.2. Team

Team không có `TEAM_LEAD` hoặc Team role trong baseline v0.3.

Team phục vụ:

- nhóm các Organization Member có chức năng hoặc trách nhiệm chung;
- tái sử dụng một nhóm người giữa nhiều Project;
- xác định participating scope của Project;
- xác định owning Team của Task;
- hỗ trợ filter, workload và aggregate theo Team.

Owner/Admin quản lý Team membership ở Organization level.

### 4.3. Project role

| Role | Ý nghĩa |
|---|---|
| `PROJECT_MANAGER` | Điều phối và quản lý Project |
| `CONTRIBUTOR` | Thực thi công việc trong Project |

`PROJECT_MANAGER` có thể:

- sửa metadata và lifecycle của Project trong policy cho phép;
- quản lý Participating Teams và Project Members;
- gán/chuyển Project role;
- cấu hình Task Status/Board columns;
- bật/tắt Project modules;
- quản lý Task ở mức điều phối như owning Team, assignee, due date, priority;
- quản lý Milestone và các resource Project-level theo module policy.

`CONTRIBUTOR` có thể:

- xem Project mà mình là active Project Member;
- tạo Task cho Team phù hợp nếu policy cho phép;
- thực thi Task được giao hoặc Task mình tạo trong phạm vi cho phép;
- cập nhật execution fields như status, progress, checklist, comment và attachment;
- tham gia approval nếu được chỉ định là approver hợp lệ.

Organization Owner/Admin, Team membership và Project role **không kế thừa lẫn nhau**.

Ví dụ hợp lệ:

```text
User: Minh

Organization role: MEMBER
Team Backend: member
Project A: CONTRIBUTOR
Project B: PROJECT_MANAGER
```

### 4.4. Ma trận quyền baseline

| Hành động | Owner/Admin | Project Manager | Contributor |
|---|:---:|:---:|:---:|
| Quản lý Organization/Membership | Có | Không | Không |
| Quản lý Team và Team membership | Có | Không | Không |
| Tạo Project | Có | Không mặc định | Không |
| Xem toàn tenant phục vụ governance | Có | Không | Không |
| Quản lý Project metadata/lifecycle | Chỉ khi là PM hoặc administrative fallback có audit | Có | Không |
| Quản lý Participants | Chỉ khi là PM hoặc administrative fallback có audit | Có | Không |
| Cấu hình Board Status/Modules | Chỉ khi là PM hoặc administrative fallback có audit | Có | Không |
| Tạo Task | Nếu đồng thời là Project Member | Có | Có theo policy |
| Quản lý Task management fields | Nếu đồng thời là PM | Có | Hạn chế |
| Cập nhật Task execution fields | Nếu đồng thời có quyền thực thi | Có | Có với Task được phép |
| Approve Task | Chỉ khi được chỉ định approver | Nếu được chỉ định | Nếu được chỉ định |
| Xem Audit Log tenant | Có | Không mặc định | Không |

Administrative fallback là thao tác quản trị có chủ đích và phải được audit; hệ thống không âm thầm biến Owner/Admin thành Project Manager.

## 5. Onboarding và thiết lập Organization

TaskForge ưu tiên onboarding ít ma sát, đặc biệt cho solo user.

### 5.1. Sau khi đăng ký

Signup chỉ tạo `User` global identity. User chưa mặc định thuộc Organization nào.

Sau signup/login, User có hai hướng:

```text
Create an Organization
OR
Accept an Organization Invitation
```

### 5.2. Tạo Organization mới

Khi User tạo Organization, TaskForge tạo trong cùng business operation:

- Organization mới;
- active Membership của creator với role `OWNER`;
- Team mặc định `General`;
- creator được thêm vào Team `General`.

Ví dụ:

```text
Organization: Minh Workspace
│
├── Members
│   └── Minh -> OWNER
│
├── Teams
│   └── General
│       └── Minh
│
└── Projects
```

Default Team giúp solo user có thể bắt đầu làm việc ngay mà không phải tự tạo Organization -> Team -> Team Member theo nhiều bước cứng nhắc.

### 5.3. Tạo Project đầu tiên

Khi solo Owner tạo Project mới, TaskForge có thể mặc định:

- thêm Team `General` vào Participating Teams;
- thêm creator vào Project Members;
- gán creator role `PROJECT_MANAGER`.

User-facing flow có thể chỉ là:

```text
Sign up
-> Create workspace
-> Create project
-> Start working
```

Domain setup phía sau vẫn tuân thủ các invariant Organization/Team/Project.

### 5.4. Join Organization qua invitation

- Owner/Admin gửi Organization invitation.
- Invitation có lifecycle riêng.
- User accept invitation để tạo/kích hoạt Membership.
- Sau đó Owner/Admin có thể thêm Member vào một hoặc nhiều Team.
- Project Manager chỉ có thể chọn User làm Project Member nếu User thỏa điều kiện Participants của Project.

## 6. Membership và Invitation lifecycle

### 6.1. Membership

Membership lifecycle baseline:

```text
ACTIVE
SUSPENDED
REVOKED
LEFT
```

Rules:

- Organization role chỉ có hiệu lực khi Membership đang `ACTIVE`.
- Mỗi cặp User–Organization có tối đa một Membership có hiệu lực theo policy.
- Organization luôn phải có đúng một active Owner.
- Transfer Owner phải là một business operation atomic.
- Không thể suspend/revoke/leave nếu thao tác làm mất Owner cuối cùng.
- Leave/revoke Membership không xóa User identity hoặc business history.
- Suspend/revoke Membership phải làm mất quyền Project/Team execution tương ứng nhưng không xóa lịch sử đã tạo.

### 6.2. Invitation

Invitation lifecycle baseline:

```text
PENDING
ACCEPTED
REJECTED
REVOKED
EXPIRED
```

Rules:

- Không tạo invitation mới nếu User đã có active Membership trong Organization.
- Duplicate pending invitation cho cùng Organization/email phải được kiểm soát.
- Invitation chỉ tạo quyền Organization; Team/Project participation được thiết lập sau khi Membership hợp lệ.

## 7. Team

- Owner/Admin tạo, sửa, archive Team và quản lý Team Member.
- Chỉ active Membership của cùng Organization được thêm vào Team.
- Một Member có thể thuộc nhiều Team.
- Team không có role hoặc Lead trong baseline v0.3.
- Archive Team không được làm phá vỡ active Project/Task dependency.
- Không được archive/remove một Team khỏi phạm vi sử dụng nếu Team vẫn là Participating Team của active Project hoặc đang là owning Team của active Task, trừ khi các dependency đã được xử lý hợp lệ.
- Default Team `General` có thể được archive sau khi các Project/Task liên quan đã được chuyển sang Team khác.

## 8. Project model và Participants

### 8.1. Project lifecycle

Project lifecycle baseline:

```text
DRAFT -> ACTIVE -> COMPLETED -> ARCHIVED
```

Rules:

- `DRAFT`: Project đang được cấu hình và chuẩn bị.
- `ACTIVE`: Project đang được thực thi.
- `COMPLETED`: mục tiêu Project đã hoàn tất; không tạo công việc active mới theo flow thông thường.
- `ARCHIVED`: Project ở chế độ lưu trữ/read-only, trừ restore/administrative operation.
- Không được chuyển Project sang `COMPLETED` khi còn Task chưa ở terminal semantic state (`COMPLETED` hoặc `CANCELLED`).
- Project đã `COMPLETED` có thể reopen về `ACTIVE` theo quyền và phải ghi Activity/Audit phù hợp.
- Active Project phải có ít nhất một active `PROJECT_MANAGER`.

### 8.2. Participants

Participants gồm hai tập:

```text
Participants
├── Participating Teams
└── Project Members
```

#### Participating Teams

- Chỉ Team thuộc cùng Organization mới được tham gia Project.
- Một Project có thể có một hoặc nhiều Participating Team.
- Một Team có thể tham gia nhiều Project.
- Add Team vào Project không tự động add toàn bộ Team Member thành Project Member.

#### Project Members

- Project Member phải có active Organization Membership.
- Project Member phải thuộc ít nhất một Participating Team của Project.
- Một User chỉ có một Project Membership trong cùng Project.
- Mỗi Project Member có đúng một role: `PROJECT_MANAGER` hoặc `CONTRIBUTOR`.
- Project Manager cũng phải là Project Member và thuộc ít nhất một Participating Team.
- Active Project luôn phải có ít nhất một Project Manager.

#### Add Participants flow

Baseline UX/business flow:

```text
Create/Edit Project
-> Choose Participating Teams
-> Choose Project Members from those Teams
-> Assign Project Role
```

### 8.3. Remove Participant rules

Không được remove Participating Team nếu:

- Team còn là owning Team của active Task;
- việc remove làm một Project Member không còn thuộc bất kỳ Participating Team nào;
- các dependency Project-level khác chưa được xử lý.

Không được remove Project Member nếu:

- User còn active Task assignment chưa được reassign/unassign theo policy;
- User là Project Manager cuối cùng của active Project.

Việc remove phải xử lý dependency rõ ràng trước khi hoàn tất; không để orphaned assignment hoặc permission state.

## 9. Project Core capabilities và module system

Mỗi Project có một tập **Core capabilities** luôn tồn tại và một tập **Enabled Modules** được bật/tắt theo Project.

### 9.1. Overview

Overview là trang tổng hợp Project, không phải business source of truth riêng. Nó hiển thị tối thiểu:

- metadata và lifecycle của Project;
- Participating Teams và Project Members;
- tổng số Task và phân bố theo status;
- Task sắp/quá hạn;
- progress tổng hợp;
- summary từ các module đang bật khi phù hợp.

### 9.2. Tasks

Tasks là capability cốt lõi và là nơi thực thi công việc chính.

Task management cung cấp tối thiểu:

```text
Tasks
├── Board View      <- primary workflow view
└── List View       <- dense/filterable management view
```

Board/List cùng phản ánh Task data; Board không sở hữu state riêng ngoài Task Status/position cần thiết.

### 9.3. Activity

Activity là timeline thân thiện với người dùng, phản ánh các thay đổi có ý nghĩa cộng tác như:

- Task được tạo hoặc đổi status;
- assignee/owning Team thay đổi;
- checklist thay đổi;
- comment được thêm;
- approval được request/cancel/approve/reject;
- Participants thay đổi;
- Project lifecycle thay đổi.

Activity khác Audit Log và không dùng thay cho Audit Log.

### 9.4. Enabled Modules của v1

Project v1 hỗ trợ bốn module tùy chọn cố định:

| Module | Vai trò |
|---|---|
| Milestones | Lập kế hoạch theo mốc/giai đoạn lớn của Project |
| Documents | Lưu knowledge/nội dung được tạo và duy trì trong TaskForge |
| Files | Project-wide file/asset library |
| Risks | Theo dõi rủi ro có thể ảnh hưởng mục tiêu Project |

Rules chung:

- Project Manager bật/tắt module theo Project policy.
- Tắt module không hard-delete dữ liệu cũ.
- Dữ liệu/relationship cũ vẫn được giữ để bảo toàn history.
- Module bị tắt không cho tạo/mutate business data mới theo flow thông thường cho đến khi bật lại.
- Bật lại module khôi phục khả năng sử dụng dữ liệu đã tồn tại.

### 9.5. Module roadmap, chưa thuộc v1

- Goals / Objectives;
- Meetings;
- Issues;
- Decisions;
- Budget;
- KPIs / Metrics;
- Calendar / Timeline view;
- Reports nâng cao.

TaskForge v1 không hỗ trợ user tự định nghĩa entity/module tùy ý. `Custom Entity`, `Custom Collection`, `Custom Field Builder` và low-code schema builder nằm ngoài phạm vi.

## 10. Task model

Task có tối thiểu:

- title, description;
- Project;
- owning Team;
- zero or more assignees;
- status;
- priority;
- due date;
- progress;
- creator;
- optional Milestone khi module Milestones được bật;
- checklist;
- comment;
- attachment;
- optional approval requirement và approver;
- activity/history liên quan.

### 10.1. Task invariants

- Task luôn thuộc đúng một Project.
- Owning Team phải là Participating Team của Project.
- Assignee phải vừa là active Project Member, vừa thuộc owning Team.
- Multi-assignee thể hiện shared responsibility; Task chỉ có một workflow state chung, không có status riêng cho từng assignee trong v1.
- Task attachment là core Task capability, không phụ thuộc việc Project có bật Files module hay không.
- `Files` module chỉ bổ sung Project-wide file library.

### 10.2. Task management fields và execution fields

TaskForge tách hai nhóm capability để tránh một quyền `editTask` quá rộng.

**Management fields** bao gồm tối thiểu:

- owning Team;
- assignees;
- priority;
- due date;
- approval configuration;
- Milestone assignment khi module được bật.

Project Manager có quyền quản lý các field này trong Project. Creator có thể thiết lập các giá trị hợp lệ khi tạo Task; các mutation sau đó tuân resource policy.

**Execution fields/capabilities** bao gồm tối thiểu:

- status;
- progress;
- checklist;
- comment;
- attachment;
- nội dung Task trong phạm vi policy.

Contributor/assignee có thể thao tác execution fields trên Task được phép.

## 11. Task Status và Board workflow

TaskForge tách **status hiển thị** khỏi **semantic category**. Mỗi Project quản lý danh sách Task Status của riêng mình.

Một Task Status có tối thiểu:

- `name`: tên hiển thị như `To Do`, `In Review`, `Waiting Client`, `Done`;
- `semantic category`;
- `position`: thứ tự column trên Board;
- lifecycle active/archived hoặc equivalent.

Semantic category v1:

```text
NOT_STARTED
IN_PROGRESS
REVIEW
COMPLETED
CANCELLED
```

Ý nghĩa:

- `NOT_STARTED`: công việc chưa bắt đầu;
- `IN_PROGRESS`: công việc đang được thực hiện;
- `REVIEW`: công việc đang ở bước review/kiểm tra/chờ phản hồi; **không đồng nghĩa với approval**;
- `COMPLETED`: công việc đã hoàn tất;
- `CANCELLED`: công việc bị hủy/dropped/won't do và không được tính như completed work.

Project mới có thể sử dụng workflow mặc định:

```text
To Do | In Progress | In Review | Done
```

nhưng Project có thể thêm, đổi tên và sắp xếp status, ví dụ:

```text
Backlog | Doing | Waiting Client | QA | Done | Cancelled
```

Baseline status rules:

- Project luôn phải có ít nhất một active status thuộc `NOT_STARTED`, một thuộc `IN_PROGRESS` và một thuộc `COMPLETED`.
- `REVIEW` và `CANCELLED` là semantic category tùy chọn theo workflow Project.
- Project có thể có nhiều status cùng semantic category.
- Status đang được Task sử dụng không được hard delete trực tiếp; Task phải được migrate hoặc status được archive theo policy.
- Không được gán Task sang status thuộc Project khác.
- Board column được render theo Task Status configuration và `position`.
- `position` chỉ quyết định thứ tự hiển thị, không tự định nghĩa transition permission.
- V1 không hỗ trợ arbitrary transition graph hoặc workflow scripting.

Baseline semantic transition:

```text
NOT_STARTED <-> IN_PROGRESS
IN_PROGRESS -> REVIEW
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
REVIEW -> IN_PROGRESS
REVIEW -> REVIEW
REVIEW -> COMPLETED
REVIEW -> CANCELLED
COMPLETED -> IN_PROGRESS      (reopen, theo quyền)
CANCELLED -> IN_PROGRESS      (reopen, theo quyền)
```

Transition giữa hai status cùng semantic category được phép khi Project/resource policy cho phép.

## 12. Progress và Checklist

- Khi Task có checklist item, checklist là nguồn tính progress.
- Khi Task không có checklist, người có quyền có thể cập nhật progress thủ công từ `0..100`.
- Task không được chuyển sang semantic `COMPLETED` nếu còn checklist item chưa hoàn thành.
- Task ở semantic `COMPLETED` có effective progress `100%`.
- Task ở semantic `CANCELLED` không được tính như completed work trong completion metrics.

## 13. Approval

Approval là **capability tùy chọn của Task**, độc lập với Task Status.

`In Review`, `QA`, `Waiting Client` hoặc bất kỳ status thuộc semantic `REVIEW` **không tự động có nghĩa Task cần approval**.

Một Task có thể có:

```text
requiresApproval = false
```

hoặc:

```text
requiresApproval = true
approver = one eligible Project Member
```

Approval state khái niệm:

```text
NOT_REQUIRED
PENDING
APPROVED
REJECTED
```

### 13.1. Approval policy v1

- Approval không bắt buộc cho tất cả Task.
- Creator/assignee có thể cấu hình `requiresApproval` theo business need trước khi approval request được submit, trong phạm vi policy.
- Khi `requiresApproval = true`, phải chỉ định đúng một approver hợp lệ trong v1.
- Approver phải là active Project Member tại thời điểm approval.
- V1 không hỗ trợ quorum, sequential approval hoặc multi-stage approval.
- Sau khi approval đã ở `PENDING`, không được bypass bằng cách tắt `requiresApproval` qua generic Task edit.
- Nếu cần hủy approval request, phải dùng business action riêng như `Cancel Approval Request`, có reason và audit/history phù hợp.
- Task có `requiresApproval = true` không được đi vào semantic `COMPLETED` khi chưa có approval hợp lệ.
- Approval có thể được request khi Task đang ở bất kỳ non-terminal status phù hợp với policy; approval state không bị suy ra từ `REVIEW` status.
- Approve/reject tạo Approval History; không overwrite lịch sử cũ.
- `REJECTED` không bắt buộc tự động đổi Task về một status cụ thể; Project/user tiếp tục workflow Task theo transition hợp lệ.
- Chính sách self-approval chi tiết có thể được khóa ở Task Approval specification riêng; Business Scope v0.3 chỉ yêu cầu approver phải là Project Member hợp lệ.

## 14. Milestones

Khi module Milestones được bật:

- Milestone thuộc đúng một Project.
- Milestone có tên, mô tả, thời hạn và lifecycle status.
- Task có thể không thuộc Milestone; nếu thuộc thì tối đa một Milestone trong v1.
- Milestone progress được aggregate từ Task nhưng đóng Milestone là explicit action.
- Completed/closed Milestone không nhận Task mới trừ khi được reopen.
- Milestone không tạo role mới.
- Khi module Milestones bị tắt, relationship cũ vẫn được giữ nhưng flow tạo/chỉnh sửa Milestone mới bị chặn theo module policy.

## 15. Documents

Khi module Documents được bật:

- Project có thể tạo và quản lý knowledge nội bộ.
- Document tối thiểu có title, content, author, timestamps và trạng thái archive/delete mềm.
- Project Member có thể đọc Document trong Project theo visibility policy.
- Quyền create/edit/archive chi tiết được xác định theo Project role/resource ownership trong specification của module.
- Documents không cố thay thế Google Docs hoặc collaborative editor thời gian thực trong v1.

## 16. Files và Attachment

Task Attachment và Project Files là hai capability liên quan nhưng không đồng nhất.

### Task Attachment

- Là core Task capability.
- Task vẫn có thể có attachment khi Files module bị tắt.
- Attachment phải giữ Organization/Project/Task context hợp lệ.

### Project Files module

- Là Project-wide file/asset library.
- File metadata thuộc Project/Organization context.
- Task attachment có thể reuse cùng storage capability nhưng relationship phải rõ ràng.
- File bị xóa nghiệp vụ không được làm phá vỡ audit/history còn cần tham chiếu.

## 17. Risks

Khi module Risks được bật:

- Risk biểu diễn điều có khả năng xảy ra và ảnh hưởng đến Project, không phải vấn đề đã xảy ra.
- Risk tối thiểu có title, description, probability/likelihood, impact, owner, mitigation và status.
- Risk workflow v1 có thể giữ đơn giản như `Open -> Mitigating -> Resolved`.
- Risk có thể liên kết Task mitigation nhưng không tạo permission layer mới.

## 18. Comment và cộng tác

- Active Project Member có thể đọc Comment của Task trong Project theo visibility policy.
- Project Member có thể thêm Comment vào Task được phép xem.
- Author có thể sửa/xóa Comment của mình theo policy; Project Manager/Owner/Admin có moderation permission theo scope phù hợp.
- Comment dùng soft delete để giữ context.
- Mention cơ bản có thể tạo Notification.
- Mention candidate nên giới hạn trong active Project Members có liên quan.
- Chat, nested discussion engine phức tạp và collaborative editing thời gian thực nằm ngoài v1.

## 19. Notification

- Notification là side effect của business event, không phải source of truth.
- Kênh v1: in-app và email cho event quan trọng.
- Event tối thiểu gồm Organization invitation, Task assignment, due/overdue reminder, approval request và approval result.
- Recipient phải được resolve trong đúng Organization/Project context và còn quyền phù hợp tại thời điểm gửi.
- Duplicate delivery phải được kiểm soát ở implementation layer.
- Notification failure không được làm mất một business state đã được commit hợp lệ.

## 20. Activity và Audit Log

`Activity` và `Audit Log` là hai concept khác nhau:

- Activity phục vụ collaboration và timeline người dùng.
- Audit Log phục vụ governance, security và administrative evidence.

Audit Log tối thiểu bao phủ:

- authentication/security-sensitive event;
- Membership/Organization role change;
- Owner transfer;
- Team configuration/membership change;
- Project configuration/lifecycle change;
- Participant/Project role change;
- sensitive Task assignment/status/approval operation;
- module enable/disable;
- archive/restore hoặc business deletion quan trọng.

Audit Log là append-only đối với application user. Password, token, secret và sensitive credential không được ghi vào log.

Audit Log cung cấp khả năng truy vết; nó không thay thế authorization hoặc business validation.

## 21. Search, dashboard và báo cáo cơ bản

- Search/filter Task theo Project, Team, assignee, status, semantic category, priority, due date và Milestone khi module được bật.
- Dashboard cá nhân hiển thị assigned Tasks, due/overdue Tasks và approval đang chờ nếu User là approver.
- Project Overview hiển thị aggregate cơ bản.
- Team/Project dashboard có thể hiển thị workload/progress cơ bản.
- `CANCELLED` Task không được tính như completed Task trong completion metrics.
- Aggregate, search và report phải áp dụng cùng tenant/visibility policy như resource detail.

## 22. Các luồng nghiệp vụ chính

### Luồng A — Đăng ký và tạo workspace

1. User đăng ký và xác minh identity.
2. Signup chỉ tạo global User; chưa tự động gán Organization.
3. User chọn Create Organization hoặc Accept Invitation.
4. Nếu tạo Organization, hệ thống tạo Organization + Owner Membership + Team `General` + add creator vào General.
5. User chọn active Organization làm workspace hiện tại.

### Luồng B — Mời thành viên và tổ chức Team

1. Owner/Admin gửi Organization invitation.
2. Người nhận accept để tạo/kích hoạt Membership.
3. Owner/Admin thêm active Member vào một hoặc nhiều Team.
4. Team chỉ là organizational grouping; không có Team role.
5. Revoke/suspend/leave Membership chặn tenant/project access nhưng không xóa history.

### Luồng C — Tạo Project và Participants

1. Owner/Admin tạo Project hoặc solo Owner tạo Project đầu tiên.
2. Project phải có ít nhất một Participating Team.
3. Solo flow có thể auto-select Team `General`.
4. Project Members được chọn từ member của Participating Teams; không auto-add toàn bộ Team Member.
5. Mỗi Project Member nhận role `PROJECT_MANAGER` hoặc `CONTRIBUTOR`.
6. Creator Project trong solo flow được auto-gán `PROJECT_MANAGER`.
7. Active Project phải luôn có ít nhất một Project Manager.

### Luồng D — Lập kế hoạch và thực thi Task

1. Project Manager cấu hình Board statuses/modules khi cần.
2. Project Member tạo Task cho owning Team hợp lệ theo policy.
3. Assignee chỉ được chọn trong intersection: Project Members ∩ owning Team members.
4. Contributor/assignee cập nhật execution fields.
5. Project Manager điều phối management fields.
6. Board/List phản ánh cùng Task state.
7. Hệ thống tạo Activity/Notification phù hợp.

### Luồng E — Hoàn thành Task thông thường

1. Task đang ở non-terminal status và `requiresApproval = false`.
2. Checklist nếu tồn tại phải hoàn thành.
3. Người có quyền chuyển Task sang status semantic `COMPLETED` qua transition hợp lệ.
4. Effective progress trở thành 100%.
5. Hệ thống ghi Activity và side effects liên quan.

### Luồng F — Task cần approval

1. Creator/assignee cấu hình `requiresApproval = true` theo policy và chọn một approver hợp lệ.
2. Người có quyền submit approval request; approval state thành `PENDING`.
3. Task Status vẫn tiếp tục là workflow state độc lập và không bắt buộc phải là `REVIEW`.
4. Approver approve hoặc reject.
5. Nếu approved, Task được phép đi vào `COMPLETED` khi các invariant khác thỏa mãn.
6. Nếu rejected, Task không được coi là completed; workflow status tiếp tục theo transition hợp lệ.
7. Nếu cần cancel approval request, phải dùng business action riêng có reason/audit.
8. Hệ thống lưu Approval History, Activity, Audit Log và Notification phù hợp.

### Luồng G — Quản lý Project modules

1. Project Manager bật module được hỗ trợ.
2. Module xuất hiện trong Project navigation và cho phép tạo dữ liệu tương ứng.
3. Khi module bị tắt, dữ liệu hiện có không bị hard delete mặc định.
4. Dữ liệu/relationship cũ được giữ nhưng mutation mới bị chặn theo policy.
5. Bật lại module khôi phục khả năng sử dụng dữ liệu đã tồn tại.

### Luồng H — Remove Team/Project Member

1. Project Manager yêu cầu remove Participating Team hoặc Project Member.
2. Hệ thống kiểm tra active Task ownership/assignment và Project Manager invariant.
3. Dependency phải được reassign/unassign/resolve trước khi remove.
4. Không tạo orphaned Task assignment hoặc Project không có Manager.
5. Hoàn tất removal và ghi Activity/Audit phù hợp.

## 23. Business invariant bắt buộc

Các điều kiện sau là acceptance criteria cấp domain:

1. Không có query, mutation, background job, export, search hoặc aggregate nào làm rò dữ liệu giữa các Organization.
2. Organization role chỉ đến từ active Membership của active Organization.
3. Resource ID hợp lệ không đồng nghĩa với được phép truy cập; mọi liên kết chéo phải kiểm tra tenant ownership và visibility.
4. Team, Project, Task, module data và các object liên quan phải thuộc cùng Organization.
5. Team không mang Project management authority; Project permission chỉ đến từ Project Membership/role hoặc administrative fallback được audit.
6. Participating Team của Project phải là Team thuộc cùng Organization.
7. Add Team vào Project không tự động add toàn bộ Team Member làm Project Member.
8. Project Member phải là active Organization Member và thuộc ít nhất một Participating Team.
9. Một User có tối đa một Project Membership trong cùng Project.
10. Mỗi Project Member có đúng một Project role: `PROJECT_MANAGER` hoặc `CONTRIBUTOR`.
11. Active Project luôn phải có ít nhất một active Project Manager.
12. Owning Team của Task phải là Participating Team của Project.
13. Task chỉ được assign cho User vừa là active Project Member vừa thuộc owning Team.
14. Organization không được mất active Owner cuối cùng.
15. Project không được mất active Project Manager cuối cùng khi Project còn active.
16. Membership lifecycle phải dùng state hợp lệ: `ACTIVE`, `SUSPENDED`, `REVOKED`, `LEFT`.
17. Invitation lifecycle phải dùng state hợp lệ: `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, `EXPIRED`.
18. Project lifecycle phải tuân `DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED` và các transition hợp lệ.
19. Project không được chuyển `COMPLETED` khi còn Task chưa ở terminal semantic state.
20. Mọi Task Status phải thuộc cùng Project với Task và map vào semantic category hợp lệ.
21. Project luôn phải duy trì ít nhất một status thuộc `NOT_STARTED`, `IN_PROGRESS` và `COMPLETED`.
22. Status đang được Task sử dụng không được hard delete nếu chưa migrate/resolve Task liên quan.
23. Status `position` chỉ phục vụ ordering, không tự định nghĩa workflow permission.
24. `REVIEW` status không đồng nghĩa với approval.
25. `CANCELLED` không được tính như completed work.
26. Task có checklist chưa hoàn thành không được chuyển sang semantic `COMPLETED`.
27. Task ở semantic `COMPLETED` có effective progress 100%.
28. Khi checklist tồn tại, checklist là nguồn tính progress.
29. Approval là state/capability độc lập với Task Status.
30. Task có `requiresApproval = true` không được đi vào semantic `COMPLETED` khi chưa có approval hợp lệ.
31. Sau khi approval request ở `PENDING`, không được bypass approval bằng generic Task update; cancel phải là business action riêng.
32. V1 chỉ có một approver được chỉ định cho mỗi approval request; không có quorum/sequential approval.
33. Task Attachment là core capability và không phụ thuộc Files module.
34. Tắt Project module không mặc định làm mất data/relationship lịch sử của module đó.
35. Không được remove Participating Team khi còn unresolved owning Task/dependency.
36. Không được remove Project Member khi việc remove tạo orphaned active assignment hoặc làm mất Project Manager cuối cùng.
37. Multi-step operation làm thay đổi quyền hoặc critical state phải bảo toàn business invariant.
38. Notification và Activity không được trở thành source of truth nghiệp vụ.
39. Archive/soft delete là mặc định cho business data có history; hard delete chỉ dùng theo retention/operational policy.
40. Audit Log là append-only đối với application user và không thay thế authorization/business validation.
41. Search, list, dashboard, Board, report và Overview phải áp dụng cùng visibility policy với resource detail.

## 24. Phạm vi phát hành v1

### 24.1. Core product

- Authentication và global User identity.
- Multi-Organization Membership, invitation và workspace switch.
- Organization roles: Owner/Admin/Member.
- Team và Team membership, không có Team Lead.
- Solo-friendly onboarding với default `General` Team.
- Project lifecycle.
- Participating Teams + Project Members.
- Project roles: Project Manager/Contributor.
- Project Overview.
- Task Board + List.
- Project-configurable Task Status/Board columns với semantic category.
- Task assignment, owning Team, priority, due date và progress.
- Checklist, Comment và Task Attachment.
- Optional Task approval độc lập với Task Status.
- Activity, Notification và Audit Log.
- Search/filter và dashboard/report cơ bản.

### 24.2. Optional modules v1

- Milestones.
- Documents.
- Files.
- Risks.

### 24.3. Future roadmap

- Goals / Objectives.
- Meetings.
- Issues.
- Decisions.
- Budget.
- KPIs / Metrics.
- Calendar / Timeline.
- Advanced Reports.
- Direct individual Project participation không cần Participating Team.
- Guest/external collaborator.
- Project permission model nâng cao nếu business need phát sinh.

## 25. Ngoài phạm vi v1

- Sprint, backlog Scrum, story point, velocity và đầy đủ Agile ceremony.
- Epic/Story model chuyên biệt cho software development.
- Full custom workflow engine cho phép user tự định nghĩa arbitrary transition graph, transition permission hoặc workflow scripting.
- Custom field/form/entity/collection builder.
- Arbitrary user-defined Project modules.
- Project template marketplace hoặc generic template engine.
- Billing, subscription, quota plan và payment.
- Time tracking, timesheet, payroll và invoicing.
- Advanced Gantt, critical path, portfolio management và dependency planning.
- Advanced BI/data warehouse/resource forecasting.
- Full chat platform, video call hoặc collaborative document editing thời gian thực.
- Multi-stage/quorum/sequential approval engine.
- Public integration platform/webhook marketplace diện rộng.
- Native mobile app và offline-first.
- Enterprise SSO/SAML/SCIM và enterprise policy engine.

## 26. Quyết định baseline đã chốt

1. `Organization` là tenant; `User` là global identity; `Membership` là nguồn Organization role.
2. Signup chỉ tạo global User; User tạo Organization hoặc accept invitation sau đó.
3. Khi tạo Organization, hệ thống tạo Owner Membership và default Team `General` để giảm onboarding friction.
4. Team tồn tại ở cấp Organization và có thể tái sử dụng giữa nhiều Project.
5. Team không có `TEAM_LEAD`; Team chỉ là organizational grouping.
6. Team và Project là hai aggregate ngang cấp trong Organization.
7. Participants gồm `Participating Teams` và `Project Members`.
8. Add Participating Team không tự động add toàn bộ Team Member vào Project.
9. Project Member phải thuộc ít nhất một Participating Team.
10. Project có hai role v1: `PROJECT_MANAGER` và `CONTRIBUTOR`.
11. Active Project phải có ít nhất một Project Manager.
12. Organization Owner/Admin phục vụ tenant governance; không mặc nhiên là Project Manager.
13. Owner/Admin tenant-wide visibility không đồng nghĩa quyền mutation mọi Project/Task.
14. Project có thể có nhiều Participating Team; mỗi Task có đúng một owning Team.
15. Owning Team phải tham gia Project.
16. Task assignee phải vừa là Project Member vừa thuộc owning Team.
17. Task Status được cấu hình theo Project và map vào semantic category `NOT_STARTED`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`, `CANCELLED`.
18. `REVIEW` chỉ là workflow semantic; không đồng nghĩa approval.
19. Approval là optional capability độc lập của Task.
20. Creator/assignee có thể cấu hình approval trước submission theo policy; sau khi pending phải dùng business action riêng để cancel.
21. V1 dùng một approver được chỉ định; không có multi-approver workflow.
22. Checklist phải hoàn thành trước khi Task vào `COMPLETED`; Completed có effective progress 100%.
23. Task permission phân biệt management fields và execution fields.
24. Task Attachment không phụ thuộc Project Files module.
25. Project lifecycle là `DRAFT -> ACTIVE -> COMPLETED -> ARCHIVED`; không complete khi còn non-terminal Task.
26. Module có thể bật/tắt; tắt module không hard-delete data mặc định.
27. V1 có bốn optional module cố định: Milestones, Documents, Files, Risks.
28. Activity phục vụ collaboration; Audit Log phục vụ governance/security và không gộp thành một concept.
29. Archive/soft delete là hành vi xóa nghiệp vụ mặc định.
30. TaskForge giữ core domain generic, không đưa entity IT-specific như Sprint/Epic/Story/Repository vào business core.

## 27. Điểm còn mở nhưng không chặn Business Scope v0.3

Các quyết định dưới đây chưa cần khóa ở Business Scope tổng quát và có thể được chốt trong specification của vertical slice tương ứng:

- Có cho phép self-approval hay bắt buộc approver khác với requester/assignee.
- Chi tiết field-level permission của Contributor đối với title/description/priority/due date sau khi Task đã được tạo.
- Chính sách administrative fallback cụ thể khi Owner/Admin cần can thiệp Project nhưng không có Project role.
- Exact transition permission cho từng semantic transition theo Project role/resource ownership.

Các điểm này không được dùng để thay đổi hierarchy hoặc role model đã chốt ở v0.3.

## 28. Tiêu chí ngăn mở rộng scope

Một yêu cầu mới chỉ được thêm vào business scope hiện tại khi đồng thời:

- giải quyết trực tiếp một problem thuộc các luồng nghiệp vụ đã chốt;
- phù hợp với model Organization/Team/Project/Participants hiện tại;
- không tạo role layer mới nếu chưa có business justification rõ ràng;
- không biến Project thành generic low-code database;
- không thuộc danh sách loại trừ ở mục 25;
- có tenant, permission, lifecycle và audit invariant rõ ràng;
- có thể triển khai thành một vertical slice có acceptance criteria độc lập;
- mang lại giá trị đáng kể hơn so với độ phức tạp thêm vào.

Nếu không đạt các điều kiện trên, yêu cầu được ghi vào roadmap hoặc proposal riêng thay vì chen vào refactor hiện tại.

## 29. Ranh giới giữa Business Scope và Technical Scope

Tài liệu này khóa **business behavior và business invariants**. Các quyết định như concurrency control, transaction isolation, outbox pattern, cache strategy, real-time transport, object storage implementation, search engine, observability và deployment architecture thuộc Technical Architecture/Specification riêng.

Technical solution phải phục vụ các business invariant trong tài liệu này, nhưng không được đưa thêm business complexity chỉ để trình diễn kỹ thuật.
