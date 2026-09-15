# Metis Development Tool (MDT) 1.0 — 全量工程任务清单与验收标准

> 文档用途：直接交给 Coding Agent / 工程 Agent 执行。  
> 目标：一次性把 **Metis Development Tool 1.0** 做到稳定、可维护、可测试、可持续迭代的“商用交付级质量”。这里的“商用交付级”是质量标准，不代表 MDT 1.0 必须商业发布。  
> 项目属性：**永久开源、公共仓库、宽松开源协议**。  
> 新仓库：`metis-development-tool`，必须是 GitHub `public`。  
> 上游参考：GenOffice，仅用于合法复用其 Slides/PowerPoint 编辑能力；**禁止向 GenOffice 提交 PR、禁止把工作分支推送到 GenOffice、禁止把本项目开发过程变成 GenOffice fork PR 工作流**。  
> MDT 内部 Coding Agent：**OpenAI Codex**。  
> 用户最终构建的 Agent Runtime：**Pi Agent Core**。  
> 二者职责不得混用。  
> 并行限制：主 Agent 最多同时分发 **3 个子 Agent**，主 Agent必须承担最终集成、代码审查、测试和验收责任。

---

## 0. 不可违反的项目原则

### 0.1 产品定义

MDT 是一个“像做 PowerPoint 一样设计并构建 Agent 应用”的开源开发工具。

用户的基本工作流必须保持为：

1. **设计**：像 PowerPoint 一样，在一页一页的画布上摆放文本、形状、图片、按钮、输入框、列表、Chat 等元素。
2. **连接**：在无限画布中看到页面、弹窗、抽屉、Agent、Capability 等节点，用连线表达“点击后去哪、打开什么、调用谁、结果显示在哪里”。
3. **构建**：MDT 将设计转成结构化 Blueprint，Codex 在受控工作区内将 Blueprint 实现为真实代码。
4. **运行**：生成的 Agent 应用以 **Pi Agent Core** 作为底层 Agent Runtime，并调用用户为它装配的工具 / Capability。
5. **验收**：自动执行类型检查、单测、集成测试、Playwright E2E、截图/视觉检查、关键交互回归；失败则进入修复循环。
6. **导出**：最终项目必须是普通、可读、可修改、可独立运行的源代码仓库；删除 MDT 后，生成的 Agent 仍能独立运行。

### 0.2 心智模型

默认界面必须尽量对标 PowerPoint，而不是创造新的低代码术语。

禁止把以下概念直接暴露给普通用户作为主流程：

- REST endpoint
- HTTP method
- React state
- hook
- reducer
- component props
- DOM
- API binding
- workflow DSL
- event bus
- schema mapping
- dependency injection
- server action

这些可以存在于“高级模式 / 开发者模式”，不能成为完成基本任务的前置知识。

### 0.3 三个技术角色必须严格隔离

**GenOffice Slides**

- 提供 PPT 式页面编辑体验、Canvas、文本、图形、图片、缩放、选择、多选、拖拽、组合、图层、对齐、智能参考线、缩略图、Undo/Redo 等。
- 不负责 MDT 的 Agent Runtime。
- 不负责 MDT 的 Coding Agent。

**Codex**

- 是 MDT 自己内部的 Coding Agent。
- 读取 MDT Blueprint、当前代码库、当前设计选择、测试结果。
- 创建/修改用户生成应用的代码。
- 不作为用户最终 Agent 的 runtime。

**Pi Agent Core**

- 是用户最终设计出来的 Agent 的 runtime。
- 负责模型调用、Agent loop、tool calling、state。
- MDT 不要重新实现 Pi 的核心 Agent loop。
- MDT 不要把 Pi Coding Agent 当成 MDT 的 Coding Agent。

### 0.4 开源与上游规则

1. MDT 仓库采用 **Apache-2.0** 作为项目主许可证，原因是 GenOffice 和 Codex 均采用 Apache-2.0，Pi 为 MIT，React Flow 为 MIT；此组合简单、宽松并包含明确专利授权。
2. 所有从 GenOffice 复制/修改的文件必须保留其原有版权和 Apache-2.0 许可证要求。
3. 根目录必须保留/补充 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`。
4. 必须记录 GenOffice 的上游 commit SHA。
5. `genoffice-upstream` remote 只能 fetch，必须通过 Git 配置和 pre-push hook 防止误推。
6. **不得创建指向 GenOffice 的 Pull Request。**
7. 所有开发 commit、tag、release、issue、PR 都只发生在 MDT 自己的 `metis-development-tool` 仓库。

### 0.5 质量红线

MDT 1.0 完成时必须达到：

- 0 个已知 P0 blocker。
- 0 个已知 P1 critical bug。
- 主流程无未处理异常。
- TypeScript `strict` 范围内无类型错误。
- lint / format / typecheck / unit / integration / E2E 全绿。
- 核心数据层、Blueprint、Capability Registry、Compiler/Generator、Codex Bridge 单元测试覆盖率目标 >= 85% lines，关键分支 >= 80%。
- 不允许用 `any`、`@ts-ignore`、空 catch、禁用 ESLint 规则来“解决”测试。
- 不允许通过 hardcode demo data 假装功能完成。
- 不允许留“TODO later”来绕过本清单定义为 1.0 必须完成的功能。
- 不允许主流程依赖手动修改 JSON 才能运行。
- 不允许把 API key 明文写进项目文件、日志、Git。
- 不允许 Codex 默认获得 MDT 工作区之外的任意文件写权限。
- 不允许生成的 Agent 离开 MDT 就无法运行。

---

## 1. 推荐仓库目标结构

最终结构可以在实施中微调，但职责边界必须保持：

```text
metis-development-tool/
├─ apps/
│  └─ mdt/
│     ├─ src/main/                 # Electron main
│     ├─ src/preload/              # 安全 IPC bridge
│     ├─ src/renderer/             # React UI
│     └─ tests/
├─ packages/
│  ├─ pptx-engine/                 # 从 GenOffice 合法保留/裁剪
│  ├─ pptx-render/                 # 从 GenOffice 合法保留/裁剪
│  ├─ font-metrics/                # 如 Slides 实际依赖则保留
│  ├─ ui/                          # 必需的共享 UI
│  ├─ mdt-schema/                  # MDT Project/Blueprint Schema
│  ├─ mdt-project/                 # 项目读写、迁移、autosave
│  ├─ mdt-design/                  # Page/Element/Component 模型适配层
│  ├─ mdt-interactions/            # 交互图模型
│  ├─ mdt-capabilities/            # Capability Registry + built-ins
│  ├─ mdt-pi-runtime/              # Pi runtime adapter / generated runtime template
│  ├─ mdt-codex/                   # Codex bridge / app-server adapter
│  ├─ mdt-generator/               # Blueprint -> deterministic scaffold
│  ├─ mdt-preview/                 # preview lifecycle
│  └─ mdt-testing/                 # generated-app validation helpers
├─ templates/
│  └─ web-agent/                   # 默认生成模板
├─ e2e/
├─ fixtures/
├─ docs/
│  ├─ architecture/
│  ├─ adr/
│  ├─ testing/
│  └─ upstream/
├─ scripts/
├─ .github/
│  └─ workflows/
├─ LICENSE
├─ NOTICE
├─ THIRD_PARTY_NOTICES.md
├─ CONTRIBUTING.md
├─ SECURITY.md
├─ ARCHITECTURE.md
├─ ROADMAP.md
└─ README.md
```

---

## 2. MDT 1.0 必须交付的用户能力

### 2.1 PPT 式设计器

必须支持：

- 左侧页面缩略图。
- 新建、复制、删除、重命名、重排页面。
- 页面类型：Page / Modal / Drawer / Popover / Component。
- 画布缩放、平移。
- 插入文本、形状、图片、图标。
- 插入 UI 元素：Button、Input、Textarea、Checkbox、Select、Tabs、List、DataTable、Chat、FilePicker、CodeBlock、BrowserFrame（安全占位/预览）。
- 选择、多选、框选。
- 拖动、缩放、旋转。
- 对齐、分布、层级。
- 组合/取消组合。
- 锁定/解锁。
- 复制/粘贴。
- Undo/Redo。
- 智能参考线与吸附。
- 右键菜单。
- 属性面板。
- 主题与基本配色。
- 页面缩略图实时同步。
- “设为组件”与组件复用。

### 2.2 交互无限画布

必须支持：

- 所有 Page/Modal/Drawer/Popover 自动形成可视节点。
- 节点显示真实缩略图。
- 双击节点回到对应设计页面。
- 元素级 handle：例如页面节点内部能找到 `btn-create-project`。
- 通过连线定义：
  - Navigate
  - Open Modal
  - Open Drawer
  - Close
  - Back
  - Toggle visibility
  - Submit
  - Send to Agent
  - Invoke Capability
  - Set Variable
  - Bind Output
- 支持触发器：
  - Click
  - Double click
  - Change
  - Submit
  - Page load
- 连线可编辑、删除、禁用。
- 连线校验，禁止悬空目标、循环死锁式自动触发链。
- 自动保存画布位置，不影响业务逻辑。
- 交互图与设计稿必须引用同一稳定 ID，不允许靠元素名称匹配。

### 2.3 Agent 设计

必须支持：

- 新建 Agent。
- Agent 名称、说明、System Instructions。
- 模型策略（provider/model 可配置，不硬编码一个厂商）。
- Agent 节点可出现在交互画布。
- Tool/Capability 可连接到 Agent。
- 一个 Agent 可拥有多个 Capability。
- 一个项目可拥有多个 Agent。
- 可以指定默认 Agent。
- Agent 的 UI Chat 组件可绑定指定 Agent。
- 运行时由 Pi Agent Core 提供。
- 配置可序列化进 MDT Project Blueprint。

### 2.4 Capability Library

1.0 至少提供以下 Capability：

- `web_search`
- `web_fetch`
- `http_request`
- `browser`
- `file_read`
- `file_write`
- `file_list`
- `shell`（默认禁用，需要用户明确授权）
- `python`（默认受限）
- `mcp`
- `datetime`
- `json`
- `user_prompt` / `ask_user` 类交互能力

每个 Capability 必须有：

- manifest
- 版本号
- icon
- 输入 schema
- 输出 schema
- runtime adapter
- 权限声明
- secrets 声明
- UI 插入定义
- 测试
- 文档

### 2.5 Codex Builder

必须支持：

- 检测 Codex 是否安装。
- 引导安装/登录，但不得把凭证写入 MDT 项目。
- 建立 Codex session。
- 向 Codex 传递 Blueprint、任务、当前 selection、代码上下文。
- 流式展示 progress、tool call、file change、test result。
- Cancel。
- 构建隔离工作区。
- 以 Git diff 展示修改。
- 应用/回滚一次构建。
- 构建失败后根据错误日志再次修复。
- 自动执行质量门。
- 产物进入 preview。

### 2.6 Pi Runtime

必须支持：

- 默认生成 Agent 使用 Pi Agent Core。
- Pi 依赖使用官方当前包名/版本；实施前先核实并锁定。
- 运行时 Tool Schema 来自 MDT Capability Registry。
- 生成项目可自行安装依赖并运行。
- 不依赖 MDT Electron 进程。
- 不把 Codex SDK 打进最终用户 Agent，除非用户自己的设计明确要求。

### 2.7 项目与导出

必须支持：

- 新建/打开/保存 MDT 项目。
- autosave。
- crash recovery。
- project schema version。
- migration。
- assets 管理。
- 最近项目。
- “构建应用”。
- “打开源码目录”。
- “运行预览”。
- “停止预览”。
- “导出/复制生成项目”。
- 生成项目包含 README、`.env.example`、安装/启动命令、测试命令。
- 生成项目独立运行。

---

# 3. 全量任务清单

下面所有任务都必须执行。每个任务只有在“验收标准”全部满足后才能标记完成。

## P00 — 执行纪律、Goal 模式与任务管理

### P00.01 — 建立唯一任务状态文件

**执行步骤**

1. 在仓库根目录创建 `TASK_STATUS.md`。
2. 把本清单所有任务 ID 写入状态文件，字段至少包含：ID、状态、负责人、开始时间、完成时间、验证命令、备注。
3. 状态仅允许 `TODO / IN_PROGRESS / BLOCKED / DONE / REOPENED`。

**验收标准**

- [ ] 文件存在且覆盖本清单全部任务。
- [ ] 任一时刻不允许出现两个主任务都标记为主 Agent `IN_PROGRESS` 而没有说明并行关系。
- [ ] 完成任务时必须记录真实验证命令和结果。

### P00.02 — 限制子 Agent 并行数为 3

**执行步骤**

1. 主 Agent 可以创建子 Agent，但同时运行数量不得超过 3。
2. 为三个并行槽位固定职责标签：A=上游/设计器，B=runtime/capability，C=Codex/测试；可按阶段重分配。
3. 所有子 Agent 结果必须回到主 Agent 做 diff review、集成测试后才能合并。

**验收标准**

- [ ] 任何日志/任务状态中无超过 3 个并行子 Agent。
- [ ] 子 Agent 不直接宣布项目验收完成。
- [ ] 主 Agent对每次集成提交有审查记录。

### P00.03 — 定义失败处理规则

**执行步骤**

1. 任何测试失败先定位根因，不得通过跳过测试、降低断言、扩大 timeout、删除功能来掩盖。
2. 同一失败连续两次修复失败时，记录到 `docs/debug/` 并重新读取相关代码路径。
3. 出现数据损坏、权限越界、安全问题时立即提升为 P0/P1 并停止相关新功能开发。

**验收标准**

- [ ] 测试配置中不存在为了绿灯而新增的无理由 `skip`。
- [ ] P0/P1 问题修复后有回归测试。

### P00.04 — 定义提交粒度

**执行步骤**

1. 每个完成的可独立验证任务形成小提交或一组逻辑一致提交。
2. Commit message 使用 Conventional Commits。
3. 禁止一次提交混入无关格式化、依赖升级和功能变更。

**验收标准**

- [ ] `git log` 可按功能追踪。
- [ ] 没有大范围无意义格式变化。

### P00.05 — 建立 ADR 决策机制

**执行步骤**

1. 创建 `docs/adr/README.md` 模板。
2. 凡涉及许可证、项目格式、Codex 接法、Pi runtime、Capability schema、sandbox、安全模型、生成目标等重大决定必须写 ADR。

**验收标准**

- [ ] 关键架构决策都有 ADR。
- [ ] ADR 包含 Context / Decision / Alternatives / Consequences。

## P01 — 上游拉取、新 GitHub 仓库与许可证

### P01.01 — 检查本机工具链

**执行步骤**

1. 验证 `git --version`、`gh --version`、`node --version`、`npm --version`。
2. Node 必须满足 GenOffice 当前要求；以仓库 `package.json`/`.nvmrc` 为准。
3. 检查 GitHub CLI 已登录，且当前账号有创建 public repository 权限。

**验收标准**

- [ ] 所有命令成功。
- [ ] 把版本写入 `docs/build-environment.md`。

### P01.02 — 克隆 GenOffice 上游

**执行步骤**

1. 执行 `git clone https://github.com/genspark-ai/genoffice.git metis-development-tool`。
2. 进入目录后记录 `git rev-parse HEAD`。
3. 保存上游 commit SHA、日期、仓库地址到 `docs/upstream/GENOFFICE_BASELINE.md`。

