Hãy thiết lập hệ thống project guidance dành cho Codex trong repository TaskForge này, với trọng tâm hiện tại là hoàn thiện và refactor backend.

Trước khi tạo hoặc chỉnh sửa bất kỳ file nào, hãy tự đọc và phân tích repository:

* Kiểm tra `git status` và bảo toàn toàn bộ thay đổi hiện có của tôi.
* Kiểm tra cấu trúc thư mục, README, package manifests, Docker, environment examples, source code backend, test và các tài liệu hiện có.
* Tìm tất cả `AGENTS.md`, `AGENTS.override.md`, `.codex/`, `.agents/` và thư mục tài liệu nếu đã tồn tại.
* Đọc backend đủ sâu để hiểu kiến trúc thực tế, module boundaries, dependency flow, authentication, authorization, tenant isolation, background jobs, database access, API conventions và các lệnh build/test/lint.
* Chỉ đọc frontend ở mức cần thiết để hiểu API contract và workspace flow; chưa cần tạo hướng dẫn frontend chi tiết.
* Xem source code và cấu hình hiện tại là nguồn sự thật. Không suy đoán công nghệ hoặc command khi chưa kiểm tra.

Sau khi phân tích, hãy tạo hoặc cập nhật một hệ thống hướng dẫn tối giản, đúng convention mà Codex có thể tự động phát hiện và sử dụng trong các session sau.

Mục tiêu của hệ thống hướng dẫn:

1. Giúp Codex mới mở repository hiểu nhanh TaskForge là gì.
2. Cho Codex biết nên đọc file nào trước tùy loại backend task.
3. Mô tả chính xác kiến trúc và request flow hiện tại từ source code.
4. Ghi lại các business invariant và security invariant quan trọng.
5. Ghi rõ các command thực tế để install, run, build, lint, test và migrate.
6. Giúp Codex phân biệt trạng thái hiện tại với kiến trúc mục tiêu.
7. Giúp Codex tiếp tục công việc qua nhiều session mà không phải phân tích lại toàn bộ repository.
8. Ngăn Codex tự ý mở rộng scope hoặc thực hiện refactor lớn ngoài yêu cầu.

Hãy tự quyết định cấu trúc file phù hợp theo convention chính thức của Codex. Có thể sử dụng:

* `AGENTS.md` ở repository root cho hướng dẫn dùng chung.
* `AGENTS.md` gần backend nếu backend cần quy tắc riêng.
* `.codex/config.toml` chỉ cho cấu hình Codex ở cấp project khi thực sự cần.
* Tài liệu ngắn trong `docs/` nếu cần lưu kiến trúc, flow, quyết định hoặc trạng thái refactor mà không nên nhét hết vào `AGENTS.md`.
* `.agents/skills/` chỉ khi repository đã có một workflow lặp lại đủ rõ để đáng đóng gói thành skill; không tạo skill chỉ để làm cấu trúc trông đầy đủ.

Không bắt buộc phải tạo tất cả các thành phần trên. Hãy chọn tập file nhỏ nhất nhưng đủ hiệu quả sau khi đọc source.

## Existing spec-kit

Repository đã có thư mục `spec-kit/` ghi lại specification và các phase
refactor của dự án.

- Hãy đọc và đánh giá toàn bộ cấu trúc `spec-kit/` trước khi tạo project guidance.
- Xem `spec-kit/` là nguồn sự thật cho roadmap, phase, requirement và tiến độ
  refactor nếu nội dung của nó vẫn phù hợp với source code.
- Không tạo một roadmap hoặc current-status document khác trùng vai trò với
  `spec-kit/`.
- Root `AGENTS.md` phải chỉ dẫn Codex tới đúng file hoặc phase trong `spec-kit/`
  tùy loại task.
- Nếu `spec-kit/` mâu thuẫn với source code, không tự ý sửa specification hoặc
  source code trong task này. Hãy ghi nhận rõ sự khác biệt trong báo cáo cuối.
- Chỉ đề xuất chỉnh sửa `spec-kit/` khi phát hiện thông tin lỗi thời, trùng lặp
  hoặc không còn phản ánh kiến trúc thực tế.

Bối cảnh định hướng của dự án:

