# Target Tech Stack Review v0.3

> **Trạng thái:** Accepted
> **Ngày review:** 2026-08-25
> **Alignment update:** 2026-08-29
> **Business baseline:** [`TASKFORGE_BUSINESS_SCOPE_v0.3.md`](./TASKFORGE_BUSINESS_SCOPE_v0.3.md) — Accepted
> **Architecture baseline:** [`TARGET_TECHNICAL_ARCHITECTURE_v0.3.md`](./TARGET_TECHNICAL_ARCHITECTURE_v0.3.md), [ADR-001..004](../.spec-kit/adr/) — Accepted; [ADR-005](../.spec-kit/adr/ADR-005-openfga-rebac.md) — Deferred post-v0.3
> **Data baseline:** [`POSTGRESQL_TARGET_DATA_MODEL_v0.3.md`](./POSTGRESQL_TARGET_DATA_MODEL_v0.3.md) — Accepted / Frozen
> **Phạm vi:** Technology selection và compatibility baseline trước Refactor Roadmap; không phải implementation plan.

## 1. Mục tiêu và giới hạn

Review này khóa technology major/version family và compatibility posture đủ để lập Refactor Roadmap. Exact dependency patch pin, container digest và configuration syntax được verify lại tại implementation kickoff, sau khi review release note/security advisory hiện hành.

Review không:

- thay đổi Business Scope, domain model, business authorization semantics hoặc Data Model Frozen;
- tạo TypeORM entity/migration, authorization framework, Docker/CI manifest hoặc production code;
- quy định file-by-file refactor order;
- chọn cloud provider, RLS policy, realtime transport hoặc production-grade Mongo ETL;
- biến selective Outbox thành infrastructure bắt buộc.

Baseline không mở lại: NestJS Modular Monolith, package by Domain/Feature, REST, PostgreSQL-only business persistence target, UUID v4, explicit tenant scoping, composite database constraints, centralized Authorization/Query Policy, Redis/BullMQ có chọn lọc, RLS later và không permanent Mongo/PostgreSQL coexistence. OpenFGA được defer tới sau v0.3; PostgreSQL giữ authoritative business relationships và tenant integrity.

## 2. Nguồn và phương pháp review

### 2.1. Repository evidence

Snapshot được đọc từ:

- `backend/package.json`, `backend/package-lock.json`, TypeScript/Nest/ESLint config;
- `backend/src/main.ts`, `backend/src/app.module.ts`, CLI bootstrap và package usage tối thiểu;
- `backend/docker-compose.yml`, `backend/Dockerfile.dev`, `.dockerignore` và chỉ **tên biến** trong `.env.example`;
- frontend manifest/lockfile, Vite và ESLint config ở mức compatibility boundary;
- Accepted business, architecture, Data Model và ADR sources ở đầu tài liệu.

Không đọc `.env`, không chạy install/update/audit-fix, không ghi lockfile và không chạy stateful service/migration.

### 2.2. Official sources — verified 2026-08-24