**验收标准**

- [ ] 本地仓库完整。
- [ ] baseline 文档包含不可变 commit SHA。

### P01.03 — 重命名上游 remote

**执行步骤**

1. 将原 `origin` 重命名为 `genoffice-upstream`。
2. 确认 `git remote -v` 中不再把 GenOffice 叫 origin。
3. 配置 `genoffice-upstream` 只用于 fetch。

**验收标准**

- [ ] `origin` 尚未指向 GenOffice。
- [ ] `genoffice-upstream` fetch URL 正确。

### P01.04 — 增加防误推保护

**执行步骤**

1. 给 `genoffice-upstream` 设置不可用的 push URL，或在 `.git/hooks/pre-push`/项目脚本中明确阻断目标包含 `genspark-ai/genoffice` 的 push。
2. 在 `CONTRIBUTING.md` 写明禁止向 GenOffice push/PR。

**验收标准**

- [ ] 执行模拟 `git push genoffice-upstream HEAD` 必须失败且给出清晰提示。
- [ ] 普通 `git fetch genoffice-upstream` 正常。

### P01.05 — 创建 MDT 独立 GitHub 仓库

**执行步骤**

1. 使用当前 GitHub 账号创建 `metis-development-tool`。
2. 仓库 visibility 必须为 `public`。
3. 不要使用 GitHub fork 操作，不创建 GenOffice fork network PR。
4. 将新仓库设置为 `origin`。

**验收标准**

- [ ] GitHub 仓库名称严格为 `metis-development-tool`。
- [ ] 仓库为 PUBLIC。
- [ ] `git remote get-url origin` 指向 MDT 仓库。

### P01.06 — 首次推送到 MDT 仓库

**执行步骤**

1. 将当前 baseline 推送到 MDT 的 `main`。
2. 确认 GitHub Web 页面可公开访问。
3. 后续所有分支、PR、tag 只推 MDT。

**验收标准**

- [ ] 远程 main 可 clone。
- [ ] 无任何提交推入 GenOffice。

### P01.07 — 许可证确定为 Apache-2.0

**执行步骤**

1. 保留兼容的 Apache-2.0 `LICENSE`。
2. 更新 `NOTICE`，说明 MDT 派生使用 GenOffice 部分代码，并保留其版权要求。
3. 创建 `THIRD_PARTY_NOTICES.md`，列出 GenOffice、Codex、Pi、React Flow 以及其他保留依赖。

**验收标准**

- [ ] `LICENSE`、`NOTICE`、第三方声明完整。
- [ ] 许可证扫描不把 GenOffice 派生代码错误标记为 MIT-only。

### P01.08 — 建立 upstream update 文档

**执行步骤**

1. 写 `docs/upstream/UPDATE_GENOFFICE.md`。
2. 说明如何 fetch、如何比较、如何 cherry-pick/手动移植安全更新。
3. 明确禁止直接 merge 上游整个 main 覆盖 MDT。

**验收标准**

- [ ] 另一名开发者仅按文档可完成一次 dry-run upstream diff。

### P01.09 — 仓库公共治理文件

**执行步骤**

1. 创建/更新 README、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、CHANGELOG、ROADMAP。
2. README 首屏写清产品定位、永久开源、GenOffice/Codex/Pi 的角色。

**验收标准**

- [ ] 新用户 5 分钟内能理解 MDT 是什么、怎么启动、如何贡献。

### P01.10 — 保护主分支工作流

**执行步骤**

1. 设置 GitHub Actions 必过后再建议合并。
2. 如果账号权限允许，配置 main branch protection；若不允许，至少在 CONTRIBUTING 规定。
3. 禁止 force-push main。

**验收标准**

- [ ] CI 对 PR 自动运行。
- [ ] main 不依赖人工本地测试作为唯一门槛。

## P02 — GenOffice 基线复现与依赖审计

### P02.01 — 原始 GenOffice 安装基线

**执行步骤**

1. 严格按上游锁文件执行安装。
2. 首次安装前不要修改依赖。
3. 记录安装耗时、warning、native module 情况。

**验收标准**

- [ ] 依赖安装成功。
- [ ] 无私自删除 lockfile。

### P02.02 — 运行上游格式检查

**执行步骤**

1. 运行上游 `format:check` 或等价命令。
2. 保存结果到 `docs/upstream/baseline-checks.md`。

**验收标准**

- [ ] 基线结果被记录。
- [ ] 如上游自身失败，明确区分 baseline failure 与 MDT regression。

### P02.03 — 运行上游 typecheck

**执行步骤**

1. 运行根级 typecheck。
2. 单独确认 slides workspace typecheck。

**验收标准**

- [ ] 结果记录。
- [ ] MDT 开发不得引入新的 type error。

### P02.04 — 运行上游测试

**执行步骤**

1. 运行根测试。
2. 单独运行 Slides tests。
3. 记录测试数、通过数、失败数。

**验收标准**

- [ ] 得到可复现 baseline。
- [ ] 失败必须有日志。

### P02.05 — 运行 Slides 开发模式

**执行步骤**

1. 只启动 Slides workspace。
2. 打开一个空 deck 和一个 fixture deck。
3. 验证文本、形状、图片、选择、拖动、缩放、Undo/Redo。

**验收标准**

- [ ] Slides 可正常交互。
- [ ] 截图保存到 `docs/upstream/screenshots/`。

### P02.06 — 建立 Slides 依赖闭包

**执行步骤**

1. 读取 `apps/slides/package.json`、imports、workspace dependencies。
2. 递归列出 Slides 实际依赖的 `packages/*`。
3. 输出 `docs/architecture/genoffice-slides-dependency-map.md`。

**验收标准**

- [ ] 依赖图包含直接和关键间接 workspace 依赖。
- [ ] 每个拟删除 package 都有“被引用/未引用”证据。

### P02.07 — 审计 Slides renderer 热点

**执行步骤**

1. 阅读 `App.tsx`、`SlideCanvas.tsx`、`NodeBody.tsx`、`TextEditOverlay.tsx`、`SlideThumb.tsx`、action/context、AI 目录。
2. 记录：状态来源、selection、undo、render、thumbnail、keyboard、clipboard、file load/save 的入口。

**验收标准**

- [ ] 产出 `docs/architecture/slides-renderer-map.md`。
- [ ] 文档能指向具体文件与职责。

### P02.08 — 审计 Electron main/preload IPC

**执行步骤**

1. 列出 Slides main process IPC channel。
2. 列出 preload 暴露给 renderer 的 API。
3. 标记高权限路径：filesystem、shell、dialog、network、credential。

**验收标准**

- [ ] 产出 IPC 清单。
- [ ] 后续安全改造有明确基础。

### P02.09 — 审计 GenOffice AI 依赖

**执行步骤**

1. 找出 `agent-core`、`ai-provider`、`ai-search`、Slides AI Panel 的所有引用。
2. 区分可删除部分和设计器核心依赖。

**验收标准**

- [ ] 输出删除计划。
- [ ] 删除 AI 不会误删 Canvas 基础功能。

### P02.10 — 建立性能 baseline

**执行步骤**

1. 记录冷启动、打开 10 页 deck、50 页 deck、复制/拖动典型对象的响应。
2. 记录内存占用。

**验收标准**

- [ ] 形成 `docs/testing/performance-baseline.md`。
- [ ] 后续可比较 MDT regression。

## P03 — 裁剪 GenOffice 与建立 MDT 应用骨架

### P03.01 — 创建 `apps/mdt`

**执行步骤**

1. 从 `apps/slides` 复制为 `apps/mdt`，先保证原功能能启动。
2. 修改 package name、app id、窗口标题、应用名称。
3. 不要在同一任务大规模改结构。

**验收标准**

- [ ] `npm run dev:mdt` 或等价命令可启动。
- [ ] UI 暂时仍像 Slides 是允许的。

### P03.02 — 新增根级 MDT scripts

**执行步骤**

1. 新增 `dev:mdt`、`test:mdt`、`typecheck:mdt`、`build:mdt`。
2. 脚本不得依赖人工 cd。

**验收标准**

- [ ] 四个脚本可在根目录执行。

