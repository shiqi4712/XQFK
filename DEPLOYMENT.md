# 阿里云 Ubuntu 部署指南

本文是一份面向首次部署人员的操作指南，目标是在一台阿里云轻量应用服务器上运行前端、Node.js API、MySQL，并用 OSS/CDN 承载图片和视频。

## 1. 准备资源

准备以下信息：

- Ubuntu 22.04 或 24.04，2 核 4 GB
- 域名，例如 `report.example.com`
- MySQL 8：可与应用同机，也可使用阿里云 RDS
- OSS Bucket，建议开启 CDN 和 HTTPS 域名
- 三组数据库密码：应用账号、备份账号、恢复演练账号

轻量服务器防火墙只开放 `22`、`80`、`443`。不要向公网开放 `3306`。如使用 RDS，只允许服务器私网 IP 或安全组访问数据库。

## 2. 安装运行环境

登录 Ubuntu 后执行：

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg nginx mysql-client certbot python3-certbot-nginx rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

同机运行 MySQL 时再执行：

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```

创建服务用户和目录：

```bash
sudo adduser --system --group --home /opt/learning-report learning-report
sudo install -d -o learning-report -g learning-report /opt/learning-report/releases
sudo install -d -o root -g root -m 755 /var/www/learning-report
sudo install -d -o root -g learning-report -m 750 /etc/learning-report
sudo install -d -o root -g root -m 700 /var/backups/learning-report
```

## 3. 上传代码

在本机 PowerShell 的项目目录执行：

```powershell
tar -czf learning-report-release.tgz --exclude=node_modules --exclude=dist --exclude=.tmp .
scp .\learning-report-release.tgz root@服务器公网IP:/tmp/
```

在服务器创建本次发布目录：

```bash
release_id=$(date -u +%Y%m%dT%H%M%SZ)
sudo install -d -m 750 -o learning-report -g learning-report "/opt/learning-report/releases/$release_id"
sudo -u learning-report tar -xzf /tmp/learning-report-release.tgz -C "/opt/learning-report/releases/$release_id"
sudo chmod -R o-rwx "/opt/learning-report/releases/$release_id"
cd "/opt/learning-report/releases/$release_id"
sudo -u learning-report npm ci
```

## 4. 初始化 MySQL

生成三组强密码：

```bash
openssl rand -base64 32
openssl rand -base64 32
openssl rand -base64 32
```

同机 MySQL 使用 `sudo mysql`；RDS 使用管理员账号连接。替换下方密码后执行：

```sql
CREATE DATABASE learning_report CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'learning_report'@'127.0.0.1' IDENTIFIED BY '替换为应用密码';
GRANT SELECT, INSERT, UPDATE ON learning_report.* TO 'learning_report'@'127.0.0.1';
CREATE USER 'learning_report_backup'@'127.0.0.1' IDENTIFIED BY '替换为备份密码';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON learning_report.* TO 'learning_report_backup'@'127.0.0.1';
CREATE USER 'learning_report_restore'@'127.0.0.1' IDENTIFIED BY '替换为恢复演练密码';
GRANT ALL PRIVILEGES ON learning_report_restore_check.* TO 'learning_report_restore'@'127.0.0.1';
FLUSH PRIVILEGES;
```

RDS 场景把账号的主机范围按 RDS 控制台要求配置，并在白名单中只加入应用服务器私网 IP。

同机 MySQL 使用系统管理员连接执行建表脚本：

```bash
sudo mysql learning_report < sql/schema.sql
```

使用 RDS 时改为 `mysql --host=RDS内网地址 --user=管理员账号 -p learning_report < sql/schema.sql`。

应用运行时保持 `DB_AUTO_MIGRATE=false`，避免 Node.js 账号拥有建表权限。数据库结构升级应由管理员单独执行经过审核的 SQL。

如果 RDS 中已经存在旧表，不要重复执行完整建表脚本。发布本版本前由数据库管理员依次执行老师角色、学生课线与组长字段迁移：

```bash
mysql --host=RDS内网地址 --user=管理员账号 -p learning_report < sql/migrations/001_add_teacher_role.sql
mysql --host=RDS内网地址 --user=管理员账号 -p learning_report < sql/migrations/002_add_student_org_fields.sql
```

执行后检查管理员角色：

```sql
SELECT account, display_name, role, active FROM teachers ORDER BY role, account;
SHOW COLUMNS FROM students WHERE Field IN ('course_line', 'team_leader');
```

## 5. 配置生产环境

复制并编辑配置：

```bash
sudo cp deploy/learning-report.env.example /etc/learning-report/learning-report.env
sudo chmod 640 /etc/learning-report/learning-report.env
sudo chown root:learning-report /etc/learning-report/learning-report.env
sudo nano /etc/learning-report/learning-report.env
```

至少替换：

- `SESSION_SECRET`：执行 `openssl rand -hex 32` 生成
- `DB_HOST`：同机使用 `127.0.0.1`，RDS 使用内网地址
- `DB_PASSWORD`：应用数据库密码
- `DB_SSL`：RDS 要求 TLS 时设为 `true`
- `ALLOW_LEGACY_STUDENT_ID_LOGIN=false`
- `DB_AUTO_MIGRATE=false`

环境文件只存放在 `/etc/learning-report`，不要提交到代码仓库或放进前端目录。

## 6. 迁移已有数据并创建管理员

首次迁移现有 JSON 数据：

```bash
cd "/opt/learning-report/releases/$release_id"
set -a
source /etc/learning-report/learning-report.env
set +a
npm run migrate:mysql
```

查看教师账号：

```bash
npm run teacher -- list
```

首次部署时创建管理员账号。`--role=admin` 必须显式指定：

```bash
export TEACHER_PASSWORD='替换为管理员强密码'
npm run teacher -- create --account=shiqi --name='系统管理员' --role=admin
unset TEACHER_PASSWORD
```

管理员登录 `/admin` 后，可以在“账号与权限”页单个或批量创建管理员，也可以批量创建普通老师。管理员导入表必须提供至少 10 位初始密码；新老师默认密码为 `bcm666`，应要求老师首次登录后修改密码。也可以通过命令行创建普通老师：

```bash
export TEACHER_PASSWORD='替换为教师初始强密码'
npm run teacher -- create --account=teacher_account --name='教师姓名' --role=teacher
unset TEACHER_PASSWORD
```

迁移确认后停用演示账号：

```bash
npm run teacher -- disable --account=teacher01
npm run teacher -- disable --account=teacher02
```

## 7. 上传 OSS 静态资源

在服务器安装并配置 `ossutil`，优先使用 RAM 最小权限账号或实例角色。AccessKey 只保存在服务器的受限配置中，绝不能写入 `VITE_` 环境变量或浏览器代码。

```bash
cd "/opt/learning-report/releases/$release_id"
export OSS_DESTINATION='oss://你的Bucket/learning-report/assets'
bash deploy/upload-oss.sh
unset OSS_DESTINATION
```

确认 OSS/CDN 可公开读取资源后构建前端：

```bash
export VITE_ASSET_BASE_URL='https://静态资源域名/learning-report/assets'
sudo -u learning-report --preserve-env=VITE_ASSET_BASE_URL npm run build
unset VITE_ASSET_BASE_URL
sudo rsync -a --delete dist/ /var/www/learning-report/
```

图片和视频放 OSS；MySQL 只保存业务字段和资源 URL。建议 OSS 开启跨域 GET/HEAD、HTTPS、自定义域名和生命周期规则。

## 8. 启动 API

切换当前版本并安装 systemd 服务：

```bash
sudo ln -sfn "/opt/learning-report/releases/$release_id" /opt/learning-report/current
sudo cp deploy/learning-report-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now learning-report-api
sudo systemctl status learning-report-api --no-pager
curl http://127.0.0.1:5174/api/health
```

健康检查应返回 `{"ok":true,"storage":"mysql"}`。失败时查看：

```bash
sudo journalctl -u learning-report-api -n 100 --no-pager
```

## 9. 配置 Nginx 和 HTTPS

先把 `deploy/nginx-learning-report.conf` 中的 `report.example.com` 替换为正式域名，再执行：

```bash
sudo cp deploy/nginx-learning-report.conf /etc/nginx/sites-available/learning-report
sudo ln -sfn /etc/nginx/sites-available/learning-report /etc/nginx/sites-enabled/learning-report
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d report.example.com
sudo certbot renew --dry-run
```

确认域名 DNS 已指向服务器后再申请证书。

## 10. 配置每日备份

复制备份配置和脚本。配置文件同时包含只读备份账号，以及仅能操作 `learning_report_restore_check` 临时库的恢复演练账号：

```bash
sudo cp deploy/backup.env.example /etc/learning-report/backup.env
sudo chmod 600 /etc/learning-report/backup.env
sudo nano /etc/learning-report/backup.env
sudo cp deploy/backup-mysql.sh /usr/local/sbin/learning-report-backup
sudo cp deploy/restore-check.sh /usr/local/sbin/learning-report-restore-check
sudo chmod 750 /usr/local/sbin/learning-report-backup /usr/local/sbin/learning-report-restore-check
sudo cp deploy/learning-report-backup.service deploy/learning-report-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now learning-report-backup.timer
sudo systemctl start learning-report-backup.service
sudo systemctl status learning-report-backup.service --no-pager
```

检查计时器和备份文件：

```bash
systemctl list-timers learning-report-backup.timer
sudo ls -lh /var/backups/learning-report
```

至少进行一次恢复演练：

```bash
sudo /usr/local/sbin/learning-report-restore-check /var/backups/learning-report/具体备份文件.sql.gz
```

脚本会恢复到 `learning_report_restore_check` 临时库并输出教师数和学生数。核对后手动删除该临时库。建议再把加密后的备份同步到私有 OSS Bucket，避免服务器磁盘损坏时备份同时丢失。

## 11. 上线验收

逐项确认：

1. `https://正式域名/api/health` 返回 `storage=mysql`。
2. 管理员登录 `/admin` 后能看到老师账号管理和全部学生数据。
3. 管理员能通过 XLSX/CSV 批量创建老师账号、重置默认密码、启停账号；仍有关联学生的老师不能删除。
4. 管理员批量导入学生时，“老师账号”列能正确分配学生。
5. 教师 A 通过同一 `/admin` 入口登录，只能看到、搜索、下载自己的学生，并且每次只能新增一名学生。
6. 教师 B 无法读取或覆盖教师 A 的学生，也无法访问老师账号管理 API。
7. XLSX/CSV 导入成功，错误行能下载失败记录。
8. 家长使用随机报告访问码进入，学生 ID 不能直接登录。
9. 家长查看报告后后台显示“已查看”；选择时间并锁定名额后显示“已锁定”。
10. 图片和视频请求来自 OSS/CDN，页面不暴露 AccessKey。
11. HTTPS、证书自动续期、每日备份和恢复演练均正常。

## 12. 更新与回滚

每次发布创建新的 `releases/<时间>` 目录，完成 `npm ci`、构建和健康检查后再切换软链接：

```bash
sudo ln -sfn /opt/learning-report/releases/新版本 /opt/learning-report/current
sudo systemctl restart learning-report-api
sudo rsync -a --delete /opt/learning-report/current/dist/ /var/www/learning-report/
```

回滚时把软链接切回上一个目录并重启 API。数据库变更必须先备份，并使用可向后兼容的迁移；不要用代码回滚替代数据库恢复。
