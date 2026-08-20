# Phạm vi nghiệp vụ TaskForge

> Trạng thái: Baseline đề xuất v0.1, ngày 2026-08-16. Đây là hợp đồng phạm vi sản phẩm để chủ dự án duyệt và điều chỉnh. Tài liệu mô tả sản phẩm muốn hướng đến; source code mô tả phần đang chạy và `.spec-kit/` mô tả kế hoạch triển khai.

## 1. Định nghĩa sản phẩm

TaskForge là hệ thống quản lý dự án và thực thi công việc theo mô hình SaaS multi-tenant, dành cho các nhóm nội bộ, nhóm sản phẩm và agency quy mô nhỏ đến vừa. Sản phẩm giúp một người tham gia nhiều tổ chức, chuyển đổi workspace, tổ chức nhân sự thành team, lập kế hoạch theo project/milestone và theo dõi task đến khi hoàn thành hoặc được phê duyệt.

TaskForge ưu tiên ba giá trị:

1. Ranh giới dữ liệu và quyền hạn giữa các organization phải rõ ràng.
2. Luồng giao việc, phối hợp và phê duyệt phải đủ đơn giản để dùng hằng ngày.
3. Mọi thay đổi quan trọng phải truy vết được mà không biến sản phẩm thành một bộ công cụ quản trị doanh nghiệp phức tạp.

Quy mô 5–100 thành viên trong một organization là nhóm khách hàng mục tiêu ban đầu, không phải giới hạn kỹ thuật hay giới hạn gói giá.

## 2. Vấn đề sản phẩm giải quyết

Một organization cần có thể:

- quản lý thành viên và vai trò trong đúng workspace;
- gom thành viên thành các team có người điều phối;
- giao một hoặc nhiều team cùng tham gia project;
- chia mục tiêu của project thành milestone và task;
- phân công, theo dõi tiến độ, trao đổi và kiểm soát task cần phê duyệt;
- nhận thông báo đúng người, xem lịch sử hoạt động và truy cứu thao tác quản trị;
- bảo đảm người của organization này không đọc hoặc sửa dữ liệu của organization khác.

Sản phẩm không hướng tới thay thế Jira ở mức cấu hình sâu, hệ thống ERP, công cụ chat thời gian thực hay nền tảng tài chính/nhân sự.

## 3. Ranh giới tenant và mô hình nghiệp vụ

`User` là danh tính toàn hệ thống. `Organization` là tenant và là ranh giới dữ liệu. Quan hệ giữa hai đối tượng được biểu diễn bằng `Membership`; role không phải thuộc tính toàn cục của User.

```text
User
  └─ Membership ──> Organization
                      ├─ Team
                      ├─ Project
                      │   ├─ Milestone (không bắt buộc)
                      │   └─ Task
                      │       ├─ Checklist item
                      │       ├─ Comment
                      │       ├─ Attachment
                      │       └─ Approval history
                      ├─ Notification
                      ├─ Activity
                      └─ Audit Log
```

Các quan hệ mục tiêu:

- Một User có thể có nhiều Membership tại nhiều Organization.
- Một Organization có đúng một active Owner tại một thời điểm và có thể có nhiều Admin.
- Một Team chỉ thuộc một Organization, có một hoặc nhiều Team Lead và nhiều Member.
- Chỉ active Membership của Organization mới được thêm vào Team. Không có lời mời bên ngoài riêng cho Team; người ngoài phải được mời vào Organization trước.
- Một Project chỉ thuộc một Organization và được giao cho một hoặc nhiều Team trong Organization đó.
- Một Task thuộc đúng một Project và có đúng một owning Team. Task có thể thuộc tối đa một Milestone và có nhiều assignee.
- Milestone không được dùng chung giữa các Project.
- Comment, Approval, Activity, Notification và Audit Log luôn mang ngữ cảnh Organization; đối tượng con không thể tham chiếu đối tượng của tenant khác.

## 4. Vai trò và nguyên tắc phân quyền

TaskForge có hai lớp quyền, không tạo thêm lớp `ProjectRole` trong phạm vi hiện tại:

| Lớp quyền | Vai trò | Ý nghĩa |
|---|---|---|
| Organization | Owner | Sở hữu workspace, quản lý cấu hình và các thao tác nhạy cảm nhất |
| Organization | Admin | Quản lý thành viên, team, project và cấu hình vận hành; không được chuyển quyền sở hữu hoặc xóa Owner |
| Team | Team Lead | Điều phối công việc và phê duyệt task của team mình |
| Team | Member | Tham gia thực thi công việc của team |