* TaskForge là hệ thống quản lý project và công việc theo mô hình multi-tenant.
* Một user có thể tham gia nhiều organization và switch workspace.
* User là identity toàn hệ thống; role và trạng thái tham gia organization phải thuộc membership, không nên là role toàn cục.
* Organization là tenant và là ranh giới dữ liệu, quyền hạn, cấu hình và nghiệp vụ.
* Backend đang là ưu tiên chính.
* Dự án có định hướng chuyển persistence từ MongoDB/Mongoose sang PostgreSQL.
* Việc chuyển PostgreSQL cần được thực hiện theo từng vertical slice, không rewrite toàn bộ hệ thống trong một lần.
* Phạm vi nghiệp vụ mục tiêu gần gồm Organization, Membership, Team, Project, Milestone, Task, Checklist, Comment, Activity, Approval, Notification và Audit Log.
* Chưa ưu tiên Sprint, Scrum, project templates, custom workflow builder, custom fields, form builder, billing hoặc analytics nâng cao.
* Không được mô tả một tính năng là đã hoàn thành nếu source code hiện tại chưa chứng minh điều đó.

Hướng dẫn được tạo cần ngắn gọn nhưng có tính điều hướng tốt. Không sao chép lượng lớn source code vào tài liệu. Thay vào đó, hãy trỏ Codex tới đúng module, file entry point hoặc tài liệu liên quan.

Trong project guidance, hãy thể hiện được ít nhất:

* Project purpose và phạm vi hiện tại.
* Kiến trúc backend thực tế.
* Những entry point quan trọng.
* Cách trace một request từ controller đến business logic và persistence.
* Authentication, authorization và tenant-context flow.
* Các business invariant và tenant-isolation rule cần bảo toàn.
* Module ownership và dependency boundaries.
* Coding conventions rút ra từ code hiện tại.
* Quy trình làm việc trước, trong và sau khi sửa code.
* Definition of done cho backend task.
* Build, lint, test và migration commands đã được kiểm chứng từ repository.
* Những phần Codex không được tự ý thay đổi.
* Cách xử lý khi code, README và tài liệu không đồng nhất.
* Trạng thái refactor hiện tại, bước đang làm, bước tiếp theo và các quyết định còn bỏ ngỏ.

Yêu cầu chất lượng:

* Giữ root `AGENTS.md` súc tích; dùng nó làm bản đồ điều hướng, không biến nó thành tài liệu kiến trúc dài.
* Đặt hướng dẫn chuyên biệt gần phạm vi code mà nó áp dụng.
* Không đưa secret, token, password, connection string thật hoặc nội dung `.env` vào bất kỳ file nào.
* Không pin model Codex nếu repository không có yêu cầu rõ ràng.
* Không thêm dependency.
* Không chỉnh sửa application source code trong task này.
* Không triển khai PostgreSQL, Project, Milestone hoặc tính năng mới trong task này.
* Không chạy command có khả năng thay đổi database hoặc dữ liệu.
* Không ghi những quy tắc chung chung không liên quan tới repository.
* Không lặp cùng một nội dung ở nhiều file.
* Nếu một thông tin chưa xác định được từ source, đánh dấu rõ là `TBD` hoặc decision pending thay vì tự bịa.
* Nếu đã có project guidance, hãy cải thiện có chọn lọc thay vì ghi đè mù quáng.
* Bảo toàn mọi thay đổi không liên quan đang có trong worktree.

Sau khi tạo xong:

1. Đọc lại toàn bộ các file guidance vừa tạo.
2. Kiểm tra đường dẫn và command được nhắc tới có thực sự tồn tại.
3. Kiểm tra các file không mâu thuẫn với nhau.
4. Kiểm tra `git diff` để chắc chắn chỉ thay đổi tài liệu và cấu hình Codex cần thiết.
5. Không commit hoặc push.
6. Trả về bản tóm tắt gồm:

   * Những file đã tạo hoặc cập nhật.
   * Codex sẽ đọc chúng theo thứ tự nào.
   * Những kiến trúc và flow chính đã được ghi nhận.
   * Những điểm chưa chắc chắn hoặc cần tôi quyết định.
   * Đề xuất task backend đầu tiên nên thực hiện sau khi project guidance đã sẵn sàng.

Hãy chủ động hoàn thành task này từ đầu đến cuối. Chỉ hỏi lại nếu gặp một quyết định không thể suy ra từ source và quyết định đó sẽ làm thay đổi đáng kể cấu trúc guidance; nếu không, hãy chọn phương án tối giản, ghi rõ giả định và tiếp tục.
