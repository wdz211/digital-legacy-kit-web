# Digital Legacy Kit — 网页版完整设计文档

> 版本：v1.1
> 日期：2026-04-10
> 状态：设计阶段，待实现
>
> 更新记录（v1.1）：
> - 移除 user_api_keys 表，API Key 改为 client-side 存储
> - 移除 import_jobs 表，导入改为同步处理
> - chat_data 不再存储 raw_messages
> - 文件大小限制 50MB → 100MB
> - 新增导入去重检查
> - 补充移动端 viewport 配置要求
> - 明确 API 成本由用户自担
> - SSE 增加超时告警机制

---

## 一、项目概述

### 1.1 核心价值

数字克隆体平台：用户通过微信导出的聊天记录，自动提取人物特征，创建一个"数字分身"，与其对话。

### 1.2 用户操作流程

```
Step 1.  Windows 微信            Step 2.  网页平台
┌─────────────────────┐          ┌────────────────────────────────┐
│  WeChatExporter.exe │          │  上传 .xlsx 聊天记录导出文件    │
│  选择联系人导出      │   ──→    │                                │
│  生成 chat_xxx.xlsx  │          │  LLM 自动分析：                │
└─────────────────────┘          │  · 提取语言风格               │
                                  │  · 提取性格特征               │
                                  │  · 提取口头禅/常用词           │
                                  │  · 生成人物描述                │
                                  └──────────────┬─────────────────┘
                                                 │
                                                 ▼
                                  ┌────────────────────────────────┐
                                  │  创建克隆体                    │
                                  │  · 可编辑名称/描述              │
                                  │  · 确认人设特征                │
                                  └──────────────┬─────────────────┘
                                                 │
                                                 ▼
                                  ┌────────────────────────────────┐
                                  │  与克隆体对话                  │
                                  │  · 流式输出                     │
                                  │  · 历史记录回看                 │
                                  │  · 支持 OpenAI/Claude/通义       │
                                  └────────────────────────────────┘
```

### 1.3 约束与限制

- 微信数据提取必须通过 Windows 工具（WeChatExporter.exe），不纳入网页平台
- 克隆体对话使用外部付费 API（OpenAI / Claude / 阿里通义），**API 费用由用户自行承担**
- 网页平台仅负责：文件解析、人设提取、对话存储、对话界面
- 不需要微信账号绑定、扫码登录

### 1.4 移动端说明

H5 应用，需确保在手机上显示正常：
- viewport 配置：`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`
- 触控事件优化（Ant Design Mobile 已处理）
- 输入框在移动端弹出软键盘时不压缩布局

---

## 二、技术栈

### 2.1 后端

| 组件 | 技术 | 备注 |
|------|------|------|
| Web 框架 | FastAPI | 复用现有 server.py 认证层 |
| 数据库 | SQLite | 复用现有 digital_legacy.db |
| 认证 | JWT | 复用现有 auth 接口 |
| 文件解析 | openpyxl | 解析微信导出的 xlsx |
| LLM 调用 | httpx + asyncio | 调用 OpenAI/Claude/DashScope API |
| 流式输出 | Server-Sent Events (SSE) | POST /api/v1/chat/stream |
| 部署 | Uvicorn + PM2 | |

**新增依赖**：
```
fastapi>=0.110
uvicorn[standard]>=0.27
openpyxl>=3.1
httpx>=0.27
python-multipart>=0.0.9
sse-starlette>=1.8
```

### 2.2 前端

| 组件 | 技术 | 备注 |
|------|------|------|
| 框架 | React 18 + Vite | 全新项目，非 RN 迁移 |
| UI 库 | Ant Design Mobile 5 | 移动优先，触控友好 |
| 状态管理 | Zustand | 轻量，与 RN 的 zustand 用法一致 |
| 路由 | React Router v6 | |
| API Key 存储 | localStorage | 用户自备 API Key，仅存在浏览器端 |
| HTTP 客户端 | fetch (原生) | |

**技术决策：不复用 React Native 代码**
原因：RN 的导航、组件写法与 React Web 差异大。重写比迁移更高效，但参考 RN 的 store 写法。

### 2.3 部署架构

```
                    用户浏览器
                         │
                         ▼ HTTPS
                   ┌──────────────┐
                   │  Nginx (443)│
                   │  反向代理     │
                   └──────┬───────┘
                          │  HTTP
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       ┌────────────┐          ┌────────────┐
       │ FastAPI    │          │ React Build│
       │ :8080      │          │ 静态文件   │
       │ (uvicorn)  │          │ /dist      │
       └────────────┘          └────────────┘
              │
              ▼
       ┌────────────┐
       │  SQLite    │
       └────────────┘
```