Quyền quản trị Organization không mặc nhiên là quyền sửa hoặc phê duyệt mọi Task. Owner/Admin nhìn thấy toàn bộ dữ liệu trong tenant để quản trị, nhưng nghiệp vụ thực thi task vẫn thuộc Team Lead, người tạo và assignee. Quy tắc này giữ tách biệt giữa quản trị workspace và điều hành công việc.

### Ma trận quyền mục tiêu

| Hành động | Owner | Admin | Team Lead | Member |
|---|:---:|:---:|:---:|:---:|
| Xem toàn bộ dữ liệu Organization | Có | Có | Không | Không |
| Sửa cấu hình Organization | Có | Có, trừ thao tác Owner | Không | Không |
| Chuyển quyền sở hữu/đóng Organization | Có | Không | Không | Không |
| Mời, khóa hoặc đổi org role thành viên | Có | Có, trong giới hạn Owner | Không | Không |
| Tạo và quản lý Team | Có | Có | Team mình, phạm vi hạn chế | Không |
| Tạo và quản lý Project | Có | Có | Project được giao, phạm vi công việc | Không |
| Xem Project được giao cho Team mình | Có | Có | Có | Có |
| Tạo Task trong Team/Project mình tham gia | Nếu là thành viên Team | Nếu là thành viên Team | Có | Có |
| Sửa Task | Nếu là Lead/creator/assignee | Nếu là Lead/creator/assignee | Mọi Task của Team | Task do mình tạo/được giao |
| Gửi Task đi phê duyệt | Theo quyền sửa Task | Theo quyền sửa Task | Có | Theo quyền sửa Task |
| Phê duyệt hoặc từ chối Task | Nếu là Team Lead | Nếu là Team Lead | Có | Không |
| Xem Audit Log | Có | Có | Không | Không |

Owner/Admin có thể tự thêm mình vào Team theo quy trình quản trị nếu cần can thiệp công việc; hệ thống không âm thầm bypass quyền Team.

## 5. Phạm vi chức năng mục tiêu

### 5.1. Identity, xác thực và workspace

- Đăng ký, xác minh email, đăng nhập, đăng xuất, refresh token và khôi phục/đổi mật khẩu.
- Một User dùng cùng một danh tính để tham gia nhiều Organization.
- Liệt kê các workspace mà User có active Membership và chuyển workspace đang làm việc.
- Mọi request nghiệp vụ tenant-scoped phải xác định rõ active Organization.
- Profile toàn cục chỉ chứa thông tin danh tính; role, trạng thái và ngày tham gia nằm ở Membership.

### 5.2. Organization và Membership

- Tạo Organization khi onboarding hoặc theo quyền được cấp.
- Mời người dùng qua email với org role, thời hạn và khả năng thu hồi lời mời.
- Người nhận chấp nhận hoặc từ chối lời mời; active Membership chỉ xuất hiện sau khi chấp nhận.
- Owner/Admin có thể xem danh sách, đổi role, khóa hoặc thu hồi Membership.
- Mỗi cặp User–Organization có tối đa một Membership đang có hiệu lực.
- Organization luôn có đúng một active Owner. Chuyển Owner phải là một thao tác atomic; không thể khóa hoặc rời workspace nếu điều đó làm mất Owner cuối cùng.
- “Rời Organization” và “thu hồi Membership” không xóa danh tính User hay lịch sử nghiệp vụ.

### 5.3. Team

- Owner/Admin tạo, sửa, archive Team và quản lý thành viên.
- Chỉ active Membership của cùng Organization được thêm vào Team.
- Team có ít nhất một active Team Lead khi đang hoạt động.
- Team Lead quản lý phân công và workflow của Team, nhưng không được nâng org role hay mời người ngoài Organization.
- Một thành viên có thể thuộc nhiều Team trong cùng Organization.

### 5.4. Project

- Owner/Admin tạo Project, đặt tên, mô tả, thời gian, trạng thái và gán các Team tham gia.
- Team Lead được quản lý phần công việc của Team mình trong Project đã được giao; không thay đổi cấu hình tenant hay Team khác.
- Owner/Admin xem mọi Project. Team Lead/Member chỉ xem Project được giao cho ít nhất một Team mà họ đang tham gia.
- Trong Project đã được phép xem, thành viên thấy các Task và Activity của tất cả Team tham gia để phối hợp liên team; quyền sửa, phân công và approve vẫn giới hạn theo owning Team. Private Task không thuộc phạm vi v1.
- Archive là hành vi xóa nghiệp vụ mặc định. Project đã archive ở chế độ chỉ đọc và không nhận Task mới.
- Báo cáo Project ở mức cơ bản gồm trạng thái, tiến độ, task quá hạn và phân bố task theo trạng thái; analytics nâng cao không thuộc phạm vi.

