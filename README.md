# Digital Legacy Kit Web — 项目结构

```
digital-legacy-kit-web/
│
├── SPEC.md                        # 完整设计文档（v1.1）
│
├── backend/                       # 后端（FastAPI）
│   ├── server.py                  # 主入口
│   ├── requirements.txt            # Python 依赖
│   │
│   ├── routers/                   # 路由模块
│   │   ├── __init__.py
│   │   ├── auth.py               # 认证
│   │   ├── personas.py           # 克隆体 CRUD
│   │   ├── import_.py            # 导入 pipeline
│   │   └── chat.py               # 对话 + SSE
│   │
│   ├── services/                  # 业务逻辑
│   │   ├── __init__.py
│   │   ├── xlsx_parser.py        # xlsx 解析
│   │   ├── persona_extractor.py  # LLM 人设提取
│   │   └── llm_caller.py         # OpenAI/Claude/DashScope 调用
│   │
│   ├── models/                    # Pydantic 模型
│   │   ├── __init__.py
│   │   ├── persona.py
│   │   └── chat.py
│   │
│   └── db/
│       ├── __init__.py
│       └── schema.sql             # 表结构 DDL
│
├── frontend/                      # 前端（React + Vite）
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html                  # 移动端 viewport 配置
│   │
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx
│   │   │   ├── HomePage.tsx
│   │   │   ├── ImportPage.tsx
│   │   │   ├── ImportConfirmPage.tsx
│   │   │   ├── ChatPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── PersonaCard.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── FileUploader.tsx
│   │   │
│   │   ├── stores/
│   │   │   ├── authStore.ts
│   │   │   ├── personaStore.ts
│   │   │   └── chatStore.ts
│   │   │
│   │   ├── api/
│   │   │   ├── client.ts          # fetch 封装 + JWT 拦截器
│   │   │   ├── auth.ts
│   │   │   ├── personas.ts
│   │   │   ├── import_.ts
│   │   │   └── chat.ts
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   └── useSSE.ts          # SSE 流式读取（fetch + ReadableStream）
│   │   │
│   │   └── utils/
│   │       ├── storage.ts          # localStorage API Key 管理
│   │       └── format.ts
│   │
│   └── public/
│       └── favicon.svg
│
└── deploy/
    ├── nginx.conf
    └── pm2.config.js
```

---

## 快速开始（实现后）

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8080

# 前端
cd frontend
npm install
npm run dev
```

---

## 环境变量

```bash
# backend/.env
JWT_SECRET=your_jwt_secret_here
DATABASE_PATH=./data/digital_legacy.db
```

```js
// frontend/.env (可选)
VITE_API_BASE=http://localhost:8080
```