---

## 三、数据库设计

### 3.1 现有表（扩展）

#### personas 表（扩展字段）

```sql
ALTER TABLE personas ADD COLUMN chat_data TEXT;
ALTER TABLE personas ADD COLUMN extracted_persona TEXT;  -- JSON，独立字段方便查询
```

`chat_data` 存储格式（JSON）：
```json
{
  "source": "xlsx",
  "contact_name": "张三",
  "imported_at": "2026-04-10T...",
  "message_count": 1523
}
```

`extracted_persona` 存储格式（JSON）：
```json
{
  "name": "张三",
  "description": "...",
  "language_style": "...",
  "personality_traits": ["外向", "热情"],
  "common_phrases": ["哈哈哈", "可以的"],
  "topics": ["旅行", "摄影"]
}
```

**设计变更（v1.1）**：不存储 raw_messages，减少数据库体积，避免隐私风险。

### 3.2 新增表

#### import_records（导入记录，仅用于去重）

```sql
CREATE TABLE import_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_hash TEXT NOT NULL,        -- SHA256(file_content)，用于去重
    file_name TEXT,
    contact_name TEXT,
    message_count INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, file_hash)     -- 同一用户不能重复上传相同文件
);
```

**用途**：检测重复导入，同一用户的相同文件只允许导入一次。

---

## 四、API 设计

### 4.1 认证接口（现有，修改 CORS）

```
POST /api/v1/auth/send_code
  Body: { phone: string }
  Response: { success: true, code: string }  // DEBUG 模式返回 code

POST /api/v1/auth/login
  Body: { phone: string, code: string }
  Response: { token: string, user_id: number }

POST /api/v1/auth/login_password
  Body: { phone: string, password: string }
  Response: { token: string, user_id: number }

POST /api/v1/auth/register_password
  Body: { phone: string, password: string }
  Response: { token: string, user_id: number }
```

### 4.2 克隆体接口

```
GET  /api/v1/personas
  Response: { personas: Persona[] }

GET  /api/v1/personas/:persona_id
  Response: Persona & { extracted_persona: object }

POST /api/v1/personas
  Body: {
    name: string,
    description?: string,
    extracted_persona?: object   // LLM 提取结果
  }
  Response: Persona

PATCH /api/v1/personas/:persona_id
  Body: {
    name?: string,
    description?: string,
    extracted_persona?: object
  }
  Response: Persona

DELETE /api/v1/personas/:persona_id
  Response: { success: true }
```

### 4.3 导入接口（同步，v1.1）

```
POST /api/v1/import
  Body: multipart/form-data
    file: .xlsx 文件（最大 100MB）
    api_type: 'openai' | 'claude' | 'dashscope'
    api_key: string          // 前端 localStorage 读取后传入
    model: string            // e.g. 'gpt-4o-mini'
  Timeout: 180s
  Response: {
    success: true,
    job_id: string,          // 用于轮询状态
    preview: {               // 同步返回预览（消息少时）
      contact_name: string,
      message_count: number,
      extracted_persona: object
    }
  }
  Errors:
    400: "文件格式不对，请上传微信导出的xlsx"
    400: "聊天记录太少（{n}条），至少需要10条"
    400: "该文件已导入过，请勿重复上传"
    502: "LLM API 调用失败：{detail}"
```

```
GET  /api/v1/import/:job_id/status
  Response: {
    job_id: string,
    status: 'done' | 'processing' | 'failed',
    preview?: {
      contact_name: string,
      message_count: number,
      extracted_persona: object
    },
    error?: string
  }
```

**说明**：Phase 1 先做同步（超时 180s），等遇到真实大文件问题再迁移到后台任务队列。

### 4.4 对话接口

```
POST /api/v1/chat
  Body: {
    persona_id: string,
    user_input: string,
    api_type: 'openai' | 'claude' | 'dashscope',
    api_key: string,
    model: string
  }
  Response: { reply: string }

POST /api/v1/chat/stream  (SSE)
  Body: same as /chat
  Response: text/event-stream
    event: message
    data: {"content": "片段内容"}
    event: done
    data: {"finish_reason": "stop", "total_tokens": 123}
    event: error
    data: {"error": "API 调用失败"}

GET  /api/v1/chat/history/:persona_id
  Query: limit=50, before_id?: number
  Response: { messages: Message[] }

DELETE /api/v1/chat/history/:persona_id
  Response: { success: true }
```

