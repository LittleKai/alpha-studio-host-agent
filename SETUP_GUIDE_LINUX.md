# Hướng dẫn Cài đặt Host Agent trên Linux (Ubuntu/Debian)

## Mục lục
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Phần 1: Cài đặt Docker Engine](#phần-1-cài-đặt-docker-engine)
- [Phần 2: Cài đặt Node.js](#phần-2-cài-đặt-nodejs)
- [Phần 3: Setup Agent](#phần-3-setup-agent)
- [Phần 4: Đăng ký máy trong Admin Panel](#phần-4-đăng-ký-máy-trong-admin-panel)
- [Phần 5: Kiểm tra & Xác minh](#phần-5-kiểm-tra--xác-minh)
- [Phần 6: Chạy Agent như Service (Production)](#phần-6-chạy-agent-như-service-production)
- [Phần 7: Bảo trì & Vận hành](#phần-7-bảo-trì--vận-hành)
- [Phần 8: Mạng & Firewall](#phần-8-mạng--firewall)
- [Phần 9: Bảo mật Production](#phần-9-bảo-mật-production)
- [Troubleshooting](#troubleshooting)

---

## Yêu cầu hệ thống

### Phần cứng tối thiểu
| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|-----------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Disk | 50 GB SSD | 100+ GB SSD |
| GPU | Không bắt buộc | NVIDIA (nếu cần GPU trong container) |
| Network | 100 Mbps | 1 Gbps |

> **Tính toán:** Mỗi container desktop dùng 2 CPU + 4GB RAM. Máy 16GB RAM chạy được ~3 container đồng thời.

### Phần mềm
- **OS:** Ubuntu 22.04+ / Debian 12+ (hướng dẫn này dùng Ubuntu, các distro khác tương tự)
- **Docker Engine** 24+
- **Node.js** 18+ (LTS)
- **Git**

### Network
- Port agent (mặc định `4000`) phải mở cho Backend truy cập
- Port range `6080-6999` phải mở cho client truy cập noVNC
- Agent phải kết nối được đến Backend API

---

## Phần 1: Cài đặt Docker Engine

### 1.1. Cập nhật hệ thống

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2. Cài Docker Engine

```bash
# Cài nhanh bằng script chính thức
curl -fsSL https://get.docker.com | sh

# Thêm user hiện tại vào group docker (chạy docker không cần sudo)
sudo usermod -aG docker $USER

# Áp dụng group mới (hoặc đăng xuất rồi đăng nhập lại)
newgrp docker
```

> **Cài thủ công** (nếu muốn kiểm soát hơn):
> ```bash
> # Thêm Docker GPG key
> sudo install -m 0755 -d /etc/apt/keyrings
> curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
> sudo chmod a+r /etc/apt/keyrings/docker.gpg
>
> # Thêm repository
> echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
>
> # Cài đặt
> sudo apt update
> sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
> ```

### 1.3. Kiểm tra

```bash
docker --version
# Docker version 27.x.x, build xxxxx

docker ps
# CONTAINER ID   IMAGE   COMMAND   ...

docker run hello-world
# Hello from Docker!
```

### 1.4. Cấu hình Docker khởi động cùng hệ thống

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

---

## Phần 2: Cài đặt Node.js

### Option A: NodeSource (Khuyến nghị cho production)

```bash
# Cài Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Kiểm tra
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Option B: nvm (Quản lý nhiều phiên bản)

```bash
# Cài nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Tải lại shell
source ~/.bashrc

# Cài và dùng Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

node --version
```

---

## Phần 3: Setup Agent

### 3.1. Tạo thư mục và lấy source code

```bash
# Tạo thư mục
sudo mkdir -p /opt/alpha-studio-host-agent
sudo chown $USER:$USER /opt/alpha-studio-host-agent

# Cách 1: Clone từ Git
git clone <repo-url> /tmp/alpha-studio
cp -r /tmp/alpha-studio/alpha-studio-host-agent/* /opt/alpha-studio-host-agent/
rm -rf /tmp/alpha-studio

# Cách 2: SCP từ máy dev
# scp -r user@dev-machine:/path/to/alpha-studio-host-agent/* /opt/alpha-studio-host-agent/

# Cách 3: Rsync (nhanh hơn cho cập nhật sau này)
# rsync -avz user@dev-machine:/path/to/alpha-studio-host-agent/ /opt/alpha-studio-host-agent/

cd /opt/alpha-studio-host-agent
```

### 3.2. Cài dependencies

```bash
cd /opt/alpha-studio-host-agent
npm install --production
```

### 3.3. Build Docker Desktop Image

```bash
cd /opt/alpha-studio-host-agent

# Build image (lần đầu mất 5-15 phút tùy tốc độ mạng)
docker build -f Dockerfile.desktop -t alpha-desktop:latest .

# Kiểm tra image đã build
docker images | grep alpha-desktop
# REPOSITORY       TAG       IMAGE ID       CREATED        SIZE
# alpha-desktop    latest    xxxxxxxxxxxx   1 minute ago   ~2.5GB
```

> **Nếu build lỗi:**
> - Kiểm tra Docker đang chạy: `sudo systemctl status docker`
> - Kiểm tra dung lượng ổ đĩa: `df -h`
> - Thử lại (có thể do mạng timeout)

### 3.4. Cấu hình Environment

```bash
cd /opt/alpha-studio-host-agent

# Tạo file .env từ template
cp .env.example .env

# Chỉnh sửa
nano .env
```

Nội dung `.env`:

```env
# Port mà agent lắng nghe (Backend sẽ gọi vào đây)
PORT=4000

# Secret key — PHẢI khớp với secret khi đăng ký máy trong Admin Panel
# Tạo secret ngẫu nhiên:
#   openssl rand -hex 32
AGENT_SECRET=<your-generated-secret>

# URL của Backend API
BACKEND_URL=https://alpha-studio-backend.onrender.com/api
# Hoặc nếu backend cùng mạng nội bộ:
# BACKEND_URL=http://192.168.1.10:3001/api

# ID duy nhất cho máy này — PHẢI khớp với machineId khi đăng ký trong Admin
MACHINE_ID=srv-hanoi-01

# IP mà client (trình duyệt) sẽ dùng để truy cập noVNC
# Xem bảng hướng dẫn chọn HOST_IP bên dưới
HOST_IP=203.0.113.50
```

**Tạo secret key:**
```bash
openssl rand -hex 32
# ví dụ: a1b2c3d4e5f6...
```

#### Cách chọn HOST_IP đúng

| Tình huống | HOST_IP | Cách kiểm tra |
|-----------|---------|---------------|
| Tất cả chạy trên 1 máy (dev) | `localhost` | — |
| Client và Agent cùng mạng LAN | IP LAN (ví dụ `192.168.1.20`) | `hostname -I \| awk '{print $1}'` |
| Client truy cập từ Internet | IP public (ví dụ `203.0.113.50`) | `curl -s ifconfig.me` |
| Dùng reverse proxy (Nginx) | Domain (ví dụ `cloud.alphastudio.com`) | — |

### 3.5. Chạy thử

```bash
cd /opt/alpha-studio-host-agent
node src/index.js
```

Bạn sẽ thấy:
```
Alpha Studio Host Agent
  Machine ID: srv-hanoi-01
  Port: 4000
  Backend: https://alpha-studio-backend.onrender.com/api
  Host IP: 203.0.113.50
```

Sau 5 giây sẽ có log heartbeat:
```
[Heartbeat] Failed: fetch failed
```
> Đây là bình thường nếu Backend chưa chạy hoặc máy chưa đăng ký trong Admin Panel.

Nhấn `Ctrl+C` để dừng. Phần 6 sẽ hướng dẫn chạy như service.

---

## Phần 4: Đăng ký máy trong Admin Panel

**Bước này BẮT BUỘC trước khi Agent có thể gửi heartbeat thành công.**

### 4.1. Đăng nhập Admin

1. Truy cập website Alpha Studio (ví dụ: https://alphastudio.vercel.app hoặc http://localhost:5173)
2. Đăng nhập tài khoản **admin**

### 4.2. Vào trang quản lý Cloud Desktop

1. Click menu **Admin** (hoặc truy cập `/admin`)
2. Chọn tab **"Cloud Desktop"**
3. Đang ở sub-tab **"Máy chủ"**

### 4.3. Đăng ký máy mới

Bấm **"+ Đăng ký máy"** và điền:

| Field | Giá trị ví dụ | Lưu ý |
|-------|--------------|-------|
| Tên máy | `Server Hà Nội 01` | Tên hiển thị, đặt tùy ý |
| Machine ID | `srv-hanoi-01` | **PHẢI KHỚP** với `MACHINE_ID` trong `.env` |
| Agent URL | `http://203.0.113.50:4000` | URL mà Backend gọi đến Agent |
| Secret Key | `<your-generated-secret>` | **PHẢI KHỚP** với `AGENT_SECRET` trong `.env` |
| CPU | `Intel Xeon E-2388G` | Thông tin hiển thị (Agent tự cập nhật qua heartbeat) |
| RAM | `64GB` | Thông tin hiển thị |
| GPU | `NVIDIA RTX 4090 24GB` | Thông tin hiển thị |
| Max Containers | `5` | Số container tối đa (khuyến nghị: (RAM - 4GB) / 4GB) |

Bấm **"Lưu"**.

### 4.4. Xác minh kết nối

1. Đảm bảo Agent đang chạy
2. Đợi 30 giây (1 chu kỳ heartbeat)
3. Refresh trang Admin
4. Kiểm tra:
   - **Status**: Chuyển sang **"Khả dụng"** (xanh lá) ✅
   - **Last Ping**: Hiện thời gian gần đây (ví dụ "5s ago")
   - **Containers**: Hiện `0 / 5`
   - Console Agent hiện: `[Heartbeat] status=available, containers=0`

---

## Phần 5: Kiểm tra & Xác minh

### 5.1. Checklist sau cài đặt

```bash
# 1. Docker hoạt động
docker ps
# → Không lỗi

# 2. Image đã build
docker images | grep alpha-desktop
# → alpha-desktop   latest   ~2.5GB

# 3. Agent health check (mở terminal khác khi agent đang chạy)
curl http://localhost:4000/api/health
# → {"success":true,"message":"Host agent is running","machineId":"srv-hanoi-01",...}
```

### 5.2. Test tạo container thủ công

```bash
# Tạo container thử
curl -s -X POST http://localhost:4000/api/sessions/create \
  -H "Content-Type: application/json" \
  -H "x-agent-secret: <your-secret>" \
  -d '{"userId":"test"}' | python3 -m json.tool
# → containerId, noVncUrl, port

# Kiểm tra container đang chạy
docker ps --filter "name=desktop-"
# → 1 container

# Mở noVNC: copy noVncUrl → dán vào trình duyệt → thấy desktop Ubuntu

# Xóa container thử (thay <containerId> bằng giá trị thật)
curl -s -X POST http://localhost:4000/api/sessions/<containerId>/destroy \
  -H "Content-Type: application/json" \
  -H "x-agent-secret: <your-secret>"
# → {"success":true,"message":"Container destroyed"}

# Xác nhận container đã xóa
docker ps --filter "name=desktop-"
# → Trống
```

### 5.3. Test end-to-end

1. Backend đang chạy
2. Agent đang chạy + đã đăng ký trong Admin
3. Đăng nhập tài khoản student trên Frontend
4. Vào `/server` → bấm **"Kết nối Cloud Desktop"**
5. Chờ ~5 giây → thấy **"Desktop đang hoạt động"**
6. Bấm **"Mở Desktop"** → tab mới mở noVNC → thấy desktop Ubuntu
7. Bấm **"Ngắt kết nối"** → xác nhận → quay về trạng thái idle

---

## Phần 6: Chạy Agent như Service (Production)

### Option A: PM2 (Khuyến nghị)

PM2 là process manager cho Node.js, tự restart khi crash, quản lý log, cluster mode.

```bash
# Cài PM2 globally
sudo npm install -g pm2

# Chạy agent
cd /opt/alpha-studio-host-agent
pm2 start src/index.js --name "host-agent"

# Kiểm tra
pm2 status
pm2 logs host-agent

# Cấu hình auto-start khi reboot
pm2 startup
# → PM2 sẽ in ra 1 lệnh sudo, copy và chạy lệnh đó
pm2 save
```

**Các lệnh quản lý PM2:**

```bash
pm2 status                # Xem trạng thái tất cả process
pm2 logs host-agent       # Xem log realtime
pm2 logs host-agent --lines 50  # Xem 50 dòng log gần nhất
pm2 restart host-agent    # Restart
pm2 stop host-agent       # Dừng
pm2 delete host-agent     # Xóa khỏi PM2
pm2 monit                 # Dashboard monitor (CPU, RAM, log)
```

### Option B: systemd

systemd tích hợp sẵn trong Ubuntu, không cần cài thêm.

```bash
# Tạo service file
sudo nano /etc/systemd/system/alpha-host-agent.service
```

Nội dung:

```ini
[Unit]
Description=Alpha Studio Host Agent
Documentation=https://github.com/your-repo
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=<your-username>
WorkingDirectory=/opt/alpha-studio-host-agent
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Log
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alpha-host-agent

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/alpha-studio-host-agent

[Install]
WantedBy=multi-user.target
```

> **Lưu ý:** Thay `<your-username>` bằng user có quyền chạy docker (đã thêm vào group docker ở Phần 1).

```bash
# Reload systemd
sudo systemctl daemon-reload

# Bật tự khởi động
sudo systemctl enable alpha-host-agent

# Khởi động
sudo systemctl start alpha-host-agent

# Kiểm tra trạng thái
sudo systemctl status alpha-host-agent
```

**Các lệnh quản lý systemd:**

```bash
sudo systemctl status alpha-host-agent     # Xem trạng thái
sudo systemctl restart alpha-host-agent    # Restart
sudo systemctl stop alpha-host-agent       # Dừng
sudo systemctl disable alpha-host-agent    # Tắt tự khởi động

# Xem log
sudo journalctl -u alpha-host-agent -f             # Log realtime
sudo journalctl -u alpha-host-agent -n 50           # 50 dòng gần nhất
sudo journalctl -u alpha-host-agent --since "1h ago" # Log 1 giờ qua
```

---

## Phần 7: Bảo trì & Vận hành

### Cập nhật Agent code

```bash
cd /opt/alpha-studio-host-agent

# Pull code mới (nếu dùng git)
git pull

# Hoặc rsync từ máy dev
# rsync -avz user@dev:/path/to/alpha-studio-host-agent/ /opt/alpha-studio-host-agent/ --exclude node_modules --exclude .env

# Cài lại dependencies nếu package.json thay đổi
npm install --production

# Restart
pm2 restart host-agent
# hoặc
sudo systemctl restart alpha-host-agent
```

### Rebuild Docker Image

Khi `Dockerfile.desktop` hoặc `startup.sh` thay đổi:

```bash
cd /opt/alpha-studio-host-agent

# Build lại
docker build -f Dockerfile.desktop -t alpha-desktop:latest .

# Container mới sẽ dùng image mới
# Container cũ đang chạy KHÔNG bị ảnh hưởng
```

### Dọn dẹp container rác

Nếu agent bị crash hoặc container không được xóa đúng cách:

```bash
# Xem tất cả container desktop (kể cả đã dừng)
docker ps -a --filter "name=desktop-"

# Xóa tất cả container desktop
docker ps -a --filter "name=desktop-" -q | xargs -r docker rm -f

# Dọn dẹp Docker resources không dùng
docker system prune -f

# Dọn cả image không dùng (giải phóng disk)
docker system prune -a -f
```

### Xem log

```bash
# PM2
pm2 logs host-agent --lines 50

# systemd
sudo journalctl -u alpha-host-agent -n 50

# Log của container cụ thể
docker logs <container-id>
docker logs -f <container-id>  # follow (realtime)
```

### Monitoring tài nguyên

```bash
# Docker container stats (CPU, RAM realtime)
docker stats

# Tổng quan Docker disk usage
docker system df

# Hệ thống
htop              # CPU/RAM (cài: sudo apt install htop)
df -h             # Disk usage
free -h           # RAM
```

---

## Phần 8: Mạng & Firewall

### 8.1. UFW (Uncomplicated Firewall)

Ubuntu mặc định có UFW nhưng thường chưa bật.

```bash
# Kiểm tra trạng thái
sudo ufw status

# Nếu chưa bật, cho phép SSH trước khi bật (tránh bị khóa)
sudo ufw allow OpenSSH

# Bật UFW
sudo ufw enable
```

**Mở port cho Agent:**

```bash
# Port 4000 - Agent API (Backend gọi vào)
sudo ufw allow 4000/tcp comment "Alpha Host Agent API"

# Port range 6080-6999 - noVNC (Client truy cập)
sudo ufw allow 6080:6999/tcp comment "Alpha Desktop noVNC"

# Kiểm tra rules
sudo ufw status numbered
```

> **Nếu chỉ muốn cho phép IP cụ thể** (bảo mật hơn):
> ```bash
> # Chỉ cho Backend server gọi vào port 4000
> sudo ufw allow from 10.0.0.5 to any port 4000 proto tcp comment "Backend server"
> ```

### 8.2. iptables (nếu không dùng UFW)

```bash
# Port 4000
sudo iptables -A INPUT -p tcp --dport 4000 -j ACCEPT

# Port range 6080-6999
sudo iptables -A INPUT -p tcp --dport 6080:6999 -j ACCEPT

# Lưu rules
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

### 8.3. Kiểm tra port đã mở

```bash
# Kiểm tra agent đang listen
ss -tlnp | grep 4000
# LISTEN  0  511  0.0.0.0:4000  0.0.0.0:*  users:(("node",pid=xxxx,fd=xx))

# Kiểm tra từ máy khác
# Từ máy Backend hoặc client:
curl http://<agent-ip>:4000/api/health
```

### 8.4. Xem IP

```bash
# IP LAN
hostname -I | awk '{print $1}'
# hoặc
ip addr show | grep "inet " | grep -v 127.0.0.1

# IP public
curl -s ifconfig.me
# hoặc
curl -s icanhazip.com
```

### 8.5. Cloud Provider (AWS/GCP/Azure/DigitalOcean)

Nếu chạy trên cloud, ngoài firewall hệ thống còn cần mở **Security Group / Firewall Rules** trên dashboard của provider:

| Provider | Nơi cấu hình |
|----------|--------------|
| AWS | EC2 → Security Groups → Inbound Rules |
| GCP | VPC Network → Firewall Rules |
| Azure | Network Security Group → Inbound Rules |
| DigitalOcean | Networking → Firewalls |

Thêm rules:
- TCP `4000` (from Backend IP hoặc `0.0.0.0/0`)
- TCP `6080-6999` (from `0.0.0.0/0` nếu client truy cập từ Internet)

---

## Phần 9: Bảo mật Production

### 9.1. AGENT_SECRET mạnh

```bash
# Tạo secret 64 ký tự hex
openssl rand -hex 32
```

Không dùng secret yếu như `test-123`, `password`, `abc123`.

### 9.2. Giới hạn truy cập port 4000

Port 4000 chỉ cần Backend gọi vào. Nếu biết IP Backend:

```bash
# Chỉ cho phép IP backend
sudo ufw allow from <backend-ip> to any port 4000 proto tcp

# Chặn tất cả IP khác vào port 4000 (UFW deny mặc định nếu đã enable)
```

### 9.3. Reverse proxy với Nginx (tùy chọn)

Nếu muốn dùng HTTPS cho noVNC hoặc gom noVNC qua 1 domain:

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/alpha-agent
```

```nginx
# Proxy cho Agent API
server {
    listen 443 ssl;
    server_name agent.alphastudio.com;

    ssl_certificate /etc/letsencrypt/live/agent.alphastudio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.alphastudio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Proxy cho noVNC (WebSocket)
server {
    listen 443 ssl;
    server_name desktop.alphastudio.com;

    ssl_certificate /etc/letsencrypt/live/desktop.alphastudio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/desktop.alphastudio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/alpha-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> **Lưu ý:** Nếu dùng Nginx proxy cho noVNC, cần cấu hình WebSocket upgrade (`Upgrade` + `Connection` headers).

### 9.4. Tự động cập nhật bảo mật OS

```bash
# Bật unattended-upgrades
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 9.5. Fail2ban (chống brute force SSH)

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Troubleshooting

### Docker không khởi động

**Lỗi: `Cannot connect to the Docker daemon`**
```bash
# Kiểm tra Docker service
sudo systemctl status docker

# Nếu chưa chạy
sudo systemctl start docker

# Nếu lỗi, xem log
sudo journalctl -u docker -n 30
```

**Lỗi: `permission denied while trying to connect to the Docker daemon`**
```bash
# Thêm user vào group docker
sudo usermod -aG docker $USER

# Áp dụng ngay (hoặc đăng xuất rồi vào lại)
newgrp docker

# Kiểm tra
groups
# → ... docker ...
```

---

### Agent khởi động lỗi

**Lỗi: `Missing required env vars`**
→ Kiểm tra file `.env` có tồn tại và đầy đủ 3 biến bắt buộc: `AGENT_SECRET`, `BACKEND_URL`, `MACHINE_ID`.

```bash
cat /opt/alpha-studio-host-agent/.env
```

**Lỗi: `Error: listen EADDRINUSE: address already in use :::4000`**
→ Port 4000 đang bị chiếm:
```bash
# Tìm process đang dùng port 4000
ss -tlnp | grep 4000
# hoặc
lsof -i :4000

# Kill process đó
kill <PID>
```

---

### Heartbeat thất bại

**Lỗi: `[Heartbeat] Failed: fetch failed`**
→ Backend không truy cập được:
```bash
# Test kết nối đến backend
curl <BACKEND_URL>/health
# Nếu không được → kiểm tra URL, DNS, firewall
```

**Lỗi: `[Heartbeat] Failed: 404`**
→ Machine chưa được đăng ký trong Admin Panel. Xem [Phần 4](#phần-4-đăng-ký-máy-trong-admin-panel).

**Lỗi: `[Heartbeat] Failed: 403`**
→ `AGENT_SECRET` trong `.env` không khớp với secret đăng ký trong Admin. Kiểm tra lại cả 2 nơi.

---

### Docker build lỗi

**Lỗi: Build quá chậm hoặc timeout**
→ Do tải packages từ internet. Kiểm tra kết nối mạng:
```bash
ping google.com
curl -s https://archive.ubuntu.com > /dev/null && echo "OK" || echo "FAIL"
```

**Lỗi: `no space left on device`**
→ Ổ đĩa hết dung lượng:
```bash
df -h
# Dọn dẹp Docker
docker system prune -a -f
```

---

### Container tạo lỗi

**Lỗi: `No free ports available`**
→ Đã dùng hết port 6080-6999:
```bash
docker ps --filter "name=desktop-" | wc -l
# Xóa container không dùng
docker ps -a --filter "name=desktop-" -q | xargs -r docker rm -f
```

**Lỗi: `port is already allocated`**
→ Port đang bị chiếm:
```bash
ss -tlnp | grep 6080
# Kill hoặc chờ process giải phóng
```

**Lỗi: `Failed to create container` / Docker run failed**
```bash
# Kiểm tra image
docker images | grep alpha-desktop

# Thử chạy container thủ công
docker run -d --name test-desktop -p 6080:6080 alpha-desktop:latest

# Xem log nếu container exit
docker logs test-desktop

# Dọn dẹp
docker rm -f test-desktop
```

---

### noVNC không hiện desktop

**Trình duyệt hiện "Unable to connect"**

1. Container đang chạy: `docker ps --filter "name=desktop-"`
2. Port mapping đúng: `docker port <container-id>`
3. Firewall cho phép port: `sudo ufw status`
4. HOST_IP đúng (client có thể reach được IP này)

**Trình duyệt hiện trang trắng hoặc loading mãi**
→ VNC server trong container chưa sẵn sàng. Đợi 5-10 giây rồi refresh.

**Kiểm tra bên trong container:**
```bash
docker exec -it <container-id> bash

# Kiểm tra processes
ps aux | grep vnc
ps aux | grep websockify

# Kiểm tra port
netstat -tlnp | grep 6080

# Xem log VNC
cat /tmp/.x11vnc.log
```

---

### Máy hiện "Ngoại tuyến" trong Admin

| Nguyên nhân | Kiểm tra |
|-------------|----------|
| Agent chưa chạy | `curl http://localhost:4000/api/health` |
| MACHINE_ID không khớp | So sánh `.env` với Admin Panel |
| AGENT_SECRET không khớp | So sánh `.env` với Admin Panel |
| Backend không nhận được heartbeat | `curl <BACKEND_URL>/health` |
| Firewall chặn outbound | `curl -v <BACKEND_URL>/health` |

---

## Tóm tắt nhanh

```bash
# === SETUP LẦN ĐẦU ===
# 1. Cài Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Cài Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Setup agent
cd /opt/alpha-studio-host-agent
npm install --production
docker build -f Dockerfile.desktop -t alpha-desktop:latest .
cp .env.example .env && nano .env

# 4. Đăng ký máy trong Admin Panel (MACHINE_ID + AGENT_SECRET phải khớp)

# 5. Chạy bằng PM2
sudo npm install -g pm2
pm2 start src/index.js --name host-agent
pm2 startup && pm2 save

# 6. Mở firewall
sudo ufw allow 4000/tcp
sudo ufw allow 6080:6999/tcp

# === KIỂM TRA ===
curl http://localhost:4000/api/health
pm2 logs host-agent
# Admin Panel → Cloud Desktop → Machines → Status = "Khả dụng"
```
