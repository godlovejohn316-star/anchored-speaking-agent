# Anchored Speaking Agent

基于“锚定文本互动法”的个性化少儿英语口语练习网页。孩子选择一段文本和一个 AI 外教角色后，可以围绕该文本进行实时语音对话，并在结束后得到复盘报告。

## 功能

- 锚定文本：对话始终围绕给定内容、关键词和目标句型展开。
- 角色外教：内置温柔老师、故事角色、面试官三种风格。
- 实时语音：浏览器通过 WebRTC 连接 OpenAI Realtime API。
- 实时记录：前端展示转写和事件状态。
- 练习报告：后端基于对话记录生成改进建议。
- Render 友好：包含 `render.yaml`，可直接连接 GitHub 部署。

## 本地运行

1. 复制环境变量：

```bash
copy .env.example .env
```

2. 在 `.env` 中填写：

```bash
OPENAI_API_KEY=sk-...
```

3. 启动：

```bash
npm.cmd start
```

4. 打开：

```text
http://localhost:4174
```

PowerShell 如果禁止 `npm.ps1`，请使用 `npm.cmd`。

## GitHub + Render 部署

1. 新建 GitHub 仓库，把本目录推上去。
2. 登录 Render，选择 New Web Service。
3. 连接该 GitHub 仓库。
4. Render 会读取 `render.yaml`。
5. 在 Render 环境变量中填入 `OPENAI_API_KEY`。
6. 部署后访问 Render 分配的 URL。

## 重要安全提醒

- 不要把 `OPENAI_API_KEY` 放进前端代码。
- 面向儿童使用时，建议只开放老师审核过的文本和角色。
- 默认不保存原始音频，只保存必要的文字记录和报告。
- 上线前应增加账号体系、家长/教师管理、内容审核和成本限额。