**SSE 补充说明**：
- 每个片段 20-50 tokens，避免打字机效果太慢
- 连接超时 30s，超时后发送 `event: timeout` 断开
- 前端心跳：若 25s 无数据，提示"连接不稳定"

---

## 五、功能规格

### 5.1 导入流程

**Step 1：上传**

- 支持：`.xlsx`（微信导出格式）
- 大小限制：100MB
- 前端：选择文件后立即上传，不做预解析
- 请求体：`multipart/form-data`，超时 180s

**Step 2：后端解析 pipeline**

```
xlsx 解析（openpyxl）
    │
    ▼
消息清洗：
  · 跳过系统消息（"以上是聊天记录"等）
  · 跳过图片/语音/表情包描述
  · 跳过空消息
  · 合并多行消息
    │
    ▼
消息统计：
  · 提取 contact_name（列 speaker=对方的名字）
  · 计数总消息条数
  · 判断消息是否足够（≥10条）
    │
    ▼
文件去重：
  · 计算 file_hash（SHA256）
  · 查询 import_records，冲突则报错 400
    │
    ▼
[LLM 调用] 提取人物特征
  · 输入：前 500 条消息（控制 token 成本）
  · Prompt：见附录 A
  · 模型：用户指定
  · 超时：120s
  · 失败：重试 1 次，仍失败则返回错误，允许用户跳过提取
    │
    ▼
写入 import_records
    │
    ▼
返回 preview 给前端
```

**Step 3：预览确认**

- 显示提取结果（可编辑）
- 用户填写：名称（默认用 contact_name）、描述
- 选择对话模型

**Step 4：创建克隆体**

- POST /api/v1/personas
- 跳转对话页

### 5.2 对话功能

**流式对话**：

- 前端通过 `EventSource` + `fetch`（SSE 不支持 POST，需用 `fetch` + `ReadableStream`）
- AI 回复逐字显示（打字机效果）
- 消息气泡：左侧 AI，右侧 用户
- 每条消息显示时间（相对时间：刚刚/5分钟前/昨天）

**历史记录**：

- 进入页面时加载最近 50 条
- 滚动加载更多（分页）
- 清空对话（确认弹窗）

**SSE 断开处理**：

| 断开原因 | 前端行为 |
|---------|---------|
| 完成（`event: done`） | 正常显示完成 |
| 超时（25s 无数据） | 显示"连接超时，正在重连" + 自动重连 1 次 |
| 错误（`event: error`） | 显示错误信息，保留用户输入 |
| 网络断线 | 显示"网络断开"，恢复后自动重连 |

### 5.3 API Key 管理（无服务端存储）

**设计决策（v1.1）**：不在服务端存储 API Key，用户在浏览器端管理。

优点：
- 无需加密/解密逻辑
- 用户可随时 revoke
- 平台无安全责任

缺点：
- 每次对话需传入 api_key（请求体携带）
- 换个浏览器需重新输入

前端实现：
```typescript
// 存储结构（localStorage）
{
  "dlk_api_keys": {
    "openai": { key: "sk-...", model: "gpt-4o-mini" },
    "claude": { key: "sk-ant-...", model: "claude-haiku-20250729" },
    "dashscope": { key: "sk-...", model: "qwen-turbo" }
  },
  "dlk_default_key": "openai"
}
```

**密钥保护**：提醒用户不要在公共场所的浏览器保存 Key。

### 5.4 克隆体管理

- 卡片列表：头像/名称/消息数/创建时间
- 支持重命名、编辑描述
- 支持导出为 JSON（extracted_persona）
- 支持删除（二次确认）

---

## 六、页面规格

### 6.1 页面清单

| 页面 | 路由 | 访问控制 |
|------|------|---------|
| 登录/注册 | `/auth` | 公开 |
| 克隆体列表 | `/` | 需登录 |
| 导入页 | `/import` | 需登录 |
| 导入确认 | `/import/:job_id` | 需登录 |
| 创建克隆体（手动） | `/personas/new` | 需登录 |
| 对话页 | `/chat/:persona_id` | 需登录 |
| 设置 | `/settings` | 需登录 |

### 6.2 页面详细设计

#### AuthPage `/auth`