- [Node.js release status](https://nodejs.org/en/about/previous-releases): production chỉ dùng Active/Maintenance LTS; Node 24 là LTS, Node 20 đã EOL tại ngày review.
- [NestJS 11 migration guide](https://docs.nestjs.com/migration-guide): NestJS 11 yêu cầu Node >= 20 và dùng Express 5 mặc định.
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/): PostgreSQL 18 được support đến 2030-11-14; minor update cùng major là low-risk fix/security path được khuyến nghị.
- [TypeORM PostgreSQL driver](https://typeorm.io/docs/drivers/postgres/), [migration setup](https://typeorm.io/docs/migrations/setup/) và [manual migrations](https://typeorm.io/docs/migrations/creating/): TypeORM dùng `pg` cho PostgreSQL, migration có thể chạy custom SQL qua `QueryRunner`, và migration workflow yêu cầu tắt schema synchronization.
- [`@nestjs/typeorm` package compatibility](https://github.com/nestjs/typeorm/blob/master/package.json) và [TypeORM releases](https://github.com/typeorm/typeorm/releases): Nest adapter 11 hỗ trợ NestJS 11 và TypeORM 1.x; TypeORM 1.1 là stable family tại ngày review.
- OpenFGA official concepts/operations sources đã được đọc trong review 2026-08-25 và được giữ trong Git history. Alignment 2026-08-29 không chọn hoặc pin OpenFGA cho v0.3; ADR-005 xác định điều kiện review lại hậu v0.3.
- [Redis Open Source version management](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/) và [official license overview](https://redis.io/legal/licenses/): Redis 7.2 là Extended release được support đến 2029-12-01 và giữ BSD-3-Clause; Redis 7.4+ dùng license family khác.
- [BullMQ connections](https://docs.bullmq.io/guide/connections) và [production guidance](https://docs.bullmq.io/guide/going-to-production): worker/queue connection behavior phải được quản lý rõ; Redis cho queue phải dùng `maxmemory-policy=noeviction` và persistence phù hợp reliability need.
- [Jest 30 migration guide](https://jestjs.io/docs/upgrading-to-jest30) và [ts-jest 29.4 documentation](https://kulshekhar.github.io/ts-jest/docs): Jest 30 yêu cầu TypeScript >= 5.4; `ts-jest` 29.4 có ESM/CJS presets. Lockfile hiện tại xác nhận peer range của `ts-jest 29.4.9` chấp nhận Jest 29 hoặc 30 và TypeScript `< 7`.
- [Testcontainers PostgreSQL module](https://node.testcontainers.org/modules/postgresql/): cung cấp PostgreSQL disposable instance cho integration test.
- [Vite 7 release](https://vite.dev/blog/announcing-vite7): Vite 7 yêu cầu Node 20.19+ hoặc 22.12+; Node 24 target thỏa engine hiện tại.
- [NestJS JSON logger](https://docs.nestjs.com/techniques/logger) và [Terminus health checks](https://docs.nestjs.com/recipes/terminus): built-in logger hỗ trợ JSON; `@nestjs/terminus` là official health/readiness integration.

### 2.3. Cách đọc kết luận

- **Fact:** lấy từ repository/lockfile hoặc official source trên.
- **Inference:** kết luận compatibility khi hai source không công bố pair matrix trực tiếp; phải được smoke/integration-test tại implementation kickoff.
- **Recommendation:** lựa chọn phù hợp TaskForge v1 và Accepted architecture, không phải claim của vendor.

## 3. Current stack snapshot

Resolved version lấy từ lockfile v3, không chỉ từ caret range trong manifest:

| Concern | Current verified state | Nhận xét |
|---|---|---|
| Runtime/container | `node:20-alpine`; không có `engines`, `.nvmrc` hoặc `packageManager` | Node 20 đã EOL; image không pin patch/digest |
| Package manager | npm + `package-lock.json` v3 | Hai app có lockfile riêng; phù hợp repository hiện tại |
| Backend framework | NestJS `11.1.17`, Express platform `11.1.17` | Nest 11/Express 5 baseline đang hoạt động |
| TypeScript/module | TypeScript `5.9.3`; `module/moduleResolution=nodenext`; không có `type=module`; ESLint `sourceType=commonjs` | Runtime thực tế là CommonJS dù source dùng ESM import syntax |
| Persistence | Mongoose `9.3.3`, `@nestjs/mongoose 11.0.4`; chưa có PostgreSQL/TypeORM | Legacy-only theo ADR-002 |
| Async | BullMQ `5.73.0`, `@nestjs/bullmq 11.0.4`, ioredis `5.10.1`, Nest Schedule `6.1.1` | Lockfile peer ranges tương thích; Redis container dùng mutable `redis:alpine` |
| Auth/API | Passport/JWT/local, `bcryptjs 3.0.3`, class-validator/transformer, Swagger; authorization phân tán | Authentication hiện hữu; authorization cần centralized application policy trên authoritative relationships |
| Email/CLI | Nodemailer `8.0.4`; `nestjs-command 3.1.5`, yargs, ts-node | CLI gắn legacy seeder; exact target runner chưa cần khóa |
| Test | Jest `30.3.0`, ts-jest `29.4.9`, Nest Testing `11.1.17`, Supertest `7.2.2` | Peer metadata resolved không có Jest/ts-jest blocker |
| Quality | ESLint `9.39.4`, Prettier `3.8.1` | `lint` script hiện auto-fix; CI cần non-mutating command |
| Frontend boundary | React `18.3.1`, Vite `7.1.9`, plugin-react `5.0.4`, React Router `7.9.4` | Node 24 thỏa engine; không chặn backend refactor |
| Local infra | API + Mongo `latest` replica set + Redis mutable tag | Chưa có PostgreSQL, migrate job, healthcheck; Dockerfile expose `3000` trong khi app mặc định `8001` |

Current source còn hai operational risks cần đưa vào roadmap, không phải stack blockers:

- bootstrap đang log raw `MONGO_URI`; phải loại bỏ, không log secret/connection string;
- config không fail-fast validate required variables và chưa có liveness/readiness endpoint.

## 4. Target stack decision matrix

### 4.1. Runtime, language và framework

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| Node.js | 20 image | Node.js **24 LTS** | UPGRADE | Node 20 EOL; Node 24 LTS thỏa Nest 11, TypeORM và Vite 7 | Native/transitive packages phải smoke-test trên chosen image | Runtime foundation |
| npm/lockfile | npm, lockfile v3 | Giữ npm; lockfile là reproducible install SoT | KEEP | Không có requirement đổi package manager | Pin npm qua `packageManager` cùng runtime kickoff | Runtime foundation |
| TypeScript | 5.9.3 | TypeScript **5.9.x** | KEEP | Đang resolved; phù hợp current NestJS/Jest baseline và TypeORM consumer code | Exact patch pin sau clean build/test | Runtime foundation |
| Backend module format | Implicit CJS qua NodeNext | Giữ **CommonJS runtime**, `module/moduleResolution=NodeNext` | KEEP | Tránh ESM migration không mang business value; TypeORM/Nest integration không yêu cầu đổi runtime module format | Phải test DataSource, entity metadata, migration CLI/build và Jest path aliases | Persistence foundation |
| NestJS | 11.1.17 | NestJS **11.x** đồng bộ core/common/platform/testing | KEEP | Current stable major đáp ứng target | Không mix Nest major; exact patch pin cùng PR foundation | Runtime foundation |
| HTTP adapter | Express 5 qua Nest 11 | Giữ `@nestjs/platform-express` | KEEP | REST/file upload hiện phù hợp; không có Fastify requirement | Review route pattern breaking change khi regression test | Runtime foundation |
| RxJS/reflect metadata | RxJS 7.8, reflect-metadata 0.2 | Giữ within Nest peer ranges | KEEP | Framework peer contract | Update đồng bộ với Nest patch | Runtime foundation |

### 4.2. PostgreSQL persistence

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| Primary database | MongoDB | PostgreSQL **18.x**, current minor within major | REPLACE | PostgreSQL 18 support horizon đến 2030; Data Model đã Frozen | Major upgrade không in-place compatible; target mới nên bắt đầu 18 | Persistence foundation |
| ORM/integration | Mongoose only | TypeORM **1.1.x** + `@nestjs/typeorm` **11.x** | ADD | Data Mapper/Repository integration phù hợp NestJS; TypeORM là persistence adapter, không đi vào Domain Policy | Pin exact compatible set và smoke-test metadata, transactions, build/test trước adoption | Persistence foundation |
| PostgreSQL driver | Không có | `pg` **8.x**; `@types/pg` dev-only nếu package set cần | ADD | TypeORM PostgreSQL driver dùng `pg` | Pin theo TypeORM peer range; explicit pool cap theo từng process role | Persistence foundation |
| DataSource lifecycle/pool | Mongoose connection | Một initialized TypeORM `DataSource` trên mỗi process role; explicit pool cap | REPLACE | Tránh nhiều pool ngoài ý muốn; API/worker scale nhân connection count | External pooler chỉ thêm sau capacity evidence | Persistence foundation |
| Migration workflow | Không có | **TypeORM migrations** là schema change path; local/CI/prod chạy migration tường minh bằng one-shot role/job | ADD | Không để API replica race migration; executable history là schema implementation SoT | Production bắt buộc `synchronize: false`; migration failure chặn API rollout | Persistence foundation |
| Custom relational SQL | Không có | Cho phép custom PostgreSQL SQL trong TypeORM migration cho `citext`, partial index, composite FK/UQ/index, CHECK và PostgreSQL-specific feature | ADD | Data Model Frozen là constraint contract; ORM metadata không được làm yếu integrity | Review `up`/`down`, migration-from-empty và negative DB tests bắt buộc | Initial schema phase |
| UUID | Mongo ObjectId | UUID v4; API giữ opaque string | REPLACE | ADR-004 | Exact generator application/DB khóa ở schema implementation | Initial schema phase |
| RLS | Không có | Không phải v1 correctness dependency | DEFER | ADR-003: explicit application scoping + composite constraints là baseline | Mở lại sau pooling/transaction/security assessment | Security hardening |

Executable TypeORM migration history là schema implementation source of truth; không duy trì một bộ handwritten DDL song song. Custom SQL nằm ngay trong migration history. Data Model Frozen tiếp tục là design/constraint contract để review migration. Quyết định TypeORM trong review này thay thế mọi legacy alternative-ORM package/workflow assumption.

### 4.3. Async processing và Redis

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| Redis server | Mutable `redis:alpine` | Redis **7.2.x Extended**, pin patch/digest | UPGRADE | Support tới 2029-12-01, BSD-3-Clause và đủ cho BullMQ primitives; không cần Redis 8 features | BullMQ không công bố pair matrix cho mọi Redis minor; verify queue smoke/retry test | Infra foundation |
| BullMQ | 5.73.0 | BullMQ **5.x** | KEEP | Current consumer/producer có thật; không cần broker mới | Configure connection count/retry and `noeviction` | Async foundation |
| Nest adapter | `@nestjs/bullmq 11.0.4` | Giữ major 11, peer-compatible BullMQ 5 | KEEP | Lockfile peer range chấp nhận Nest 10/11 và BullMQ 3–5 | Pin cùng Nest/BullMQ tested set | Async foundation |
| Redis client | ioredis 5.10.1 | Giữ ioredis **5.x** qua BullMQ/Nest config | KEEP | Current integration và BullMQ connection model phù hợp | Worker dùng `maxRetriesPerRequest=null`; producer fail/retry policy khác worker |
| Worker deployment | Trong cùng app graph | Cùng codebase/image, deployment role riêng khi vận hành cần | KEEP | Giữ Modular Monolith, không tách microservice boundary | Scheduler chỉ một active role cho tới khi có distributed lock |
| Outbox | Chưa có | Selective / Deferred | DEFER | Chỉ critical DB -> queue handoff cần durable intent | Không thêm `outbox_events` trước reliability decision của slice |

Redis dùng cho BullMQ không được vận hành như disposable cache: `maxmemory-policy=noeviction`; persistence/backup SLA được chọn theo mức chấp nhận mất job. Redis query cache diện rộng không thuộc baseline.

### 4.4. Authorization và Query Policy

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| Central policy boundary | Authorization nằm trong guard/service và legacy role model | Focused Authorization Policy cho command/detail access và Query Policy cho list/search/report visibility | UPGRADE | Tránh permission logic phân tán nhưng không thêm network/framework boundary | Contract phải nhỏ theo capability; không tạo generic provider/core hierarchy | Authorization foundation |
| Business relationship SoT | Target Data Model đã khóa Membership/resource relations | `OrganizationMembership`, `ProjectMembership` và resource relationships trong PostgreSQL là authoritative | KEEP | Membership lifecycle, role và tenant relation là business state cần transaction/constraint | Không tạo derived tuple store hoặc dual-write trong v0.3 | Persistence + authorization foundation |
| Tenant integrity | Explicit application scoping + composite constraints | Active Membership, explicit `organizationId`, same-tenant resource lookup và composite DB constraints chạy trước policy | KEEP | Authorization result không tự tạo tenant authority | Cross-tenant opaque ID phải fail closed và không lộ existence | Security gate |
| Relationship access | Checks phân tán | Policy đánh giá access/manage từ authoritative role, Membership và resource relation | UPGRADE | Một reviewable application boundary phù hợp graph v0.3 | Command/detail/list/search/report/worker phải có parity tests | Per capability |
| Domain Policy | Business-state rule trong Service/Domain Policy | Task completion, checklist, approval transition và invariant đa entity tiếp tục ở Domain Policy | KEEP | Relationship access không quyết định command hợp lệ theo state | Authorization `allowed=true` không bypass transaction/invariant | Per capability |
| OpenFGA | Chưa có | **Deferred — post-v0.3** | DEFER | Chưa có evidence biện minh server/SDK/tuple/reconciliation/deployment complexity | Không pin version, không provider abstraction và không implementation slice trong v0.3 | Post-v0.3 architecture review |

Authorization request path mục tiêu:

1. Xác thực User và resolve Organization context được yêu cầu.
2. Xác minh active `OrganizationMembership` trong PostgreSQL, load resource bằng explicit tenant scope và giữ mọi composite constraint/FK hiện có.
3. Gọi focused Authorization/Query Policy để kiểm tra relation/action như `can_access`, `can_view`, `can_manage` từ authoritative PostgreSQL relationships.
4. Nếu được phép, Service/Domain Policy vẫn kiểm tra business-state invariant và thực hiện command trong PostgreSQL transaction.

Query Policy phải đưa cùng visibility predicate vào detail, list, search, report và worker thay vì load rộng rồi filter trong memory. Không tạo authorization-provider abstraction, tuple projection hoặc sync/reconciliation path trong v0.3.

### 4.5. API, auth, configuration và operations

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| REST/OpenAPI | Nest controllers + Swagger | Giữ REST, `@nestjs/swagger` 11.x và explicit DTOs | KEEP | Accepted boundary; không expose ORM records | Contract tests khi UUID/workspace contract cutover | API foundation |
| Validation | class-validator/transformer | Giữ global whitelist/forbid/transform; DTO UUID khi slice cutover | KEEP | Current behavior phù hợp | Không đổi toàn API sang schema library khác |
| Authentication | Passport local/JWT + `@nestjs/jwt` | Giữ | KEEP | Có consumer thật; không có external IdP requirement | JWT xác thực identity; active Membership và policy dùng PostgreSQL relationships, không JWT/global User role |
| Password hashing | bcryptjs | Giữ để bảo toàn current hashes | KEEP | Không có requirement/compatibility blocker biện minh algorithm migration | Algorithm upgrade/rehash cần security decision riêng |
| Email | Nodemailer 8 | Giữ transport abstraction hiện tại | KEEP | Email vẫn là required side effect | Provider/SLA và reliable handoff quyết định tại Notification phase |
| Configuration | `@nestjs/config`, no schema validation | Giữ package; thêm typed fail-fast validation bằng custom validate function | UPGRADE | Có thể dùng existing validation stack, chưa cần dependency mới | Không log secret; validate URL/port/required secret per process role | Runtime foundation |
| Logging | `console.log` + Nest default | Built-in Nest `ConsoleLogger` JSON + correlation/tenant-safe context | UPGRADE | Nest 11 hỗ trợ JSON nên chưa cần Pino/Winston | Redaction và cấm connection string/token/password là bắt buộc | Runtime foundation |
| Health | Chưa có | `@nestjs/terminus` cho liveness/readiness | ADD | Official Nest integration; readiness cần PostgreSQL/Redis/process-role checks | Liveness không phụ thuộc external service; readiness có dependency hợp lý | Infra foundation |
| Rate limit/headers | Chưa khóa | Exact library/policy chưa khóa | DEFER | Cần public deployment/security requirement cụ thể | Mở trước production exposure; không chặn roadmap |
| Metrics/tracing | Chưa có | Vendor-neutral correlation/log baseline; metrics/tracing deferred | DEFER | Chưa có SLO/provider | Mở khi deployment/observability requirement tồn tại |

`nestjs-command`, yargs và ts-node tiếp tục phục vụ legacy CLI cho tới khi PostgreSQL seed/operational commands được thiết kế. Giữ hay thay runner là implementation detail của CLI slice, không phải tech stack blocker.

### 4.6. Test và quality

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| Unit/E2E runner | Jest 30.3 | Jest **30.x** | KEEP | Node 24/TS 5.9 thỏa official requirements | Review Jest 30 matcher/config breaking changes trong test foundation |
| TS transform | ts-jest 29.4.9 | ts-jest **29.4.x**, CJS preset/config | KEEP | Resolved peer range chấp nhận Jest 30 và TS < 7 | Major labels khác nhau nhưng peer contract hợp lệ; test smoke là gate |
| Nest/Supertest | Nest Testing 11.1, Supertest 7.2 | Giữ aligned majors | KEEP | Standard Nest integration/E2E path | Không dùng scaffold E2E hiện tại làm security proof |
| PostgreSQL integration | Chưa có | `@testcontainers/postgresql` + PostgreSQL 18 image | ADD | Isolated real DB, migration-from-empty và constraint tests | CI runner cần Docker; fallback Compose chỉ khi environment không chạy Testcontainers |
| Constraint verification | Chưa có | Test composite FK, partial UQ, CHECK, transaction rollback/race trên PostgreSQL thật | ADD | Mock/unit test không chứng minh relational integrity | Chạy cùng schema/migration slice |
| Authorization policy | Checks phân tán | Policy unit tests + PostgreSQL integration/E2E cho allow/deny, role/resource relations, cross-tenant denial và query/detail parity | UPGRADE | Guard unit test đơn lẻ không chứng minh authorization correctness | Chạy cùng từng capability; gồm worker/list/search/report negatives |
| Lint check | Script luôn `--fix` | Thêm non-mutating CI command; giữ explicit fix command riêng | UPGRADE | Dirty worktree không được auto-rewrite | Baseline errors được tách khỏi regression |
| Coverage | Không gate | Giữ report, không đặt arbitrary global threshold | KEEP | Risk-based tests quan trọng hơn percentage ban đầu | Threshold chỉ thêm sau stable baseline |

### 4.7. Frontend boundary

| Concern | Current | Target decision | Status | Evidence/rationale | Compatibility/risk | Lock timing |
|---|---|---|---|---|---|---|
| React | 18.3.1 | Giữ React 18 trong backend refactor | KEEP | Không có API compatibility blocker | React major upgrade là frontend task riêng |
| Vite/plugin React | Vite 7.1.9/plugin 5.0.4 | Giữ current majors | KEEP | Node 24 thỏa engine; current pair peer-compatible | Vite 8 tồn tại nhưng không tạo business value cho backend migration |
| Routing/UI/state | Router 7/MUI/Redux | Không đổi trong tech stack baseline | KEEP | Ngoài backend-first scope | Chỉ sửa consumer cần thiết khi contract cutover |
| Target API contract | Legacy workspace assumptions | Active Organization context/header/cache isolation; UUID opaque string khi target capability cutover | UPGRADE | Accepted business/architecture contract | Completed Mongo compatibility subset được giữ; frontend target đi cùng owning capability ở Phase 2–6 |

## 5. Compatibility matrix

| Pair | Kết quả review | Evidence | Required gate |
|---|---|---|---|
| Node 24 ↔ NestJS 11 | Compatible | Nest requires Node >=20; Node 24 LTS | Clean build + HTTP smoke |
| NestJS 11 ↔ `@nestjs/typeorm` 11 ↔ TypeORM 1.1 | Compatible theo current official peer/release metadata | Nest adapter 11 peer-support Nest 10/11 và TypeORM 1.x | DataSource/module bootstrap + repository/transaction integration |
| Node 24/TypeScript 5.9 ↔ TypeORM 1.1/`pg` 8 | **Compatible inference** | TypeORM current package/test baseline dùng modern Node/TypeScript và `pg` 8 peer; không có pair certification riêng | Install/build/migration CLI + metadata/CRUD smoke trên target image |
| TypeORM 1.1/`pg` 8 ↔ PostgreSQL 18 | **Compatible inference**, không có vendor pair matrix cho PostgreSQL major này | TypeORM official PostgreSQL driver dùng `pg` và hỗ trợ PostgreSQL data types/features | Migration-from-empty + CRUD/transaction + custom SQL constraint integration |
| TypeScript 5.9 ↔ NestJS 11 | Compatible from current resolved build baseline | Lockfile current stack + Nest peer ecosystem | `tsc`/Nest build under Node 24 |
| Jest 30 ↔ ts-jest 29.4 ↔ TS 5.9 | Compatible by resolved peer metadata | ts-jest peer allows Jest 29/30 and TS >=4.3 <7; Jest requires TS >=5.4 | Unit suite + ESM/CJS import regression |
| BullMQ 5 ↔ Redis 7.2 | **Compatible inference**, not vendor pair certification | BullMQ stable Redis command model; Redis 7.2 vẫn được support | Queue add/process/retry/delayed job/reconnect smoke |
| `@nestjs/bullmq` 11 ↔ BullMQ 5 | Compatible | Resolved peer range accepts BullMQ 3–5 and Nest 10/11 | Producer/consumer module bootstrap test |
| React 18 ↔ Vite 7/plugin React 5 | Compatible | Current resolved peer metadata; Vite engine satisfied by Node 24 | Frontend build only; no upgrade prerequisite |

Không còn compatibility pair nào cần quyết định trước roadmap. Pair có inference vẫn có implementation gate cụ thể và không làm thay đổi target architecture.

## 6. Version và pinning policy

1. Khóa major/version family trong tài liệu này; exact package version được pin qua `package-lock.json` trong foundation PR sau clean install/build/test.
2. Nest packages cùng family phải được update/pin như một tested set; `@nestjs/typeorm`, TypeORM và `pg` cũng vậy.
3. Production dùng `npm ci`, không `npm install`; package manifest thêm Node `engines` và `packageManager` khi runtime foundation được triển khai.
4. Container pin ít nhất major/minor phù hợp và digest trong deploy-controlled manifest. Không dùng `latest`, bare `alpine` hoặc floating database tag.
5. Node application image dùng Node 24 Debian slim family; exact Debian suite/digest khóa tại kickoff sau native/OpenSSL smoke test. Không có blocker bắt buộc Alpine.
6. PostgreSQL pin `18.<current-supported-minor>`; theo dõi minor security/fix release trong major 18.
7. Redis pin `7.2.<supported-patch>` Extended; nâng patch có queue regression smoke. Redis 7.4/8+ chỉ được xem lại sau license/compliance review; đây không phải nhận định pháp lý.
8. Pin TypeORM `1.1.x`, `@nestjs/typeorm` `11.x` và `pg` `8.x` thành một tested set. Major upgrade không tự động; production luôn cấu hình `synchronize: false` và chỉ đổi schema bằng committed TypeORM migrations.
9. Không pin hoặc thêm OpenFGA server/SDK/model ID trong v0.3. Một post-v0.3 review mới phải verify version/security/compatibility tại thời điểm đó nếu quyết định được mở lại.

## 7. Local development, CI và container posture

Target local Compose direction:

```text
postgres 18
redis 7.2
typeorm-migrate (one-shot)
api
worker/scheduler role khi cần chạy async flow
```

- PostgreSQL và Redis có healthcheck; API/worker chỉ start sau dependency readiness và successful migrations.
- `migrate` dùng migration role/URL riêng; runtime role không sở hữu schema và chỉ có minimum privileges.
- API và worker có thể dùng cùng build image/artifact nhưng command/role khác; không tách business microservice.
- Production image multi-stage, non-root, chỉ chứa runtime dependencies/compiled TypeORM migrations cần thiết và có graceful shutdown.
- Port contract thống nhất `8001`; current `EXPOSE 3000` là cleanup item.
- CI tối thiểu: lockfile install, build/typecheck, non-mutating lint, unit tests, PostgreSQL migration-from-empty, constraint/authorization integration tests, API E2E và frontend build khi shared contract đổi.
- API replica không tự chạy migration. One-shot migration failure phải chặn rollout.

Exact cloud, managed database, secret manager và deployment topology vẫn deferred.

## 8. Current-to-target cleanup classification

### KEEP

- NestJS 11, Express adapter, npm/lockfiles, TypeScript 5.9/CommonJS runtime posture.
- Config, validation, Swagger, Passport/JWT/local, bcryptjs, Nodemailer.
- BullMQ 5, Nest BullMQ 11, ioredis 5, Nest Schedule.
- Jest 30, ts-jest 29.4, Nest Testing, Supertest, ESLint 9, Prettier 3.
- React 18/Vite 7 frontend stack trong backend-first refactor.

### UPGRADE

- Node 20 -> Node 24 LTS.
- Redis floating image -> Redis 7.2 Extended/BSD pinned.
- Docker/Compose từ mutable tags, `npm install`, port mismatch và thiếu healthchecks -> reproducible build/run posture.
- Config bootstrap -> typed fail-fast validation; logging -> JSON/redacted/correlated; lint -> non-mutating CI check.
- Frontend API consumer -> giữ verified active Organization/header/cache isolation; UUID/Project-aware contract hoàn tất dần trong owning vertical slices Phase 2–6.
- Authorization phân tán -> focused Authorization/Query Policy dùng authoritative PostgreSQL relationships và parity tests.

### ADD

- PostgreSQL 18.
- TypeORM 1.1, `@nestjs/typeorm` 11, `pg` 8 và `@types/pg` khi cần.
- TypeORM migrations với production `synchronize: false`.
- PostgreSQL custom migration SQL path và real database constraint tests.
- `@testcontainers/postgresql` cho integration/E2E database.
- `@nestjs/terminus` cho health/readiness.
- Runtime/TypeORM-migration role separation và one-shot migration jobs.

### REPLACE

- MongoDB/Mongoose persistence path bằng PostgreSQL/TypeORM theo bounded capability.
- ObjectId validation/assumptions bằng UUID v4/opaque ID trong slice đã cutover.

### REMOVE AFTER CUTOVER

- `mongoose`, `@nestjs/mongoose`, Mongo compose service/replica-set setup, `MONGO_URI`, tenant plugin và Mongo-specific DTO/query/aggregation code.
- Legacy Mongo seeder/membership migration path sau khi consumer/data decision tương ứng đã hoàn tất.

Không remove legacy dependency trước consumer cutover, validation và rollback window của capability tương ứng.

### DEFER

- RLS, production-grade Mongo ETL, exact cloud/provider, external pooler.
- Generic/global Outbox, query cache/materialized projection và realtime transport.
- OpenFGA server/SDK/model/tuple sync/reconciliation/CI/deployment và mọi provider abstraction; chỉ review lại sau v0.3 theo ADR-005.
- Storage provider/scanning/retention, metrics/tracing vendor và advanced rate-limit policy.
- Exact CLI/seed runner replacement, scheduler coordination khi mới có một scheduler replica.
- TypeORM major upgrade ngoài 1.1.x, Redis 7.4/8+ và frontend major upgrades không cần cho backend target.

## 9. Risks và technical stack TBD

### 9.1. Risks đã có mitigation

| Risk | Impact | Mitigation/gate |
|---|---|---|
| Node 20 EOL/mutable image | Security và non-reproducible build | Node 24 LTS + exact image/digest + clean build |
| TypeORM `synchronize` chạy ở production | Schema drift hoặc destructive change ngoài review | Production `synchronize: false`; committed migrations chạy one-shot trước rollout |
| TypeORM/Nest/`pg` version mismatch | Bootstrap, metadata hoặc query/runtime failure | Pin tested set; DataSource/migration/transaction smoke gate |
| ORM không biểu diễn đủ constraint | Tenant/data integrity bị yếu | Custom migration SQL + migration review + negative DB tests |
| Pool multiplication ở API/worker replicas | Exhaust PostgreSQL connections | One TypeORM DataSource/pool per process role, explicit pool caps và capacity calculation |
| Authorization logic tiếp tục phân tán | Permission drift giữa controller/service/worker | Focused policy contracts theo capability; controller không tự encode permission graph |
| Query visibility khác detail/command policy | List/search/report lộ hoặc giấu sai resource | Query Policy dùng cùng authoritative predicates; parity và cross-tenant integration tests |
| Business-state invariant bị đưa vào access policy | `allowed=true` có thể bypass valid task/approval transition | Domain Policy/Service luôn chạy sau relation check trong transaction |
| Redis dùng eviction policy như cache | BullMQ mất queue keys/job correctness | Dedicated logical deployment/config, `noeviction`, persistence decision |
| BullMQ 5/Redis 7.2 không có pair certification explicit | Runtime regression | Queue/retry/delayed/reconnect integration suite trước adoption |
| Redis 7.4/8+ đổi license family | Compliance ambiguity không cần thiết | Baseline pin 7.2 BSD; future upgrade cần owner/legal review |
| Legacy và target persistence cùng tồn tại tạm thời | Hai SoT/cutover drift | Authoritative store theo capability, remove old path sau gate; không dual-write mặc định |
| Current bootstrap log connection string | Secret disclosure | Remove raw URI log và add log redaction in runtime foundation |
| No config/health gate | Late startup failure/unsafe rollout | Fail-fast config + Terminus readiness/liveness |
| Testcontainers cần Docker | CI portability | CI runner contract có Docker; Compose fallback chỉ khi platform limitation được chứng minh |

### 9.2. Deferred decisions — không chặn roadmap

| Decision | Trigger/owner timing |
|---|---|
| Mongo data reset hay production ETL | Trước môi trường có state cần cutover |
| RLS và runtime tenant session context | Sau application scoping, TypeORM pooling và security tests ổn định |
| External pooler | Sau connection budget/load measurement hoặc managed DB requirement |
| Outbox table/dispatcher | Khi một critical async flow chốt reliable DB -> BullMQ handoff |
| Mở lại OpenFGA | Chỉ sau v0.3 khi measured permission-graph complexity/cross-org sharing/custom-role requirement thỏa ADR-005; cần architecture review mới |
| Rate-limit/security-header exact package/policy | Trước public production exposure |
| Metrics/tracing vendor | Khi deployment/SLO/operations owner được xác định |
| Storage provider và file security controls | Trước Files/Attachment implementation |
| Scheduler distributed lock | Khi chạy nhiều scheduler replica |

Không có deferred decision nào thay đổi target runtime family hoặc làm Refactor Roadmap không thể lập.

## 10. Final readiness decision

Acceptance gate:

- [x] NestJS Modular Monolith và backend-first scope được giữ.
- [x] PostgreSQL-only target và Frozen relational integrity contract được giữ.
- [x] UUID v4 và explicit tenant isolation được giữ.
- [x] TypeORM + `pg` và TypeORM migrations được chọn; production bắt buộc `synchronize: false`, custom PostgreSQL SQL được phép trong migration.
- [x] Centralized Authorization/Query Policy được chọn cho v0.3 access/manage và visibility checks trên authoritative PostgreSQL relationships.
- [x] `OrganizationMembership`/`ProjectMembership` và resource relationships trong PostgreSQL là business Source of Truth; policy không thay relational model, tenant scoping hoặc composite constraints.
- [x] Business-state invariant vẫn thuộc Domain Policy/Service layer, không thuộc relationship access policy.
- [x] OpenFGA được giữ là deferred post-v0.3 option; v0.3 không có server/SDK/model/tuple sync/reconciliation/CI/deployment/provider abstraction.
- [x] Redis/BullMQ có chọn lọc; không thêm broker khác.
- [x] RLS không là v1 correctness dependency.
- [x] Outbox không bắt buộc toàn cục.
- [x] Không permanent Mongo/PostgreSQL coexistence hoặc dual-write mặc định.
- [x] Runtime, persistence, queue, test và frontend compatibility boundary đã có target family cùng verification gate.
- [x] Exact pins được defer có kiểm soát tới implementation kickoff, không làm mơ technology direction.

**Tech Stack Blocking Decision = 0.**

**Kết luận: Target Tech Stack v0.3 — Accepted.**

Refactor Roadmap và Detailed Phase Plan phải dùng Business Scope, Target Architecture, Data Model Frozen, ADR-001..004, ADR-005 Deferred và Target Tech Stack Accepted này; không dùng legacy PostgreSQL package/version assumptions để ghi đè các baseline mới hơn.