### 5.5. Milestone

- Milestone là mốc mục tiêu tùy chọn trong một Project, có tên, mô tả, thời hạn và trạng thái.
- Task có thể không thuộc Milestone nhưng vẫn bắt buộc thuộc Project.
- Milestone cung cấp tiến độ tổng hợp từ các Task; việc đóng Milestone là quyết định tường minh của người có quyền, không chỉ dựa vào phần trăm tự động.
- Milestone không tạo một lớp phân quyền mới.

### 5.6. Task, checklist và tệp đính kèm

- Thành viên Team có thể tạo Task cho owning Team trong Project mà Team được giao.
- Task có tiêu đề, mô tả, priority, thời hạn, trạng thái, progress, creator, assignee, Project, owning Team và Milestone tùy chọn.
- Mọi assignee phải có active Membership trong Organization và là thành viên của owning Team.
- Task hỗ trợ nhiều assignee, checklist, attachment cơ bản và lịch sử thay đổi.
- Khi checklist có item, progress được suy ra từ tỷ lệ item hoàn thành. Khi không có checklist, người có quyền sửa có thể cập nhật progress thủ công từ 0–100.
- Không được chuyển thẳng sang `Completed` nếu Team yêu cầu phê duyệt.
- Thay đổi trạng thái và ghi lịch sử liên quan phải atomic ở mức nghiệp vụ.

Workflow chuẩn:

```text
Pending -> In Progress -> Completed                  (không cần approval)
Pending -> In Progress -> Pending Approval
                              ├─ approve -> Completed
                              └─ reject  -> In Progress
```

- Team cấu hình `requireApproval` cho workflow của mình.
- Khi cần approval, người có quyền sửa Task gửi Task sang `Pending Approval`.
- Active Team Lead của owning Team là approver mặc định và là người nhận thông báo yêu cầu duyệt.
- Team Lead được tự phê duyệt Task do chính mình tạo hoặc thực hiện trong baseline này; hành động vẫn phải được ghi vào Approval history và Audit Log.
- Mỗi lần submit, approve hoặc reject tạo một bản ghi lịch sử Approval; không ghi đè làm mất lần xử lý trước.

### 5.7. Comment và cộng tác

- Người có quyền xem Project có thể đọc trao đổi thuộc phạm vi Project/Task mà họ được phép truy cập.
- Thành viên tham gia Project có thể thêm Comment vào Task; tác giả sửa/xóa Comment của mình trong giới hạn chính sách, Owner/Admin có quyền moderation.
- Comment lưu tác giả, thời điểm tạo/sửa và trạng thái đã xóa; xóa mềm để bảo toàn ngữ cảnh.
- Mention cơ bản có thể tạo Notification. Chat, thread phức tạp và soạn thảo cộng tác thời gian thực không thuộc phạm vi.

### 5.8. Notification

- Notification là kết quả của sự kiện nghiệp vụ, không phải nguồn sự thật cho trạng thái Task hoặc Membership.
- Kênh trong sản phẩm và email được dùng cho các sự kiện quan trọng: lời mời Organization, được giao Task, sắp/quá hạn, yêu cầu approval và kết quả approval.
- Recipient phải được xác định trong đúng Organization và theo active Membership/Team membership tại thời điểm gửi.
- Gửi lặp phải được kiểm soát bằng idempotency; lỗi gửi thông báo không được làm sai trạng thái nghiệp vụ đã cam kết.
- Push notification, SMS và tích hợp Slack/Teams để dành cho giai đoạn sau.

### 5.9. Activity và Audit Log

Hai khái niệm này tách biệt:

- `Activity` là timeline thân thiện với người dùng trên Project/Task, ví dụ đổi trạng thái, đổi assignee, thêm Comment hoặc hoàn thành checklist.
- `Audit Log` là bằng chứng quản trị bất biến, ghi Organization, actor, action, đối tượng, thời gian và metadata/before-after an toàn cho các thao tác nhạy cảm.