```
┌─────────────────────────────────┐
│          [logo]                  │
│     Digital Legacy Kit          │
│                                 │
│  ┌─────────────────────────┐   │
│  │  手机号                 │   │
│  └─────────────────────────┘   │
│  ┌───────────┐ ┌───────────┐   │
│  │  验证码   │ │ 获取验证码 │   │
│  └───────────┘ └───────────┘   │
│  ┌─────────────────────────┐   │
│  │  登录                   │   │
│  └─────────────────────────┘   │
│                                 │
│  [密码登录]                     │
└─────────────────────────────────┘
```

- 手机号 + 验证码登录
- 验证码 10 分钟有效
- 密码登录作为备用入口

#### HomePage `/`

```
┌─────────────────────────────────┐
│  ≡  我的克隆体            [⚙]  │
├─────────────────────────────────┤
│                                 │
│  ┌───────┐  ┌───────┐         │
│  │   张  │  │   李  │         │
│  │ 张三  │  │ 李四  │         │
│  │1523条│  │  892条│         │
│  └───────┘  └───────┘         │
│                                 │
│                          [+]   │
│                                 │
└─────────────────────────────────┘
```

- 2 列网格卡片
- 头像为名字首字圆形
- 空状态引导上传
- 右下角 FAB 新建

#### ImportPage `/import`

```
┌─────────────────────────────────┐
│  ←  创建克隆体                  │
├─────────────────────────────────┤
│                                 │
│     ┌─────────────────────┐     │
│     │   [上传图标]         │     │
│     │  点击或拖拽上传      │     │
│     │  微信导出 xlsx 文件   │     │
│     └─────────────────────┘     │
│                                 │
│  支持 WeChatExporter 导出的      │
│  .xlsx 文件（最大 100MB）        │
│                                 │
└─────────────────────────────────┘
```

- 拖拽 + 点击上传
- 上传后进入 Loading 状态（解析 + LLM 提取）
- 提取完成自动跳转确认页

#### ImportConfirmPage `/import/:job_id`

```
┌─────────────────────────────────┐
│  ←  确认克隆体信息              │
├─────────────────────────────────┤
│                                 │
│  名称  [张三              ]     │
│  简介  [textarea           ]     │
│                                 │
│  ─── LLM 提取结果 ───           │
│  语言风格: 轻松幽默             │
│  性格: [外向] [热情]           │
│  口头禅: "哈哈哈""可以的"       │
│  话题: 旅行/摄影/美食          │
│  消息数: 1,523 条              │
│                                 │
│  ─── 对话模型 ───              │
│  API: [▼ 选择] [手动输入Key]   │
│  模型: [gpt-4o-mini     ▼]    │
│                                 │
│  [确认创建克隆体]               │
│                                 │
└─────────────────────────────────┘
```

- 预填 LLM 提取结果，全部可编辑
- API Key 下拉选择（localStorage 中的 Key）
- 临时输入 Key 也可
- 模型下拉联动 API 类型

#### ChatPage `/chat/:persona_id`

```
┌─────────────────────────────────┐
│  ← 张三                    [⋮]  │
│     GPT-4o-mini                 │
├─────────────────────────────────┤
│                                 │
│  [张三]: 你好，我是数字克隆体...│
│                                 │
│         [我]: 最近怎么样？       │
│                                 │
│  [张三]: 挺好的！最近天气不错   │
│  ▊                            │
│                                 │
├─────────────────────────────────┤
│  [输入框...            ] [发送] │
└─────────────────────────────────┘
```

- 顶部：克隆体名称 + 模型标签
- 更多菜单：编辑信息 / 导出 / 删除
- 流式气泡 + 打字机效果
- 空状态："发送消息开始对话"
- API Key 未配置：顶部引导条，点击跳转设置

#### SettingsPage `/settings`

```
┌─────────────────────────────────┐
│  ←  设置                      │
├─────────────────────────────────┤
│                                 │
│  账号                          │
│  ├─ 199****863  [修改密码]    │
│                                 │
│  API Keys（浏览器端管理）      │
│  ├─ OpenAI: sk-***...mini    │
│  ├─ Claude: sk-***...iku     │
│  └─ [+ 添加]                  │
│                                 │
│  使用帮助                      │
│  └─ [查看教程]                │
│                                 │
│  版本 v1.0.0                   │
│                                 │
└─────────────────────────────────┘
```

---

## 七、LLM Prompt（附录 A）

### 7.1 Persona 提取 Prompt