### P03.03 — 移除非 MDT app workspace

**执行步骤**

1. 根据 P02 依赖图，逐个移除 docs/sheets/pdf/markdown/html/shell 等 MDT 不需要的 app。
2. 每删一个 workspace 都执行 install/typecheck/test。

**验收标准**

- [ ] 根 workspace 只保留 MDT 需要内容。
- [ ] 无 dangling workspace reference。

### P03.04 — 移除 GenOffice 登录/品牌

**执行步骤**

1. 去除 Genspark 登录、云端品牌、非必要 telemetry/服务绑定。
2. 保留第三方归属声明，不删除法律归属。

**验收标准**

- [ ] 启动时不要求 Genspark 账号。
- [ ] MDT 品牌清晰。

### P03.05 — 移除 GenOffice AI Panel

**执行步骤**

1. 删除或隔离 Slides 原 AI panel。
2. 移除不再需要的 agent-core/provider/search runtime 依赖。
3. 保证 Canvas、undo、file 操作仍正常。

**验收标准**

- [ ] 无旧 AI UI。
- [ ] 设计器回归测试通过。

### P03.06 — 保留并隔离必要 PPT engine

**执行步骤**

1. 保留 `pptx-engine`、`pptx-render` 及实际需要的 font/ui 等包。
2. 禁止为了“干净”一次性重写 engine。

**验收标准**

- [ ] 能导入至少 5 个不同 PPTX fixture。
- [ ] 渲染与 baseline 无严重退化。

### P03.07 — 将 Slide 术语表面改为 Page

**执行步骤**

1. 用户界面中的 `Slide` 改为 `Page`，内部底层类型可暂保持兼容。
2. 缩略图区域、菜单、tooltip 全部统一。

**验收标准**

- [ ] 普通 UI 不再混用 slide/page。
- [ ] PPTX import/export 相关文案可保留 Slide。

### P03.08 — 建立设计层适配包 `mdt-design`

**执行步骤**

1. 不要让整个 MDT 业务直接依赖 pptx 内部模型。
2. 创建适配接口：Page、Element、Group、Asset、Thumbnail。
3. 底层 GenOffice model 通过 adapter 映射。

**验收标准**

- [ ] 业务层可以只 import `mdt-design`。
- [ ] 新增单测覆盖转换。

### P03.09 — 删除 Presentation-only 功能 V1

**执行步骤**

1. 移除或隐藏 Transitions、Animations、Presenter、Slide Show 等与 Agent UI 设计无关的功能。
2. 保留代码时必须不进入默认 bundle 或 UI。

**验收标准**

- [ ] 主 Ribbon 不出现演示专用 tab。
- [ ] 无残留快捷键导致异常。

### P03.10 — 保留 PPTX 导入

**执行步骤**

1. 允许用户把 PPTX 作为视觉设计起点导入。
2. 导入后转换为 MDT page model，保留可编辑元素。

**验收标准**

- [ ] 典型 PPTX 能导入。
- [ ] 失败时给具体错误，不崩溃。

### P03.11 — 保留受控 PPTX 导出

**执行步骤**

1. 允许把纯视觉页面导出 PPTX 作为交换格式。
2. MDT 交互/Agent metadata 无法映射到 PPTX 时不得静默丢失；导出提示只导出视觉部分。

**验收标准**

- [ ] 导出 PPTX 可被 PowerPoint/GenOffice 打开。
- [ ] 用户收到明确 metadata 限制提示。

### P03.12 — 建立 MDT 品牌壳

**执行步骤**

1. 应用名称 `Metis Development Tool`。
2. 短名 `MDT`。
3. 默认 welcome 页面仅包含：New Project、Open Project、Recent Projects、Docs。

**验收标准**

- [ ] 启动无 GenOffice suite 痕迹。
- [ ] 无多余 Office app 入口。

## P04 — MDT Project Schema 与稳定 ID

### P04.01 — 创建 `mdt-schema` 包

**执行步骤**

1. 使用 TypeScript 类型 + JSON Schema 双源一致策略；可用 Zod/TypeBox 等，但必须能生成 JSON Schema。
2. 定义 `schemaVersion`。

**验收标准**

- [ ] schema 可编译。
- [ ] runtime validation 有测试。

### P04.02 — 定义 ProjectRoot

**执行步骤**

1. 字段至少：id、name、schemaVersion、createdAt、updatedAt、pages、components、agents、capabilities、interactions、variables、assets、settings。

**验收标准**

- [ ] JSON schema 能拒绝缺失必要字段。

### P04.03 — 定义 Page

**执行步骤**

1. 稳定 `id`，独立 `name`。
2. type: page/modal/drawer/popover/component。
3. viewport、background、elements、metadata。

**验收标准**

- [ ] rename 不改变 id。
- [ ] 复制产生新 id。

### P04.04 — 定义 Element

**执行步骤**

1. 稳定 id。
2. visual payload 通过 design adapter 表示。
3. semantics: role、label、interaction handles、binding、componentRef、accessibility metadata。

**验收标准**

- [ ] 元素移动/改名不改变 id。

### P04.05 — 定义 Component

**执行步骤**

1. Component 有稳定 id 和内部 element tree。
2. 实例通过 componentRef + overrides 表示。
3. 禁止复制实例时丢失来源关系。

**验收标准**

- [ ] 组件更新有可预测行为。

### P04.06 — 定义 Agent

**执行步骤**

1. id、name、description、instructions、modelPolicy、capabilityRefs、memory config、isDefault。
2. 不把 provider secret 放进 schema。

**验收标准**

- [ ] schema validation 通过。

### P04.07 — 定义 CapabilityRef

**执行步骤**

1. project 只存 capability id/version/config references。
2. secret 使用 secretRef。
3. permission 单独声明。

**验收标准**

- [ ] 导出 project JSON 不含 secret 明文。

### P04.08 — 定义 Interaction

**执行步骤**

1. source object/element、trigger、action、target、conditions、enabled。
2. action 使用 discriminated union。

**验收标准**

- [ ] 无 target 的 action 在需要 target 时被 validation 拒绝。

### P04.09 — 定义 Data Binding

**执行步骤**

1. 支持 source -> target binding。
2. 最少覆盖 Agent output -> Chat、Capability output -> List/Text、Input value -> Agent input。

**验收标准**

- [ ] 绑定引用稳定 id。

### P04.10 — 定义 Variable

**执行步骤**

1. project/page/session 三种 scope。
2. 类型至少 string/number/boolean/json。
3. 默认值 schema 校验。

**验收标准**

- [ ] 非法类型不能保存。

### P04.11 — 定义 Asset

**执行步骤**

1. asset id、relative path、mime、hash、size、originalName。
2. 项目不依赖绝对路径。

**验收标准**

- [ ] 项目移动目录后资源仍可解析。

### P04.12 — 稳定 ID 生成器

**执行步骤**

1. 采用 UUIDv7/ULID/crypto-random 等可靠方案。
2. 禁止数组 index 当 id。
3. 禁止 name 当 id。

**验收标准**

- [ ] 10 万次生成无冲突。

### P04.13 — 引用完整性校验器

**执行步骤**

1. 检查 interaction、component、agent、capability、asset、binding 的所有 ref。
2. 返回 machine-readable error path。

**验收标准**

- [ ] 删除被引用对象时能阻止或提供级联方案。

### P04.14 — Schema version migration 框架

**执行步骤**

1. 定义迁移函数链 `vN -> vN+1`。
2. 迁移必须纯函数或有备份。
3. 不得直接覆盖旧项目而无备份。

**验收标准**

- [ ] fixture 项目可从旧版迁移。

### P04.15 — 生成 Blueprint

**执行步骤**

1. 定义 `BuildBlueprint`，只包含构建需要的规范化数据。
2. 从 project model deterministic 生成。
3. 按稳定顺序序列化，避免无意义 diff。

**验收标准**

- [ ] 同一项目重复生成 hash 相同。
- [ ] 有 snapshot test。

## P05 — 项目读写、Autosave、恢复与资源管理

### P05.01 — 确定项目目录格式

**执行步骤**

1. 项目用普通目录，不用不可读二进制。
2. 至少包含 `mdt.project.json`、`design/`、`assets/`、`.mdt/`。

**验收标准**

- [ ] 可 git diff。
- [ ] 手工复制目录可打开。

### P05.02 — 原子保存

**执行步骤**

1. 写临时文件后 fsync/rename。
2. 崩溃时不留下半个 JSON。

**验收标准**

- [ ] 模拟进程中断后原文件仍有效。

### P05.03 — Autosave

**执行步骤**

1. dirty state 后 debounce 保存。
2. 保存失败 UI 显示且保留 dirty。
3. 不要每拖动 1px 都同步写磁盘。

**验收标准**

- [ ] 连续拖动不卡顿。
- [ ] 停止操作后自动落盘。

### P05.04 — Crash recovery

**执行步骤**

1. 保存 recovery snapshot。
2. 异常退出后下次启动提示恢复。
3. 用户可查看时间并选择恢复/放弃。

**验收标准**

- [ ] 强杀进程后能恢复最近状态。

### P05.05 — 最近项目

**执行步骤**

1. 记录最近项目路径和 last opened。
2. 路径失效时提供移除，不崩溃。

**验收标准**

- [ ] Welcome 页面可打开最近项目。

### P05.06 — 资源导入

**执行步骤**

1. 图片/文件复制到项目 assets。
2. 以 hash 避免重复。
3. 保留原文件名 metadata。

**验收标准**

- [ ] 源文件删除后项目仍正常。

### P05.07 — 资源垃圾回收

**执行步骤**

1. 仅删除确定无引用的 asset。
2. 删除前可 dry-run。

**验收标准**

- [ ] 不会误删 component/page 引用资源。

### P05.08 — 项目锁

**执行步骤**

1. 同一路径被两个 MDT 实例打开时检测。
2. 默认阻止双写，可只读打开。

**验收标准**

- [ ] 双开不造成数据损坏。

### P05.09 — 导入损坏项目处理

**执行步骤**

1. schema validation 失败时显示具体字段。
2. 保留只读检查和备份。

**验收标准**

- [ ] 不白屏，不覆盖原文件。

### P05.10 — 项目保存测试矩阵

**执行步骤**

1. 覆盖新建、另存为、移动目录、中文路径、空格路径、长路径、只读目录、磁盘满/权限失败模拟。

**验收标准**

- [ ] 所有场景有自动/集成测试或可复现测试脚本。

## P06 — PowerPoint 风格 Designer 1.0

### P06.01 — 重构 Ribbon 信息架构

**执行步骤**

1. Ribbon 最少：Home、Insert、Design、Interactions、Agent、Preview。
2. 视觉密度、分组、按钮行为尽量沿用 GenOffice Slides。

**验收标准**

- [ ] 用户能依靠 PPT 经验理解主要入口。

### P06.02 — 左侧 Page 缩略图

**执行步骤**

1. 复用 SlideThumb。
2. 支持选择、Ctrl/Shift 多选、拖动排序、右键菜单。

**验收标准**

- [ ] 50 页项目滚动无明显卡顿。

### P06.03 — 新建 Page

**执行步骤**

1. 默认 Page。
2. 支持页面尺寸/viewport preset。

**验收标准**

- [ ] 创建立即进入画布并 autosave。

### P06.04 — 新建 Modal

**执行步骤**

1. Modal 仍用同一画布编辑。
2. 页面元数据 type=modal。
3. 缩略图有轻量类型标记。

**验收标准**

- [ ] Interaction Canvas 可识别为 Modal。

### P06.05 — 新建 Drawer

**执行步骤**

1. 支持 left/right drawer metadata。
2. 画布仍按普通页面编辑。

**验收标准**

- [ ] Preview 可正确打开/关闭。