Audit Log tối thiểu bao phủ đăng nhập bảo mật, thay đổi Membership/role, chuyển Owner, cấu hình Team/Project, thay đổi assignee, submit/approve/reject Task và archive/xóa nghiệp vụ. Chỉ Owner/Admin được truy cập Audit Log; dữ liệu nhạy cảm như password, token và secret không bao giờ được ghi.

### 5.10. Tìm kiếm, dashboard và báo cáo cơ bản

- Tìm kiếm/lọc Task theo Project, Team, assignee, trạng thái, priority và thời hạn trong phạm vi User được xem.
- Dashboard cá nhân hiển thị Task được giao, Task sắp/quá hạn và approval cần xử lý.
- Dashboard Team/Project hiển thị số lượng và tiến độ tổng hợp cơ bản.
- Dữ liệu tổng hợp phải tuân thủ cùng ranh giới tenant và visibility như dữ liệu chi tiết.

## 6. Các luồng nghiệp vụ chính

### Luồng A — Onboarding và chuyển workspace

1. User xác minh email và tạo mật khẩu.
2. User tạo Organization đầu tiên và nhận active Owner Membership trong cùng một transaction nghiệp vụ.
3. Sau đăng nhập, User nhận danh sách Organization có active Membership.
4. User chọn active workspace; mọi request tenant-scoped sau đó gửi định danh Organization đã chọn.

### Luồng B — Mời thành viên và đưa vào Team

1. Owner/Admin gửi lời mời Organization với role.
2. Người nhận chấp nhận lời mời để kích hoạt Membership.
3. Owner/Admin thêm active Member vào một hoặc nhiều Team và chọn Team Lead nếu cần.
4. Thu hồi Membership tự động chặn quyền truy cập tenant và vô hiệu hóa quyền Team, nhưng không xóa lịch sử công việc.

### Luồng C — Lập kế hoạch và thực thi

1. Owner/Admin tạo Project và gán Team tham gia.
2. Người có quyền tạo Milestone tùy chọn.
3. Thành viên Team tạo Task cho Team mình; assignee được chọn từ chính Team đó.
4. Assignee cập nhật trạng thái, checklist, progress và trao đổi.
5. Hệ thống tạo Activity và Notification phù hợp.

### Luồng D — Hoàn thành và phê duyệt

1. Nếu Team không yêu cầu approval, người có quyền có thể hoàn thành Task.
2. Nếu Team yêu cầu approval, Task chỉ được gửi sang `Pending Approval`.
3. Team Lead approve để hoàn thành hoặc reject kèm lý do để Task quay về `In Progress`.
4. Hệ thống lưu Approval history, Activity, Audit Log và gửi kết quả cho các bên liên quan.

## 7. Business invariant bắt buộc

Các điều kiện sau là tiêu chí chấp nhận, không phải gợi ý triển khai:

1. Không có query, mutation, background job, export hay aggregate nào làm rò dữ liệu giữa các Organization.
2. Org role chỉ đến từ active Membership của active Organization, không lấy từ thuộc tính role toàn cục trên User hoặc claim cũ.
3. ID hợp lệ không đồng nghĩa với được phép truy cập; mọi liên kết chéo phải kiểm tra ownership và visibility.
4. Team, Project, Milestone, Task và các đối tượng con phải thuộc cùng Organization.
5. Task chỉ được giao cho active thành viên của owning Team.
6. Organization không thể mất active Owner cuối cùng; Team đang hoạt động không thể mất active Team Lead cuối cùng.
7. Trạng thái Task chỉ thay đổi qua transition hợp lệ; approval không thể được bypass bằng endpoint update chung.
8. Thao tác có nhiều bước làm thay đổi quyền hoặc trạng thái phải atomic hoặc có cơ chế bù/idempotency rõ ràng.
9. Notification và Activity có thể xử lý bất đồng bộ nhưng không được trở thành nguồn sự thật nghiệp vụ.
10. Archive/xóa mềm là mặc định cho dữ liệu nghiệp vụ có lịch sử; hard delete chỉ là thao tác vận hành có kiểm soát theo chính sách lưu trữ.
11. Audit Log là append-only đối với người dùng ứng dụng.
12. Mọi danh sách, tìm kiếm, dashboard và báo cáo phải áp dụng cùng chính sách visibility với API chi tiết.

## 8. Phạm vi phát hành

### Nền tảng cốt lõi cần hoàn chỉnh trước

- Authentication và global User identity.
- Multi-organization Membership, invitation và workspace switch.
- Tenant isolation và RBAC nhất quán trên HTTP, job và aggregate.
- Team và Team Lead workflow.
- Task, checklist, progress, approval và notification hiện có.

