# Anchored Speaking Agent

基于“锚定文本互动法”的个性化少儿英语口语练习网页。孩子选择一段文本和一个 AI 外教角色后，可以围绕该文本进行互动练习，并在结束后得到复盘报告。

## 功能

- 锚定文本：对话始终围绕给定内容、关键词和目标句型展开。
- 角色外教：内置温柔老师、故事角色、面试官三种风格。
- 双模式：可使用 OpenAI Realtime 兼容中转做实时语音，也可回退到阿里云百炼/通义千问文字模式。
- 外教朗读：浏览器使用内置 speechSynthesis 朗读 AI 回复。
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
OPENAI_API_BASE=https://your-proxy.example.com/v1
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
5. 在 Render 环境变量中填入中转服务提供的 `OPENAI_API_KEY` 和 `OPENAI_API_BASE`。
6. 部署后访问 Render 分配的 URL。

## 重要安全提醒

- 不要把 `OPENAI_API_KEY` 或 `DASHSCOPE_API_KEY` 放进前端代码。
- 面向儿童使用时，建议只开放老师审核过的文本和角色。
- 默认不保存原始音频，只保存必要的文字记录和报告。
- 上线前应增加账号体系、家长/教师管理、内容审核和成本限额。

## 中转 API 文字版测试

如果使用 `https://api.zyaihub.com/v1` 这类 OpenAI 兼容中转，先用文字版测试最稳。Render 设置：

```text
AI_PROVIDER=openai-compatible
OPENAI_API_KEY=对方平台颁发的 sk-... 令牌
OPENAI_API_BASE=https://api.zyaihub.com/v1
OPENAI_TEXT_MODEL=gpt-4o
```

这个模式调用：

```text
POST /v1/chat/completions
```

页面仍会用浏览器内置朗读功能播放 AI 外教回复。

## Realtime 中转测试

如果使用别人提供的 OpenAI Realtime 兼容中转，请在 Render 设置：

```text
AI_PROVIDER=openai-realtime
OPENAI_API_KEY=对方给你的 key
OPENAI_API_BASE=对方给你的 base url，通常以 /v1 结尾
OPENAI_REALTIME_MODEL=对方指定的 realtime 模型名
OPENAI_VOICE=alloy
```

对方必须支持：

```text
POST /v1/realtime/sessions
POST /v1/realtime?model=...
WebRTC SDP
```

只支持 `/v1/chat/completions` 的中转不能跑实时语音。

## 国内文字模式说明

如果要回退到阿里云百炼/通义千问文字模式，请设置：

```text
AI_PROVIDER=dashscope
DASHSCOPE_API_KEY=你的百炼 key
DASHSCOPE_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
```

这一版先用“文字输入 + AI回复朗读”的方式跑通国内可访问 MVP。后续可以继续接入阿里云语音识别 ASR 和语音合成 TTS，升级成完整语音链路。