### P06.06 — 新建 Popover

**执行步骤**

1. 定义 anchor behavior metadata。
2. 不要求设计者写 CSS。

**验收标准**

- [ ] 可从按钮打开。

### P06.07 — Page duplicate/delete/rename

**执行步骤**

1. duplicate 生成新 page/element IDs。
2. 删除被引用 page 前显示引用列表。

**验收标准**

- [ ] 不会产生悬空 interaction。

### P06.08 — Canvas zoom/pan

**执行步骤**

1. 保留 GenOffice 行为。
2. 加入 Fit Page / 100%。

**验收标准**

- [ ] 触控板和鼠标滚轮行为稳定。

### P06.09 — Selection

**执行步骤**

1. 单选、多选、框选、Shift toggle。
2. selection 是全局可观察状态供 Codex context 使用。

**验收标准**

- [ ] selection 回归测试通过。

### P06.10 — Transform

**执行步骤**

1. drag/resize/rotate。
2. 保持 snap/guides。

**验收标准**

- [ ] 拖动 100 次无漂移/累积误差。

### P06.11 — Alignment

**执行步骤**

1. 左/中/右、上/中/下、水平/垂直分布。

**验收标准**

- [ ] 多选操作一次 undo 可还原。

### P06.12 — Layer ordering

**执行步骤**

1. bring front/back、forward/backward。

**验收标准**

- [ ] 缩略图和画布层级一致。

### P06.13 — Group/Ungroup

**执行步骤**

1. 沿用 GenOffice group。
2. MDT semantics 不因 group 丢失。

**验收标准**

- [ ] group 内 button interaction 仍可解析。

### P06.14 — Lock/Unlock

**执行步骤**

1. 锁定后不可拖动/resize，但可选择查看属性。

**验收标准**

- [ ] 复制/保存后 lock 状态保留。

### P06.15 — Clipboard

**执行步骤**

1. 内部复制粘贴保持样式和 semantics。
2. 跨 page 粘贴生成新稳定 id。

**验收标准**

- [ ] 无 ID 冲突。

### P06.16 — Undo/Redo

**执行步骤**

1. 设计操作、属性操作、插入/删除均进入 history。
2. Codex 直接改设计数据时也必须以事务进入 history。

**验收标准**

- [ ] 50 次 undo/redo 不破坏项目。

### P06.17 — Text element

**执行步骤**

1. 保留成熟文本编辑。
2. 支持字体、大小、粗斜体、对齐、颜色、行距基础项。

**验收标准**

- [ ] IME 中文输入正常。

### P06.18 — Shape/Image/Icon

**执行步骤**

1. 保留形状、图片、SVG/icon。
2. 图片使用 project assets。

**验收标准**

- [ ] 重开项目仍可渲染。

### P06.19 — Insert Button

**执行步骤**

1. Button 是 MDT semantic element，不只是矩形。
2. 默认带 role=button、可访问名称。

**验收标准**

- [ ] Interaction Canvas 自动出现可连线 handle。

### P06.20 — Insert Input/Textarea

**执行步骤**

1. 支持 placeholder、default、value binding。

**验收标准**

- [ ] Preview 输入可用。

### P06.21 — Insert Checkbox/Select

**执行步骤**

1. schema 表示 options。
2. 属性面板可编辑。

**验收标准**

- [ ] 生成应用有可访问 label。

### P06.22 — Insert Tabs/List/DataTable

**执行步骤**

1. 提供基础样式，数据源通过 binding 指定。
2. 设计态展示 sample placeholder，但构建时不得把 sample 当真实数据。

**验收标准**

- [ ] binding 后 preview 显示真实数据。

### P06.23 — Insert Chat

**执行步骤**

1. Chat 组件可绑定 AgentRef。
2. 支持 messages/input/send basic slots。

**验收标准**

- [ ] 生成应用能与 Pi runtime 通话。

### P06.24 — Insert FilePicker

**执行步骤**

1. 允许配置 accept/multiple。
2. 运行时走 capability/上传逻辑。

**验收标准**

- [ ] 文件选择失败有错误反馈。

### P06.25 — Insert CodeBlock

**执行步骤**

1. 用于输出代码/文本。
2. 不在 designer 执行任意代码。

**验收标准**

- [ ] XSS payload 不执行。

### P06.26 — Insert BrowserFrame

**执行步骤**

1. 设计态只作为安全占位和 URL 配置。
2. 真正运行采用 sandbox/allowlist 策略。

**验收标准**

- [ ] 不允许 `javascript:` URL。

### P06.27 — Property Inspector

**执行步骤**

1. 位置、尺寸、填充、边框、文本、语义、绑定分区。
2. 默认只展示常用项，高级项折叠。

**验收标准**

- [ ] 修改后立即反映且可 undo。

### P06.28 — Page/Element 命名

**执行步骤**

1. 名称是人类可读别名，ID 不随名称改变。

**验收标准**

- [ ] rename 不破坏 interaction。

### P06.29 — 设为 Component

**执行步骤**

1. 选中一组元素后创建 Component。
2. 原元素替换为 component instance。

**验收标准**

- [ ] 实例可复制和 override。

### P06.30 — Component Library

**执行步骤**

1. Insert 中显示项目组件。
2. 编辑源组件后实例更新；override 保留。

**验收标准**

- [ ] 循环 component reference 被阻止。

### P06.31 — Theme

**执行步骤**

1. 定义 project colors/fonts tokens。
2. 设计元素可引用 token。

**验收标准**

- [ ] 修改 token 后引用元素更新。

### P06.32 — Keyboard shortcuts

**执行步骤**

1. 保留 PPT 风格 Ctrl/Cmd+C/V/Z/Y/G、Delete、方向键。
2. 不劫持文本输入。

**验收标准**

- [ ] Windows/macOS 映射测试。

### P06.33 — Context menu

**执行步骤**

1. 复制、粘贴、组合、锁定、层级、定义交互。

**验收标准**

- [ ] 菜单项只在有效 selection 显示。

### P06.34 — Thumbnail rendering

**执行步骤**

1. 缩略图增量刷新。
2. 不因每个 pointermove 全量重渲染全部页。

**验收标准**

- [ ] 50 页拖动对象时 UI 可用。

### P06.35 — Designer accessibility

**执行步骤**

1. toolbar 按钮有 accessible name。
2. focus visible。
3. 主要操作可键盘执行。

**验收标准**

- [ ] axe/人工检查无关键缺陷。

## P07 — Interaction Canvas / 无限画布

### P07.01 — 引入 React Flow

**执行步骤**

1. 使用当前稳定 `@xyflow/react` 并锁定版本。
2. 记录许可证到第三方声明。

**验收标准**

- [ ] 可最小渲染 nodes/edges。

### P07.02 — 建立独立 Interaction 视图

**执行步骤**

1. 顶部 `Interactions` tab 切换。
2. Designer 状态不丢。

**验收标准**

- [ ] 切回 Designer selection/page 保持。

### P07.03 — Page nodes

**执行步骤**

1. 每个 Page/Modal/Drawer/Popover 自动创建节点。
2. 节点显示真实 thumbnail。

**验收标准**

- [ ] 新增/删除页面实时同步。

### P07.04 — Node positions 持久化

**执行步骤**

1. 画布布局 position 存 UI metadata，不混入业务 semantics。

**验收标准**

- [ ] 重新打开项目位置一致。

### P07.05 — 双击跳回设计页

**执行步骤**

1. 双击 node 进入 Designer 并选对应 page。

**验收标准**

- [ ] 100% 准确，不靠名称。

### P07.06 — Element handles

**执行步骤**

1. 交互源元素显示可识别 handle。
2. 优先显示 semantic/interactive 元素。

**验收标准**

- [ ] btn id 与 edge sourceRef 一致。

### P07.07 — Navigate edge

**执行步骤**

1. 拖 Button handle 到 Page 生成 navigate interaction。

**验收标准**

- [ ] Preview 点击后跳转。

### P07.08 — Open Modal edge

**执行步骤**

1. 拖到 Modal 自动默认 openModal。

**验收标准**

- [ ] Modal 可关闭。

### P07.09 — Open Drawer edge

**执行步骤**

1. 拖到 Drawer 自动默认 openDrawer。

**验收标准**

- [ ] Drawer 方向正确。

### P07.10 — Back/Close edge

**执行步骤**

1. 支持明确 action，不依赖特殊页面名字。

**验收标准**

- [ ] modal/drawer 关闭回到之前状态。

### P07.11 — Toggle visibility

**执行步骤**

1. target 可为当前 page 内 element。

**验收标准**

- [ ] preview 可 toggle。

### P07.12 — Submit trigger

**执行步骤**

1. Form/container 可以 submit。
2. 连到 Agent/Capability。

**验收标准**

- [ ] Enter/按钮 submit 逻辑一致。

### P07.13 — Send to Agent

**执行步骤**

1. edge target 为 AgentRef。
2. 可指定 payload 来源，例如 Input value。

**验收标准**

- [ ] Agent 收到正确内容。

### P07.14 — Invoke Capability

**执行步骤**

1. edge target 为 CapabilityRef。
2. 参数 mapping 使用 schema 驱动 UI。

**验收标准**

- [ ] 缺必要参数时 interaction lint 报错。

### P07.15 — Bind output

**执行步骤**

1. 支持 Agent/Capability output -> element property。

**验收标准**

- [ ] 结果能显示到 Text/List/Chat。

### P07.16 — Set Variable

**执行步骤**

1. edge action 可更新 project/page/session var。

**验收标准**

- [ ] 类型不匹配被阻止。

### P07.17 — Edge inspector

**执行步骤**

1. trigger、action、condition、mapping、enabled。
2. 普通用户看到自然语言标签。

**验收标准**

- [ ] 编辑可 undo。

### P07.18 — Delete edge

**执行步骤**

1. Delete/backspace/context menu。

**验收标准**

- [ ] 删除只影响对应 interaction。

### P07.19 — Interaction lint

**执行步骤**

1. 悬空 ref、缺参数、错误 target type、自动触发闭环、无绑定输出等。

**验收标准**

- [ ] lint 返回 severity + path + quick-fix 可选。

### P07.20 — Auto layout

**执行步骤**

1. 提供 `Auto Arrange`，不能覆盖业务数据。

**验收标准**

- [ ] 100 nodes 可整理。

### P07.21 — MiniMap/fit view

**执行步骤**

1. 100+ nodes 可导航。

**验收标准**

- [ ] fit view 不改变保存 position。

### P07.22 — Search

**执行步骤**

1. 按 Page/Element/Agent/Capability 名称定位节点。

**验收标准**

- [ ] 搜索结果点击居中。

### P07.23 — Interaction Canvas 性能

**执行步骤**

1. 测试 100 page nodes + 300 edges。
2. 避免每次 selection 全图重渲染。

**验收标准**

- [ ] 典型 PC 保持可交互，无秒级冻结。

### P07.24 — 交互图 E2E

**执行步骤**

1. 用真实鼠标拖 edge、编辑 edge、保存、重开。

**验收标准**

- [ ] E2E 稳定通过。

## P08 — Agent Model 与 Pi Runtime Adapter

### P08.01 — 核实 Pi 当前官方仓库和包名

**执行步骤**

1. 读取当前 Pi 官方 README/package。
2. 记录 commit/tag 与许可证。
3. 禁止沿用过时包名。

**验收标准**

- [ ] `docs/upstream/PI_BASELINE.md` 完成。

### P08.02 — 创建 `mdt-pi-runtime`

**执行步骤**

1. 只做 adapter/template，不 fork Pi core。
2. 定义 createAgent、registerTool、runTurn 等 MDT 需要的窄接口。

**验收标准**

- [ ] adapter 单测使用 mock provider。