```
SYSTEM:
你是一个聊天记录分析专家。从给定的微信聊天记录中提取人物特征。
分析消息的语言风格、性格、常用表达和话题偏好。
只输出 JSON，不要包含其他文字。格式如下：
{
  "name": "人物称呼",
  "description": "50字以内人物简介",
  "language_style": "30字以内语言风格",
  "personality_traits": ["trait1", "trait2", "trait3"],
  "common_phrases": ["口头禅1", "口头禅2"],
  "topics": ["话题1", "话题2", "话题3"]
}
注意：所有字段必填，traits 3-5个，topics 2-4个。

USER:
以下是微信聊天记录（共 {count} 条）：

{messages}

请提取这个人物的特征信息。
```

### 7.2 对话 System Prompt 模板

```
你是一个名为「{persona_name}」的数字克隆体，基于该人物的微信聊天记录训练而成。
你的任务是延续这个角色的性格、语气、表达习惯，与用户进行自然的对话。

人物简介：{description}
语言风格：{language_style}
性格特征：{personality_traits}
常用口头禅：{common_phrases}
话题偏好：{topics}

请以「{persona_name}」的身份，用符合上述特征的方式回复。
如果用户的问题你不确定，可以诚实回答，但保持角色一致性。
```

---

## 八、实施计划

### Phase 1：后端 + 最小前端（第1-2周）

**Day 1-2：数据库 + 导入接口**
- 新增 import_records 表
- POST /api/v1/import（同步，xlsx 解析 + LLM 提取）
- GET /api/v1/import/:job_id/status
- 扩展 personas 表字段
- 后端单元测试（xlsx 解析 + 提取质量）

**Day 3-4：对话接口 + Persona CRUD**
- POST /api/v1/chat（非流式）
- POST /api/v1/chat/stream（SSE）
- GET /api/v1/chat/history/:persona_id
- CRUD /api/v1/personas
- FastAPI 路由分模块

**Day 5-6：前端基础架构**
- React + Vite 初始化
- Ant Design Mobile 主题
- 路由 + Layout 组件
- Zustand store 骨架

**Day 7-8：Auth + Home**
- AuthPage（登录/注册）
- HomePage（克隆体卡片列表）
- API client 封装（fetch + JWT 拦截）

**Day 9-10：Import + Confirm**
- ImportPage（文件上传 + loading）
- ImportConfirmPage（预览 + 表单）
- 调用后端导入接口

**Day 11-12：Chat 核心**
- ChatPage（消息气泡 + 流式输出）
- SSE 读取（fetch + ReadableStream）
- 历史记录加载

**Day 13-14：Settings + 打磨**
- SettingsPage
- API Key 管理（localStorage）
- 响应式 + 移动端适配
- 错误提示体系

### Phase 2：上线准备（第3周）

- 部署文档（nginx + PM2）
- 正式环境变量配置
- 域名 + HTTPS
- 压力测试（并发导入 + 并发对话）
- 修复发现的问题

### Phase 3（可选）：异步导入

仅在 Phase 1 上线后遇到以下问题时启动：
- 某些大文件（>30MB xlsx）超时
- 并发导入量增加，后端压力大

迁移方案：
- 引入后台任务（threading 或 Celery）
- import_jobs 表替换同步逻辑
- 前端轮询 /import/:job_id/status

---

## 九、里程碑

| 里程碑 | 完成标志 | 预期 |
|--------|---------|------|
| M1: 导入 pipeline | xlsx → LLM 提取 → JSON 返回，命令行验证通过 | Day 2 |
| M2: 对话 API | /chat/stream 返回 SSE 流式输出，postman 验证通过 | Day 4 |
| M3: 前端最小可用 | Auth + Home + Import + Chat 全链路跑通 | Day 12 |
| M4: 内部测试版 | 部署测试服务器，2 人对练 3 个克隆体 | Day 16 |
| M5: 正式上线 | 域名 + HTTPS + 真实用户测试 | Day 20+ |

---

## 十、已知风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| LLM persona 提取质量差 | 中 | 高 | Phase 1 先用 3 个真实文件验证 prompt |
| 大文件 xlsx 超时（>30MB） | 低 | 中 | Phase 1 先同步，Phase 2 按需改异步 |
| SSE 移动网络断开 | 中 | 中 | 心跳检测 + 自动重连 |
| API Key 泄露（客户端存储） | 低 | 高 | localStorage 用户自管，明确告知保护责任 |
| 重复导入同一文件 | 低 | 低 | import_records 去重，报错提示 |
| 微信 xlsx 格式变动 | 低 | 高 | 解析失败返回明确错误，不做静默跳过 |
