# 科特班专属英才学习计划

面向家长的学习计划与学情报告应用，包含学生报告端和教师管理后台。教师可以批量导入本人学生数据、下载数据、查看家长访问及名额锁定状态；生产环境支持 MySQL、阿里云 RDS 和 OSS/CDN。

## 本地运行

```bash
npm install
npm run dev
```

- 学生端：`http://localhost:5173/`
- 教师后台：`http://localhost:5173/admin`
- API 健康检查：`http://localhost:5174/api/health`

本地运行默认使用 `server-data` 下的 JSON 数据。该目录中的学生、教师和审计数据不会提交到 Git。可以通过教师管理命令创建本地账号：

```bash
export TEACHER_PASSWORD='替换为至少10位的密码'
npm run teacher -- create --account=teacher_account --name='教师姓名'
unset TEACHER_PASSWORD
```

Windows PowerShell 使用 `$env:TEACHER_PASSWORD='密码'` 设置环境变量，完成后执行 `Remove-Item Env:TEACHER_PASSWORD`。

## 构建

```bash
npm run build
```

视频文件通过 Git LFS 管理。首次克隆后如媒体文件没有自动下载，请执行：

```bash
git lfs pull
```

## 部署

- [阿里云 Ubuntu、RDS 与 OSS 部署指南](DEPLOYMENT.md)
- [上线待办与优先级](TODO.md)

生产环境必须设置强随机 `SESSION_SECRET`。家长使用导入名单中的用户 ID 查看报告；不要把数据库密码、OSS AccessKey、学生数据或教师密码文件提交到仓库。