### P08.03 — Agent CRUD

**执行步骤**

1. Designer/Interaction 中可创建、重命名、删除 Agent。
2. 删除前检查引用。

**验收标准**

- [ ] 项目保存重开完整。

### P08.04 — Agent Instructions Editor

**执行步骤**

1. 支持多行 instructions。
2. 版本变化进入 project history。

**验收标准**

- [ ] 生成 runtime 收到正确 instructions。

### P08.05 — Model policy

**执行步骤**

1. provider/model 以配置表示。
2. 支持 project default + agent override。
3. secret 只存 secure settings。

**验收标准**

- [ ] 切换 provider 不改 schema。

### P08.06 — Default Agent

**执行步骤**

1. 项目最多一个默认 Agent。

**验收标准**

- [ ] schema 和 UI 都 enforce。

### P08.07 — Tool assignment

**执行步骤**

1. Capability 连接到 Agent 后产生 capabilityRefs。
2. 重复连接不重复注册。

**验收标准**

- [ ] runtime tool 数量正确。

### P08.08 — Agent node UI

**执行步骤**

1. Interaction Canvas 显示 Agent node，列出名称和 capability count。

**验收标准**

- [ ] 双击打开 Agent inspector。

### P08.09 — Chat binding

**执行步骤**

1. Chat UI component 选择 AgentRef。

**验收标准**

- [ ] preview 真正调用 Pi runtime。

### P08.10 — Runtime event stream

**执行步骤**

1. 定义 token/tool-start/tool-result/error/final 等事件。
2. renderer 不直接依赖 Pi 私有事件结构。

**验收标准**

- [ ] 流式消息顺序测试。

### P08.11 — Tool approval bridge

**执行步骤**

1. 高风险 capability 可要求用户批准。
2. runtime 事件能暂停并等待批准。

**验收标准**

- [ ] 拒绝后 agent 收到明确 tool error。

### P08.12 — Runtime cancellation

**执行步骤**

1. 用户停止 generation 时 cancel 当前 agent turn。

**验收标准**

- [ ] 无僵尸进程/未结束 stream。

### P08.13 — Runtime error normalization

**执行步骤**

1. provider、tool、timeout、validation 错误转换统一 error shape。

**验收标准**

- [ ] UI 不显示 undefined/[object Object]。

### P08.14 — Pi runtime standalone sample

**执行步骤**

1. 从 MDT schema 生成最小 agent sample。
2. 在 MDT 之外 `npm install && npm run dev`。

**验收标准**

- [ ] 能完成一轮不依赖 MDT 的 agent turn。

## P09 — Capability Registry 与内置工具

### P09.01 — Capability manifest schema

**执行步骤**

1. 字段：id/name/version/category/description/icon/inputSchema/outputSchema/permissions/secrets/runtimeEntry/uiMetadata。

**验收标准**

- [ ] invalid manifest 被拒绝。

### P09.02 — Registry loader

**执行步骤**

1. 加载 built-in + project-installed capability。
2. ID/version 冲突有规则。

**验收标准**

- [ ] 加载顺序 deterministic。

### P09.03 — Capability Insert UI

**执行步骤**

1. Ribbon `Agent` 或 `Insert > Agent Capabilities`。
2. 可搜索分类。

**验收标准**

- [ ] 点击后加入项目 registry。

### P09.04 — Capability node

**执行步骤**

1. Interaction Canvas 可显示已加入 capability。
2. 显示权限与配置状态。

**验收标准**

- [ ] 未配置 secret 有警示。

### P09.05 — Capability inspector

**执行步骤**

1. schema 驱动参数表单。
2. secret 字段只选择 secretRef。

**验收标准**

- [ ] 不会把 secret 写 JSON。

### P09.06 — Secret store

**执行步骤**

1. Electron 使用系统安全存储/安全包装。
2. 提供 add/update/delete/list metadata。
3. 日志统一脱敏。

**验收标准**

- [ ] 项目文件无 secret 明文。

### P09.07 — 权限模型

**执行步骤**

1. permissions 至少 network/filesystem/process/browser/user-interaction。
2. 默认最小权限。

**验收标准**

- [ ] 高风险能力需要显式授权。

### P09.08 — 实现 web_fetch

**执行步骤**

1. 仅 http/https。
2. SSRF 防护：阻止 localhost/private/link-local/metadata endpoint，除非项目明确授权本地模式。
3. redirect 次数、响应大小、timeout、content-type 限制。
4. 文本提取与原始 metadata 分离。

**验收标准**

- [ ] 安全测试覆盖 127.0.0.1、169.254.169.254、超大响应、redirect loop。

### P09.09 — 实现 web_search provider abstraction

**执行步骤**

1. 定义 search provider interface。
2. 至少提供一个可配置 provider adapter；再提供 mock provider 用于测试。
3. 不要把单一商业 API 写死到 schema。

**验收标准**

- [ ] 无 key 时显示配置要求而非崩溃。

### P09.10 — 实现 http_request

**执行步骤**

1. method/header/body/query schema。
2. 默认限制危险协议。
3. secret header 通过 secretRef。

**验收标准**

- [ ] GET/POST/JSON/error/timeout 测试。

### P09.11 — 实现 browser capability

**执行步骤**

1. 定义 browse/open/click/type/screenshot 的抽象或接入选定浏览器自动化层。
2. 限制可访问协议和下载。

**验收标准**

- [ ] 至少通过本地 test site E2E。

### P09.12 — 实现 file_read

**执行步骤**

1. 默认只能访问生成应用 workspace 允许目录。
2. 编码/二进制行为明确。

**验收标准**

- [ ] 路径穿越 `../` 被拒绝。

### P09.13 — 实现 file_write

**执行步骤**

1. 限制 sandbox root。
2. 支持 overwrite policy。

**验收标准**

- [ ] 不能写 sandbox 外。

### P09.14 — 实现 file_list

**执行步骤**

1. 限制 root、结果数量。

**验收标准**

- [ ] 目录遍历安全测试。

### P09.15 — 实现 shell

**执行步骤**

1. 默认 disabled。
2. 开启时必须显式 project permission。
3. 工作目录固定在 workspace；环境变量 allowlist。

**验收标准**

- [ ] 默认 Agent 无法调用。

### P09.16 — 实现 python

**执行步骤**

1. 默认受限。
2. 定义超时、工作目录、输出上限。
3. 如果本机无 Python 给出 capability unavailable。

**验收标准**

- [ ] timeout 和输出截断测试。

### P09.17 — 实现 MCP

**执行步骤**

1. 支持配置 server command 或 remote endpoint，具体以当前安全支持为准。
2. manifest 显示外部来源。

**验收标准**

- [ ] 连接失败不拖死主进程。

### P09.18 — 实现 datetime

**执行步骤**

1. 提供当前时间、时区、日期基础能力。

**验收标准**

- [ ] 无外部依赖。

### P09.19 — 实现 json

**执行步骤**

1. parse/stringify/query/validate 基础能力。

**验收标准**

- [ ] 错误返回结构化信息。

### P09.20 — 实现 ask_user

**执行步骤**

1. Agent 能请求 UI 中用户输入。
2. 支持 text/confirm/select 最小集。

**验收标准**

- [ ] 等待状态可 cancel。

### P09.21 — Capability template SDK

**执行步骤**

1. 提供开发者模板和 README。
2. 第三方 capability 可被 registry 加载。

**验收标准**

- [ ] 写一个 sample capability 证明扩展点。

### P09.22 — Capability test harness

**执行步骤**

1. 每个 capability 统一 contract tests。
2. 输入 schema、输出 schema、权限、错误规范自动测。

**验收标准**

- [ ] built-ins 全通过。

### P09.23 — Capability 文档生成

**执行步骤**

1. 从 manifest 自动生成基础文档表。

**验收标准**

- [ ] manifest 与文档不容易漂移。

### P09.24 — Capability 版本兼容

**执行步骤**

1. 项目锁定 major/minor 或精确版本策略。
2. 升级时运行 migration/compat check。

**验收标准**

- [ ] 旧项目打开不会静默换行为。

## P10 — Codex Builder 集成

### P10.01 — 核实 Codex 当前官方集成方式

**执行步骤**

1. 读取 `openai/codex` 当前 main、SDK/app-server 文档。
2. 优先选择官方、受支持、可流式事件的接口。
3. 写 ADR。

**验收标准**

- [ ] ADR 记录为何选 SDK 或 app-server。

### P10.02 — 创建 `mdt-codex` 包

**执行步骤**

1. 定义 CodexClient 接口，renderer 不直接 spawn。
2. main process 管理生命周期。

**验收标准**

- [ ] 可 mock。

### P10.03 — Codex availability check

**执行步骤**

1. 检测 binary/SDK 可用性。
2. 显示版本。

**验收标准**

- [ ] 未安装有明确引导。

### P10.04 — Codex authentication state

**执行步骤**

1. 只检测登录状态，不读取/保存用户密码。
2. API key 若支持，走 secure store/environment。

**验收标准**

- [ ] project JSON 无 token。

### P10.05 — Codex session lifecycle

**执行步骤**

1. start/resume/cancel/dispose。
2. 一个项目可有构建 session history。

**验收标准**

- [ ] 关闭项目会清理子进程。

### P10.06 — Codex IPC

**执行步骤**

1. Renderer 仅通过最小 preload API 接收事件。
2. contextIsolation=true。

**验收标准**

- [ ] 无 `window.require`。

### P10.07 — Build workspace isolation

**执行步骤**

1. 每次构建使用项目 `generated/` 的独立 git worktree/temp branch 或等效隔离。
2. Codex 默认 cwd 固定该目录。

**验收标准**

- [ ] 无法写 MDT 源码/用户其他目录。

### P10.08 — Builder prompt contract

**执行步骤**

1. Prompt 包含 Blueprint path、架构约束、Pi runtime 约束、Capability SDK、验收命令、禁止事项。
2. 不要把整个巨型 project JSON 内嵌到单条 prompt；提供文件上下文。

**验收标准**

- [ ] prompt snapshot test。

### P10.09 — Selection-aware task

**执行步骤**

1. 用户从 Designer 选中元素后说“让这个按钮…”时，将 stable ID、page id、截图/必要 design context 传给 Codex。

**验收标准**

- [ ] Codex 任务能定位元素。

### P10.10 — Streaming progress UI

**执行步骤**

1. 显示 planning、command、file change、test、error、completion。
2. 长输出可折叠查看。

**验收标准**

- [ ] UI 不因高频 token 卡死。

### P10.11 — File change viewer

**执行步骤**

1. 构建结束显示 git diff summary。
2. 可打开具体 diff。

**验收标准**

- [ ] 二进制资源单独处理。

### P10.12 — Apply build

**执行步骤**

1. 通过质量门后可合并工作树改动到 generated source。
2. 记录 build id。

**验收标准**

- [ ] 失败 build 不污染 last-known-good。

### P10.13 — Rollback build

**执行步骤**

1. 每次成功 build 有 git commit/tag 或 manifest checkpoint。
2. 一键回到上一成功构建。

**验收标准**

- [ ] 回滚后 preview 与源码一致。

### P10.14 — Cancel build

**执行步骤**

1. 终止 Codex 会话和子进程树。
2. 标记 build canceled。

**验收标准**

- [ ] Windows/Linux/macOS 无孤儿进程。

### P10.15 — Timeout / hung detection

**执行步骤**

1. 长时间无事件时给状态，不武断 kill。
2. 可配置 hard timeout。

**验收标准**

- [ ] hung 模拟可恢复。

### P10.16 — Retry repair loop

**执行步骤**

1. 如果 typecheck/test/e2e 失败，把结构化错误交给 Codex 再修复。
2. 最大自动修复次数有上限，避免无限循环。

**验收标准**