Đây là điều kiện nền trước khi mở rộng nghiệp vụ. Trạng thái triển khai cụ thể vẫn do source và `.spec-kit/` xác nhận.

### Phạm vi sản phẩm v1 hướng tới

- Project và phân công Team vào Project.
- Milestone tùy chọn.
- Task thuộc Project/owning Team, checklist và attachment cơ bản.
- Comment, Activity và Approval history.
- Notification trong ứng dụng/email.
- Audit Log cho thao tác nhạy cảm.
- Tìm kiếm, dashboard và báo cáo tiến độ cơ bản.

### Chưa thuộc phạm vi v1

- Sprint, backlog Scrum, story point, velocity và đầy đủ nghi thức Agile.
- Project template marketplace hoặc template engine tổng quát.
- Custom workflow builder, custom status, custom field và form builder.
- Billing, subscription, quota theo gói và payment.
- Analytics nâng cao, dự báo nguồn lực, BI hoặc data warehouse.
- Time tracking, timesheet, payroll và invoicing.
- Gantt/critical path, portfolio management và dependency planning nâng cao.
- Chat thời gian thực, video call hoặc thay thế công cụ giao tiếp.
- Public API, webhook và tích hợp bên thứ ba diện rộng.
- Guest/external collaborator với mô hình quyền riêng; khách ngoài phải là Membership trong v1.
- Mobile app native và offline-first.

Các mục ngoài phạm vi chỉ được đưa vào roadmap sau khi luồng cốt lõi đã ổn định và có yêu cầu sản phẩm riêng.

## 9. Quyết định baseline của bản này

Các quyết định sau được chọn để đội có thể tiếp tục thiết kế mà không chờ thêm giả định ngầm:

1. Organization là tenant; User là identity toàn cục; Membership là nguồn quyền Organization duy nhất.
2. Chỉ Organization có invitation bên ngoài. Team chỉ nhận active Organization Member.
3. Không có ProjectRole trong v1; quyền Project được suy ra từ org role và Team membership.
4. Project có thể có nhiều Team, nhưng mỗi Task có đúng một owning Team.
5. Owner/Admin thấy toàn tenant nhưng không tự động có quyền thao tác hoặc approve mọi Task.
6. Team Lead là approver mặc định; không gửi yêu cầu approve cho toàn bộ Owner/Admin.
7. Cho phép Team Lead tự approve trong v1 và bắt buộc audit hành động đó.
8. Khi có checklist, checklist là nguồn tính progress.
9. Archive/xóa mềm là hành vi xóa nghiệp vụ mặc định.
10. Activity phục vụ cộng tác; Audit Log phục vụ kiểm soát và không gộp thành một bảng nghiệp vụ duy nhất.

## 10. Điểm cần chủ dự án xác nhận

Baseline trên đủ để triển khai tiếp. Tuy nhiên, trước khi khóa thành specification chính thức, chủ dự án nên xác nhận năm câu hỏi sau:

1. Nhóm khách hàng mục tiêu đầu tiên có đúng là team/agency nhỏ–vừa hay cần tối ưu cho cá nhân hoặc doanh nghiệp lớn?
2. Thành viên chỉ thấy Project của Team mình như baseline, hay mọi thành viên Organization đều được xem mọi Project?
3. Có giữ quy tắc Owner/Admin không tự động can thiệp Task, hay cần quyền override có ghi Audit Log?
4. Có tiếp tục cho Team Lead tự approve, hay bắt buộc approver khác với người submit?
5. Email và notification trong ứng dụng đã đủ cho v1, hay có một tích hợp bên thứ ba bắt buộc?

Khi năm điểm này được xác nhận, đổi trạng thái đầu tài liệu thành `Accepted` và mọi thay đổi nghiệp vụ sau đó phải cập nhật tài liệu này cùng specification/test liên quan.

## 11. Tiêu chí ngăn mở rộng scope

Một yêu cầu mới chỉ thuộc phạm vi hiện tại khi đồng thời:

- phục vụ trực tiếp một luồng ở mục 6;
- dùng được trong mô hình quyền ở mục 4 mà không tạo một lớp role mới;
- không thuộc danh sách loại trừ ở mục 8;
- có invariant tenant, permission và audit rõ ràng;
- có thể được triển khai theo một vertical slice với tiêu chí chấp nhận độc lập.

Nếu không đạt đủ các điều kiện trên, yêu cầu phải được ghi thành đề xuất sản phẩm riêng thay vì chen vào task/refactor hiện tại.
