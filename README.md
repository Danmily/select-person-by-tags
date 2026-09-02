# 圈人工作台 · 交互原型

产品设计原型，用于演示跨域圈人 Agent 的交互形态。

**页面内所有标签、口径、人群与数值均为虚构示例，不代表任何真实业务数据或线上系统。**

## 本地查看

双击 `index.html`，或：

    python3 -m http.server 8000

然后打开 http://localhost:8000

## 部署

纯静态单文件，无构建步骤。任何静态托管都可以直接用。

- Vercel：`npx vercel --prod`（需先安装 Node）
- Cloudflare Pages / Netlify：Web 界面直接拖这个文件夹

`vercel.json` 已配置 `X-Robots-Tag: noindex`，避免被搜索引擎收录。