- [ ] 失败最终有完整报告。

### P10.17 — Builder logs

**执行步骤**

1. JSONL/structured log 存 `.mdt/builds/<id>/`。
2. secret redaction。

**验收标准**

- [ ] 日志可用于复现。

### P10.18 — Codex 不进入 generated runtime

**执行步骤**

1. 检查 generated package.json 不因为 Builder 集成而自动包含 `@openai/codex`。

**验收标准**

- [ ] 默认输出无 Codex 依赖。

### P10.19 — Codex version pin/compat

**执行步骤**

1. 记录已验证 Codex 版本范围。
2. 版本不兼容时警告。

**验收标准**

- [ ] CI 有 mock contract；本地 integration 有版本检查。

### P10.20 — Codex end-to-end build smoke

**执行步骤**

1. 用 sample MDT project 从 Blueprint 构建到可运行源代码。

**验收标准**

- [ ] 一次无人手改流程成功。

## P11 — Deterministic Generator / Compiler

### P11.01 — 创建 `mdt-generator`

**执行步骤**

1. 输入 BuildBlueprint，输出标准 project scaffold。
2. 相同 Blueprint + 相同版本得到 deterministic baseline。

**验收标准**

- [ ] 重复生成无随机差异，除明确 id/timestamp。

### P11.02 — 定义 Web Agent template

**执行步骤**

1. React + TypeScript 前端。
2. Node/TypeScript agent service 或经 ADR 选定结构。
3. Pi runtime 在 service/runtime 层。

**验收标准**

- [ ] `npm install && npm run dev`。

### P11.03 — 生成 package metadata

**执行步骤**

1. name、scripts、engines、license、private/public 属性合理。

**验收标准**

- [ ] npm scripts 完整。

### P11.04 — 生成 Page route scaffold

**执行步骤**

1. 每个 Page 生成路由/视图。
2. Modal/Drawer 不作为普通 route 除非设计要求。

**验收标准**

- [ ] route smoke test。

### P11.05 — 生成 visual layout

**执行步骤**

1. 将 MDT 坐标转换为 CSS/layout。
2. 优先保持设计视觉。
3. 保留 `data-mdt-id` 用于映射。

**验收标准**

- [ ] 截图与设计主要结构匹配。

### P11.06 — 生成 semantic components

**执行步骤**

1. Button/Input 等用真实可访问 HTML 语义。
2. 不把所有元素都输出成绝对定位 div。

**验收标准**

- [ ] axe 关键错误为 0。

### P11.07 — 生成 interaction handlers

**执行步骤**

1. Navigate/Open/Close/Toggle/Submit。

**验收标准**

- [ ] 设计预览与真实 app 行为一致。

### P11.08 — 生成 Agent client

**执行步骤**

1. UI 与 Pi runtime service 通信。
2. 支持 stream/cancel。

**验收标准**

- [ ] Chat E2E。

### P11.09 — 生成 Pi agent config

**执行步骤**

1. Agent instructions/model policy/tool refs。

**验收标准**

- [ ] runtime 注册工具与 Blueprint 一致。

### P11.10 — 生成 Capability registrations

**执行步骤**

1. 只包含项目实际选用 capability。
2. 权限配置进入 runtime。

**验收标准**

- [ ] 未用 capability 不打包。

### P11.11 — 生成 bindings

**执行步骤**

1. Input -> Agent、Agent output -> Chat/Text/List 等。

**验收标准**

- [ ] sample app E2E 覆盖。

### P11.12 — 生成 variables

**执行步骤**

1. 不同 scope 有明确存储位置。

**验收标准**

- [ ] 刷新页面后的持久性符合 scope。

### P11.13 — 生成 assets

**执行步骤**

1. 复制/引用 assets，避免绝对路径。

**验收标准**

- [ ] 移动生成项目仍正常。

### P11.14 — 生成 `.env.example`

**执行步骤**

1. 仅列变量名和说明。
2. 不写真实 secret。

**验收标准**

- [ ] secret scan 通过。

### P11.15 — 生成 README

**执行步骤**

1. 安装、配置、运行、测试、架构、Pi runtime 说明。

**验收标准**

- [ ] 新机器按 README 可运行。

### P11.16 — 生成 tests baseline

**执行步骤**

1. 关键 route/interaction/runtime 提供可扩展测试。

**验收标准**

- [ ] 新项目初始测试全绿。

### P11.17 — 生成 ESLint/TS config

**执行步骤**

1. strict。
2. 禁止默认 any 漂移。

**验收标准**

- [ ] 初始 typecheck/lint 绿。

### P11.18 — Source map back-reference

**执行步骤**

1. 生成代码保留 `data-mdt-id` 或 metadata mapping。
2. 建立 `.mdt-map.json`：MDT id -> source files/symbol。

**验收标准**

- [ ] 可从选中设计元素定位源码。

### P11.19 — Codex patch boundary

**执行步骤**

1. 标注 generator-owned 与 agent-editable 区域或采用 AST/文件职责策略。
2. 重新生成不得无条件覆盖 Codex 手写业务。

**验收标准**

- [ ] 第二次构建不会丢用户代码。

### P11.20 — Incremental generation

**执行步骤**

1. Blueprint 小变更只更新相关 scaffold。
2. 冲突时给 merge plan。

**验收标准**

- [ ] 改一个 button text 不重写全项目。

### P11.21 — 生成 app 独立性测试

**执行步骤**

1. 复制 generated 项目到 MDT repo 外临时目录。
2. 移除 MDT 环境变量/路径。
3. 重新 npm install/build/test。

**验收标准**

- [ ] 完全独立通过。

### P11.22 — Blueprint lint before build

**执行步骤**

1. 构建前必须 schema + refs + interaction + capability config lint。

**验收标准**

- [ ] lint error 时不调用 Codex 浪费资源。

## P12 — Preview、真实运行与设计同步

### P12.01 — Design Preview interpreter

**执行步骤**

1. 不用 Codex 也能预览纯导航/Modal/Drawer/Toggle。
2. 用于快速验证设计。

**验收标准**

- [ ] 点击交互按 interaction graph 工作。

### P12.02 — Real App Preview

**执行步骤**

1. 启动 generated app dev server。
2. 在 MDT 安全预览区域打开。

**验收标准**

- [ ] 真实 Pi runtime 可工作。

### P12.03 — Preview process manager

**执行步骤**

1. start/stop/restart、port selection、health check。

**验收标准**

- [ ] 停止后端口释放。

### P12.04 — Preview error overlay

**执行步骤**

1. build/runtime error 显示结构化信息和“交给 Codex 修复”。

**验收标准**

- [ ] 不白屏。

### P12.05 — Console capture

**执行步骤**

1. 捕获 generated app console error/warn。
2. secret 脱敏。

**验收标准**

- [ ] P1 JS error 可进入验收失败。

### P12.06 — Network failure handling

**执行步骤**

1. runtime API 不可用时 UI 有错误状态。

**验收标准**

- [ ] 不会无限 loading。

### P12.07 — Design -> Source selection mapping

**执行步骤**

1. 预览选中 `data-mdt-id` 可定位 Designer 元素。

**验收标准**

- [ ] ID mapping 准确。

### P12.08 — Source -> Design mapping

**执行步骤**

1. Codex 修改与某 MDT id 有关联时 UI 可显示影响对象。

**验收标准**

- [ ] build summary 可跳转。

### P12.09 — Screenshot capture

**执行步骤**

1. 按 page/viewport 截图。
2. 保存到 build artifact。

**验收标准**

- [ ] 尺寸 deterministic。

### P12.10 — Visual comparison

**执行步骤**

1. 设计截图 vs generated screenshot 做结构/像素混合比较。
2. 设置合理 tolerance，不能靠巨大 tolerance 过测。

**验收标准**

- [ ] sample projects 通过。

### P12.11 — Responsive preview presets

**执行步骤**

1. Desktop/Tablet/Mobile 预览。
2. 至少验证布局不产生灾难性 overflow。

**验收标准**

- [ ] E2E 3 viewport。

### P12.12 — Preview sandbox

**执行步骤**

1. 预览不拥有 Electron Node integration。
2. 外链/新窗口有安全处理。

**验收标准**

- [ ] security test。

## P13 — 安全模型与权限边界

### P13.01 — Electron security baseline

**执行步骤**

1. contextIsolation=true、nodeIntegration=false。
2. 禁用 remote module。
3. 严格 preload allowlist。

**验收标准**

- [ ] 自动检查配置。

### P13.02 — IPC input validation

**执行步骤**

1. 每个 IPC payload schema validation。
2. 不要信任 renderer。

**验收标准**

- [ ] fuzz/invalid payload test。

### P13.03 — Path traversal protection

**执行步骤**

1. 所有 project/workspace 路径 canonicalize + root check。

**验收标准**

- [ ] `../`、symlink escape 测试。

### P13.04 — Secret redaction

**执行步骤**

1. 统一 log sanitizer。
2. API key/token/common auth header 模式。

**验收标准**

- [ ] 构造 secret 后日志检索不到原值。

### P13.05 — Codex workspace boundary

**执行步骤**

1. Codex cwd + permission/sandbox 限定 generated workspace。
2. 危险权限需要显式用户授权。

**验收标准**

- [ ] 尝试写 `../../outside` 失败。

### P13.06 — Capability permissions

**执行步骤**

1. 运行前检查 manifest permissions 与 project grants。

**验收标准**

- [ ] 未授权 tool call 被 runtime 拒绝。

### P13.07 — SSRF defense

**执行步骤**

1. web_fetch/http/browser 的 URL 解析统一。
2. private IP/metadata 防护。

**验收标准**

- [ ] 测试矩阵全过。

### P13.08 — Command injection defense

**执行步骤**

1. shell/python 参数不通过字符串拼接形成隐式 shell，除非明确执行 shell。

**验收标准**

- [ ] 恶意参数 test。

### P13.09 — XSS defense

**执行步骤**

1. Text/CodeBlock/Agent output 默认纯文本或 sanitizer。

**验收标准**

- [ ] script/img onerror payload 不执行。

### P13.10 — CSP

**执行步骤**

1. MDT renderer 和 generated template 都设置合理 CSP。

**验收标准**

- [ ] 开发/生产分别可用。

### P13.11 — Dependency audit

**执行步骤**

1. npm audit + OSV/Dependabot。
2. 高危依赖无已知可利用问题。

**验收标准**

- [ ] CI 阻断 critical。

### P13.12 — License audit

**执行步骤**

1. 扫描依赖许可证。
2. GPL/AGPL 依赖若进入分发必须明确评估，默认不引入。

**验收标准**

- [ ] THIRD_PARTY_NOTICES 与 lockfile 对得上。

### P13.13 — Generated app permission manifest

**执行步骤**

1. 生成项目包含 `permissions` 文档/配置。

**验收标准**

- [ ] 用户能知道 Agent 可访问什么。

### P13.14 — Security documentation

**执行步骤**

1. SECURITY.md 报告渠道、威胁模型、scope。

**验收标准**

- [ ] 至少记录 renderer/main/Codex/tool runtime 威胁。

## P14 — 自动化测试体系

### P14.01 — Vitest 单测配置

**执行步骤**

1. 统一 coverage。
2. 包级 test script。

**验收标准**

- [ ] 根命令可跑全量。

### P14.02 — Schema tests

**执行步骤**

1. valid/invalid/migration/ref integrity。

**验收标准**

- [ ] 覆盖核心 union branches。

### P14.03 — Project persistence tests

**执行步骤**

1. atomic save/autosave/recovery/assets/path cases。

**验收标准**

- [ ] 无真实用户目录写入。

### P14.04 — Designer reducer/store tests

**执行步骤**

1. selection/history/page CRUD/component。

**验收标准**

- [ ] 关键状态变更可预测。

### P14.05 — Interaction tests

**执行步骤**

1. edge create/edit/delete/lint。

**验收标准**

- [ ] 悬空 ref 被测。

### P14.06 — Capability contract tests

**执行步骤**

1. 所有 built-ins 统一 suite。

**验收标准**

- [ ] 输出 schema 都验证。

### P14.07 — Pi adapter tests

**执行步骤**

1. mock model/tool stream/cancel/error。

**验收标准**

- [ ] 不依赖真实付费 API。

### P14.08 — Codex adapter contract tests

**执行步骤**

1. mock process/events/cancel/exit。

**验收标准**

- [ ] CI 不要求真实账号。

### P14.09 — Generator golden tests

**执行步骤**

1. 固定 Blueprint -> 文件树/hash snapshots。

**验收标准**

- [ ] 意外大 diff 会失败。

### P14.10 — Generated app unit tests

**执行步骤**

1. 模板本身 tests。

**验收标准**

- [ ] 模板发布前全绿。

### P14.11 — Playwright MDT E2E

**执行步骤**

1. 启动 MDT、new project、插入 button、建 page、连 edge、save/reopen。

**验收标准**

- [ ] 无人手操作可跑。

### P14.12 — Designer E2E

**执行步骤**

1. 文本编辑、drag、resize、group、undo、component。

**验收标准**

- [ ] 无 flaky locator。

### P14.13 — Interaction E2E

**执行步骤**

1. React Flow drag connection、edit、delete。

**验收标准**

- [ ] 保存重开一致。

### P14.14 — Capability E2E

**执行步骤**

1. 使用本地 mock HTTP/search site。

**验收标准**

- [ ] 不依赖公网稳定性。

### P14.15 — Build E2E with fake Codex

**执行步骤**

1. 用 deterministic fake agent 模拟 file edits，验证 builder pipeline。

**验收标准**

- [ ] CI 稳定。

### P14.16 — Optional real Codex smoke

**执行步骤**

1. 受 secrets/手动 workflow 控制。
2. 不作为普通 PR 必须。

**验收标准**

- [ ] 能从 sample build。

### P14.17 — Generated app E2E

**执行步骤**

1. build sample -> launch -> browser click -> Pi mock response。

**验收标准**

- [ ] 独立目录执行。

### P14.18 — Visual regression

**执行步骤**

1. 核心 Designer、Interaction、Preview snapshots。
2. 只在明确审查后更新 baseline。

**验收标准**

- [ ] 无随意 `--update-snapshots`。

### P14.19 — Accessibility test

**执行步骤**

1. axe/role checks。

**验收标准**

- [ ] 主流程无 critical a11y。

### P14.20 — Crash/recovery E2E

**执行步骤**

1. 强制杀进程后恢复。

**验收标准**

- [ ] 无 project corruption。

### P14.21 — Large project test

**执行步骤**

1. 100 pages、5000 elements、300 interactions。

**验收标准**

- [ ] 打开、保存、交互画布可用。

### P14.22 — Long-running Agent test

**执行步骤**

1. 模拟 10 分钟 stream、tool calls、cancel。

**验收标准**

- [ ] 内存不持续泄漏。

### P14.23 — Repeated build test

**执行步骤**

1. 同项目连续 20 次 build/update。

**验收标准**

- [ ] 不会累计坏状态。

### P14.24 — Cross-platform path test

**执行步骤**

1. Windows separators、Unicode、spaces、case differences。

**验收标准**

- [ ] 核心 path logic 通过。

### P14.25 — Test flake gate

**执行步骤**

1. 关键 E2E 连跑 10 次。
2. 发现 flaky 必须修。

**验收标准**

- [ ] 10/10 通过后标记稳定。

## P15 — 性能、可靠性与可观测性

### P15.01 — 启动性能预算

**执行步骤**

1. 定义冷启动/暖启动目标并记录。
2. 与 GenOffice Slides baseline 比较。

**验收标准**

- [ ] 不得出现明显数量级退化。

### P15.02 — Designer frame performance

**执行步骤**

1. pointer move 避免全树 render。
2. 用 React profiler 定位。

**验收标准**

- [ ] 典型拖拽流畅。

### P15.03 — Thumbnail cache

**执行步骤**

1. 只更新 dirty pages。

**验收标准**

- [ ] 50-100 页不持续重算全部缩略图。

### P15.04 — Interaction virtualization

**执行步骤**

1. 大量 nodes/edges 优化。

**验收标准**

- [ ] 100/300 测试可交互。

### P15.05 — Autosave backpressure

**执行步骤**

1. 大量连续编辑不会形成写盘队列爆炸。

**验收标准**

- [ ] 磁盘写失败可恢复。

### P15.06 — Codex event backpressure

**执行步骤**

1. 高频 token/tool events batch render。

**验收标准**

- [ ] 1 万事件 UI 不冻结。

### P15.07 — Log rotation

**执行步骤**

1. Build/runtime logs 有大小/数量策略。

**验收标准**

- [ ] 长期使用不无限占盘。

### P15.08 — Process cleanup

**执行步骤**

1. MDT 退出清理 preview/Codex child process。

**验收标准**

- [ ] 自动测试无 orphan。

### P15.09 — Memory leak check

**执行步骤**

1. 重复开关项目/preview/build。

**验收标准**

- [ ] heap 无明显线性增长。

### P15.10 — Error boundary

**执行步骤**

1. Renderer 主要区域有 error boundary。
2. 错误可导出诊断信息。

**验收标准**

- [ ] 单组件失败不必然全应用白屏。

### P15.11 — Diagnostics package

**执行步骤**

1. 一键导出版本、OS、logs、schema version、错误，不含 secret。

**验收标准**

- [ ] 安全审查通过。

### P15.12 — Health status UI

**执行步骤**

1. 显示 Codex、Pi/generated runtime、preview server、capability config 状态。

**验收标准**

- [ ] 状态与实际一致。

## P16 — CI/CD、构建与桌面分发

### P16.01 — GitHub Actions lint/typecheck

**执行步骤**

1. PR 自动跑。

**验收标准**

- [ ] 失败阻断。

### P16.02 — GitHub Actions unit/integration

**执行步骤**

1. 缓存 npm。
2. 使用 lockfile frozen install。

**验收标准**

- [ ] 稳定通过。

### P16.03 — GitHub Actions E2E

**执行步骤**

1. Linux headless 主跑；能覆盖 Electron/renderer 流程。

**验收标准**

- [ ] artifact 保存 screenshot/video on failure。

### P16.04 — Build matrix

**执行步骤**

1. Windows x64、macOS arm64/x64（按 CI 可行性）、Linux x64。

**验收标准**

- [ ] 至少能生成安装/便携 artifacts。

### P16.05 — 版本注入

**执行步骤**

1. package/app/about 显示同一版本 + git SHA。

**验收标准**

- [ ] 无版本漂移。

### P16.06 — Release workflow

**执行步骤**

1. tag `v1.0.0` 触发构建。
2. 生成 checksums。

**验收标准**

- [ ] release artifacts 可验证。

### P16.07 — Unsigned/signed 策略

**执行步骤**

1. 若无证书，明确 1.0 CI 产出 unsigned artifact，并文档说明；不得伪称已签名。

**验收标准**

- [ ] 用户知道平台安全提示原因。

### P16.08 — Auto update 决策

**执行步骤**

1. 1.0 若做必须安全签名与 channel；否则明确不做并移除半成品 updater。

**验收标准**

- [ ] 不存在指向 GenOffice update server 的残留。

### P16.09 — Source archive

**执行步骤**

1. release 同时提供 source tar/zip。

**验收标准**

- [ ] 包含 LICENSE/NOTICE。

### P16.10 — SBOM

**执行步骤**

1. 生成 CycloneDX/SPDX 任一种。

**验收标准**

- [ ] release artifact 附 SBOM。

### P16.11 — Dependency pin

**执行步骤**

1. 关键 direct deps pin/version policy。
2. lockfile 提交。

**验收标准**

- [ ] CI 可复现安装。

### P16.12 — Artifact smoke test

**执行步骤**

1. 从 CI 产物安装/启动/新建项目。

**验收标准**

- [ ] 至少 Windows/Linux 自动或半自动记录。

## P17 — 文档、示例项目与开发者体验

### P17.01 — README 重写

**执行步骤**

1. 一句话定位：像 PowerPoint 一样设计 Agent 应用。
2. GIF/截图、安装、Quick Start、架构、许可证、上游归属。

**验收标准**

- [ ] 新用户可理解。

### P17.02 — User Guide

**执行步骤**

1. New project -> design -> connect -> add capability -> build -> run -> export。

**验收标准**

- [ ] 覆盖完整 happy path。

### P17.03 — Capability Guide

**执行步骤**

1. 如何使用 built-ins、配置 secret、权限。

**验收标准**

- [ ] 每个内置 capability 有说明。

### P17.04 — Create Capability SDK Guide

**执行步骤**

1. 从 manifest 到 runtime adapter 到 test。

**验收标准**

- [ ] 第三方可按文档完成 sample。

### P17.05 — Architecture

**执行步骤**

1. Designer、Schema、Interaction、Codex、Pi、Generator、Preview 数据流。

**验收标准**

- [ ] 图与代码包对应。

### P17.06 — Project Format Spec

**执行步骤**

1. 公开 JSON schema、目录格式、迁移策略。

**验收标准**

- [ ] 第三方工具可解析。

### P17.07 — Generated App Spec

**执行步骤**

1. 说明生成项目职责、mapping、Pi runtime、permissions。

**验收标准**

- [ ] 无 MDT lock-in。

### P17.08 — Security Guide

**执行步骤**

1. secrets、permissions、Codex sandbox、dangerous tools。

**验收标准**

- [ ] 风险写清楚。

### P17.09 — Troubleshooting

**执行步骤**

1. Codex 未安装/未登录、Node、port、provider key、PPT import、preview fail。

**验收标准**

- [ ] 常见故障可自助。

### P17.10 — Sample 1：Research Agent

**执行步骤**

1. 页面：home/chat/results。
2. Agent + web_search + web_fetch。

**验收标准**

- [ ] 一键 build 可跑。

### P17.11 — Sample 2：File Analyst

**执行步骤**

1. file picker + agent + file_read。

**验收标准**

- [ ] 权限清晰。

### P17.12 — Sample 3：Multi-agent

**执行步骤**

1. 两个 Agent，不同 capability。

**验收标准**

- [ ] 证明多 Agent schema。

### P17.13 — Contributor bootstrap

**执行步骤**

1. `npm ci && npm run dev:mdt` 最少步骤。

**验收标准**

- [ ] 干净机器验证。

### P17.14 — API docs

**执行步骤**

1. 公开 packages 的 typedoc 或手写稳定 API。

**验收标准**

- [ ] 不暴露无意内部 API。

## P18 — 1.0 总体验收与冻结

### P18.01 — 全量 clean install

**执行步骤**

1. 删除 node_modules/构建缓存，在干净 clone 执行安装。

**验收标准**

- [ ] 成功。

### P18.02 — 全量 lint/format

**执行步骤**

1. 运行所有检查。

**验收标准**

- [ ] 0 error。

### P18.03 — 全量 typecheck

**执行步骤**

1. root + packages + generated sample。

**验收标准**

- [ ] 0 error。

### P18.04 — 全量 unit/integration

**执行步骤**

1. 开启 coverage。

**验收标准**

- [ ] 全部通过；核心覆盖率达门槛。

### P18.05 — 全量 E2E

**执行步骤**

1. Designer + Interaction + Build(fake) + Generated runtime。

**验收标准**

- [ ] 全部通过。

### P18.06 — 视觉回归

**执行步骤**

1. Windows/Linux/macOS 可行范围内审核。

**验收标准**

- [ ] 无严重布局破损。

### P18.07 — 三个 sample 从零构建

**执行步骤**

1. 不使用旧 generated cache。

**验收标准**

- [ ] 都能启动。

### P18.08 — 真实 Codex 人工验收

**执行步骤**

1. 在有合法登录环境下，用 Codex 实现至少三个设计意图：新增交互、修改业务逻辑、修复测试。

**验收标准**

- [ ] 三次均留下 build log/diff/test。

### P18.09 — 真实 Pi runtime 验收

**执行步骤**

1. 至少一个 provider/model 完成真实流式对话和 tool call。

**验收标准**

- [ ] Pi 是最终 runtime，非 mock。

### P18.10 — web_search/web_fetch 验收

**执行步骤**

1. 配置真实 search provider。
2. 执行 search -> fetch -> answer。

**验收标准**

- [ ] 权限/secret 不泄漏。

### P18.11 — 独立性验收

**执行步骤**

1. 复制 generated project 到仓库外新目录。
2. 完全不启动 MDT。

**验收标准**

- [ ] 安装、build、run、test 全通过。

### P18.12 — 安全复核

**执行步骤**

1. SSRF/path traversal/XSS/secret/shell/Codex boundary。

**验收标准**

- [ ] 无 P0/P1。

### P18.13 — 性能复核

**执行步骤**

1. 大型项目、重复 build、长 stream。

**验收标准**

- [ ] 无 blocker。

### P18.14 — 许可证复核

**执行步骤**

1. LICENSE/NOTICE/third-party/SBOM。

**验收标准**

- [ ] 无遗漏。

### P18.15 — Git 仓库复核

**执行步骤**

1. 确认 origin=metis-development-tool。
2. 确认没有向 GenOffice push/PR。
3. 工作树 clean。

**验收标准**

- [ ] 证据写入 release checklist。

### P18.16 — Issue triage

**执行步骤**

1. 所有已知问题分 P0/P1/P2/P3。
2. P0/P1 必须为 0。
3. P2 必须有 workaround 或明确不影响主流程。

**验收标准**

- [ ] release issue list 可审计。

### P18.17 — 冻结 schema

**执行步骤**

1. 1.0 schemaVersion 定稿。
2. 写 migration policy。

**验收标准**

- [ ] 后续 breaking change 必须版本迁移。

### P18.18 — 版本号 1.0.0

**执行步骤**

1. 所有 package/app/version 同步。
2. CHANGELOG 完成。

**验收标准**

- [ ] About/CLI/package 对得上。

### P18.19 — 生成 RC

**执行步骤**

1. 构建 `v1.0.0-rc.1`，做最终 smoke。

**验收标准**

- [ ] RC 验收通过。

### P18.20 — 发布 v1.0.0 tag

**执行步骤**

1. 只有全部质量门绿后打 tag。
2. 生成 release notes/artifacts/checksums/SBOM。

**验收标准**

- [ ] GitHub public release 可下载。

---

# 4. 强制质量门（Definition of Done）

任何“完成 MDT 1.0”的声明必须同时满足以下全部条件。

## 4.1 仓库与法律

- GitHub 仓库为 `metis-development-tool` 且 PUBLIC。
- `origin` 指向 MDT 自己的仓库。
- `genoffice-upstream` 只能 fetch，误 push 被阻止。
- 没有向 GenOffice 创建 PR。
- Apache-2.0 LICENSE、NOTICE、THIRD_PARTY_NOTICES 完整。
- GenOffice baseline commit SHA 已记录。
- 所有第三方依赖许可证经过扫描。

## 4.2 产品主流程

以下流程必须由一个第一次使用 MDT、只懂 PowerPoint 基本操作的人完成，不要求修改 JSON/代码：

1. 新建 MDT 项目。
2. 新建 Home Page。
3. 插入标题、输入框、按钮。
4. 新建 Results Page。
5. 新建 Modal。
6. 切到 Interactions。
7. 将按钮连接到 Modal 或 Page。
8. 新建 Agent。
9. 给 Agent 加 `web_search` 和 `web_fetch`。
10. 将 Input/Button 与 Agent 建立发送关系。
11. 将 Agent 输出绑定到 Chat/Text/List。
12. 保存。
13. 关闭 MDT。
14. 重新打开项目。
15. 所有设计、连线、Agent、Capability 均保留。
16. 点击 Build。
17. Codex 在隔离工作区实现代码。
18. 自动 typecheck/test/E2E。
19. 启动真实 Preview。
20. 用户实际输入问题。
21. Pi Runtime 调用对应 capability。
22. UI 展示结果。
23. 导出/打开生成源码。
24. 将源码复制到另一目录。
25. 不打开 MDT，独立安装和运行成功。

任一步失败，MDT 1.0 不得宣称完成。

## 4.3 Designer

- PowerPoint 风格 Ribbon、左侧缩略图、中央画布、右侧属性面板整体一致。
- 文本、形状、图片、UI 控件均可编辑。
- 多选、组合、对齐、层级、锁定、复制粘贴、Undo/Redo 工作。
- 中文 IME 工作。
- 页面类型工作。
- Component 工作。
- 50 页项目可用。
- 100 页压力项目不崩溃。

## 4.4 Interaction Canvas

- 节点自动来自项目真实对象。
- 缩略图正确。
- ID 稳定。
- 连线可创建、编辑、删除、保存、恢复。
- Navigate/Modal/Drawer/Agent/Capability 核心动作可执行。
- 无悬空引用。
- 100 nodes + 300 edges 可用。

## 4.5 Codex

- Codex 与 Pi 职责完全分开。
- Codex 未安装/未登录时有明确状态。
- Codex 仅写允许 workspace。
- 构建可 cancel。
- build log 可审计。
- diff 可看。
- build 可 rollback。
- 失败能进入 repair loop。
- 通过质量门后才成为 last-known-good。
- Generated app 默认不含 Codex runtime。

## 4.6 Pi

- Generated Agent 的 agent loop 来自官方 Pi Agent Core。
- Tool 注册来自 Capability Registry。
- 可流式返回。
- 可 tool call。
- 可 cancel。
- 可处理 tool error。
- 最终项目独立运行。

## 4.7 Capability

至少以下能力达到 production-quality contract：

- web_search
- web_fetch
- http_request
- browser
- file_read
- file_write
- file_list
- shell（默认关闭）
- python（受限）
- MCP
- datetime
- json
- ask_user

高风险 capability 必须有权限控制。

## 4.8 安全

必须通过：

- path traversal
- symlink escape
- XSS
- SSRF
- cloud metadata endpoint
- secret in project
- secret in logs
- shell injection
- unrestricted Codex write
- unsafe Electron Node integration

任一 P0/P1 安全问题存在，禁止 1.0。

## 4.9 自动测试

最终 CI：

- format: PASS
- lint: PASS
- typecheck: PASS
- unit: PASS
- integration: PASS
- E2E: PASS
- visual regression: PASS
- generated sample tests: PASS
- package build: PASS
- license/security checks: PASS

核心包覆盖率：

- `mdt-schema` >= 90% lines
- `mdt-project` >= 85%
- `mdt-interactions` >= 85%
- `mdt-capabilities` >= 85%
- `mdt-generator` >= 85%
- `mdt-codex` >= 80%
- `mdt-pi-runtime` >= 80%

不得为了覆盖率写无断言测试。

---

# 5. 三个强制端到端验收样例

## Sample A — Web Research Agent

设计：

- Home：Search Input + Search Button。
- Results：List + Detail Text。
- Agent：Research Agent。
- Tools：web_search + web_fetch。
- Interaction：Search Button -> Agent；Agent 可调用 search/fetch；输出 -> Results。

验收：

- 输入一个真实查询。
- Agent 调用 web_search。
- 选结果并 web_fetch。
- 最终结果显示。
- 工具调用在 runtime log 中可见。
- 无 key 泄漏。

## Sample B — Local File Analyst

设计：

- Home：FilePicker + Chat。
- Agent：File Analyst。
- Tool：file_read。
- 文件只允许项目允许目录。

验收：

- 选择文本文件。
- Agent 读取并总结。
- 尝试读取 workspace 外路径时被拒绝。

## Sample C — Multi-agent Workflow

设计：

- Planner Agent：无高风险 tool。
- Research Agent：web_search/web_fetch。
- UI：Chat + Research Results。
- Planner 可将明确任务发送给 Research Agent（通过 MDT 1.0 支持的 Agent interaction 方式实现）。

验收：

- 两个 Agent 配置独立。
- Tool assignment 不串。
- UI 能区分不同运行事件。
- 保存/重开后保持。

---

# 6. 禁止的“伪完成”行为

以下任意情况出现，都视为任务未完成：

- 用静态 HTML 截图冒充 Designer。
- 用 mock navigation 冒充真实生成应用。
- Web Search 只显示预置数组。
- Web Fetch 返回 hard-coded sample。
- Pi runtime 实际没使用，只写了一个名字叫 Pi 的 wrapper。
- Codex 实际没接，只调用普通 LLM 让它返回代码字符串。
- Build 按钮只生成 prompt 不修改代码。
- Preview 显示的是设计器，不是真实 generated app。
- Interaction Canvas 的 edge 只画线不进入 Blueprint。
- 元素 ID 靠名字匹配。
- 项目保存不包含 Agent/Capability/Interaction。
- generated app 需要 MDT 进程才能启动。
- 关闭测试、降低断言、删除失败 case 来过验收。
- 暂时跳过 Windows/macOS/Linux 构建问题却标记 1.0 完成。
- 删除 GenOffice attribution。
- 向 GenOffice push 分支或创建 PR。

---

# 7. 最终交付清单

完成时仓库至少必须包含：

- 完整 MDT 1.0 源码。
- Public GitHub repository。
- Apache-2.0 LICENSE。
- NOTICE。
- THIRD_PARTY_NOTICES。
- README。
- ARCHITECTURE。
- SECURITY。
- CONTRIBUTING。
- CHANGELOG。
- ROADMAP。
- ADR。
- Project Format Spec。
- Capability SDK 文档。
- 3 个 sample projects。
- 自动化测试。
- GitHub Actions。
- Windows/macOS/Linux 构建配置。
- Release workflow。
- SBOM。
- v1.0.0 release candidate 验收记录。
- `TASK_STATUS.md` 全部任务状态。
- `RELEASE_CHECKLIST.md`。
- `MDT_1.0_ACCEPTANCE_REPORT.md`，逐项记录所有质量门的命令、结果、截图/日志路径和遗留问题。

---

# 8. 主 Agent 最终必须输出的完成报告格式

不得只回复“完成”。

必须报告：

```text
1. Repository
   - URL
   - visibility
   - branch
   - commit SHA
   - release/tag

2. Upstream
   - GenOffice baseline SHA
   - Pi version
   - Codex version
   - React Flow version

3. Implemented
   - Designer
   - Interaction Canvas
   - Agent
   - Capabilities
   - Codex Builder
   - Pi Runtime
   - Generator
   - Preview
   - Project persistence

4. Test results
   - format
   - lint
   - typecheck
   - unit
   - integration
   - E2E
   - visual
   - security
   - package
   - coverage

5. Sample acceptance
   - Research Agent
   - File Analyst
   - Multi-agent

6. Known issues
   - P0
   - P1
   - P2
   - P3

7. Independent generated-app verification
   - copied path
   - install command
   - test command
   - run command
   - result

8. License and security audit
   - LICENSE
   - NOTICE
   - SBOM
   - dependency audit

9. Final judgment
   - PASS / FAIL
   - if FAIL, list every blocking item
```

只有 `P0=0`、`P1=0` 且全部强制质量门通过时，最终判断才允许写 `PASS`。
