# Hướng dẫn Cài đặt Host Agent trên Windows

## Mục lục
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Phần 1: Cài đặt Docker Desktop](#phần-1-cài-đặt-docker-desktop)
- [Phần 2: Cài đặt Node.js](#phần-2-cài-đặt-nodejs)
- [Phần 3: Setup Agent](#phần-3-setup-agent)
- [Phần 4: Đăng ký máy trong Admin Panel](#phần-4-đăng-ký-máy-trong-admin-panel)
- [Phần 5: Kiểm tra & Xác minh](#phần-5-kiểm-tra--xác-minh)
- [Phần 6: Chạy Agent như Windows Service](#phần-6-chạy-agent-như-windows-service)
- [Phần 7: Bảo trì & Vận hành](#phần-7-bảo-trì--vận-hành)
- [Phần 8: Mạng & Firewall trên Windows](#phần-8-mạng--firewall-trên-windows)
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
- **OS:** Windows 10 Pro/Enterprise (build 19041+) hoặc Windows 11
- **Docker Desktop** 4.x+ (sử dụng WSL2 backend)
- **Node.js** 18+ (LTS)
- **Git** (tùy chọn, để clone code)

> **Lưu ý:** Windows 10 **Home** cũng hỗ trợ Docker Desktop + WSL2 từ phiên bản 2004 trở lên.

### Network
- Port agent (mặc định `4000`) phải mở cho Backend truy cập
- Port range `6080-6999` phải mở cho client truy cập noVNC
- Agent phải kết nối được đến Backend API

---

## Phần 1: Cài đặt Docker Desktop

### 1.1. Bật WSL2

Mở **PowerShell (Administrator)** và chạy:

```powershell
# Bật tính năng WSL
wsl --install

# Nếu đã có WSL, cập nhật lên WSL2
wsl --set-default-version 2

# Kiểm tra phiên bản
wsl --version
```

> **Nếu lệnh `wsl --install` không hoạt động**, bật thủ công:
> ```powershell
> dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
> dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
> ```
> Sau đó **khởi động lại máy**.

### 1.2. Cài Docker Desktop

1. Tải Docker Desktop từ: https://www.docker.com/products/docker-desktop
2. Chạy installer → **Đảm bảo chọn "Use WSL 2 instead of Hyper-V"**
3. Khởi động lại máy nếu được yêu cầu
4. Mở Docker Desktop, đợi cho đến khi icon ở system tray chuyển sang trạng thái **running** (xanh lá)

### 1.3. Cấu hình Docker Desktop

Mở Docker Desktop → **Settings** (⚙️):

1. **General:**
   - ✅ "Use the WSL 2 based engine" → **BẬT**
   - ✅ "Start Docker Desktop when you sign in to Windows" → **BẬT** (quan trọng cho production)

2. **Resources → WSL Integration:**
   - ✅ "Enable integration with my default WSL distro" → **BẬT**
   - Nếu có nhiều distro, bật cho distro bạn muốn dùng

3. **Resources → Advanced** (tùy chỉnh nếu cần):
   - Memory: tối thiểu 4GB (khuyến nghị 8GB+)
   - CPUs: tối thiểu 2 (khuyến nghị 4+)

4. Bấm **Apply & Restart**

### 1.4. Kiểm tra Docker

Mở **PowerShell** hoặc **Command Prompt** (không cần Administrator):

```powershell
docker --version
# Docker version 27.x.x, build xxxxx

docker ps
# CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES

docker run hello-world
# Hello from Docker!
```

> **Nếu `docker` command not found:** Đóng và mở lại terminal. Nếu vẫn không được, kiểm tra Docker Desktop đang chạy (icon xanh ở system tray).

---

## Phần 2: Cài đặt Node.js

### Option A: Tải trực tiếp (Đơn giản nhất)

1. Truy cập https://nodejs.org/
2. Tải phiên bản **LTS** (20.x hoặc mới hơn)
3. Chạy installer → chọn tất cả mặc định → **Next** đến hết
4. Mở terminal mới và kiểm tra:

```powershell
node --version
# v20.x.x

npm --version
# 10.x.x
```

### Option B: Dùng nvm-windows (Quản lý nhiều phiên bản)

1. Tải nvm-windows từ: https://github.com/coreybutler/nvm-windows/releases
2. Cài đặt
3. Mở terminal mới:

```powershell
nvm install 20
nvm use 20
node --version
```

---

## Phần 3: Setup Agent

### 3.1. Lấy source code

**Cách 1: Clone từ Git**
```powershell
cd D:\
git clone <repo-url> alpha-studio
cd D:\alpha-studio\alpha-studio-host-agent
```

**Cách 2: Copy thủ công**
- Copy folder `alpha-studio-host-agent` vào vị trí bạn muốn (ví dụ: `D:\alpha-studio-host-agent`)

### 3.2. Cài dependencies

```powershell
cd D:\alpha-studio\alpha-studio-host-agent
npm install
```

### 3.3. Build Docker Desktop Image

```powershell
cd D:\alpha-studio\alpha-studio-host-agent

# Build image (lần đầu mất 5-15 phút tùy tốc độ mạng)
docker build -f Dockerfile.desktop -t alpha-desktop:latest .

# Kiểm tra image đã build
docker images | findstr alpha-desktop
# alpha-desktop    latest    xxxxxxxx    ~2.5GB
```

> **Lưu ý:** Quá trình build tải các package Ubuntu (~2.5GB). Đảm bảo mạng ổn định.
>
> **Nếu build lỗi:**
> - Kiểm tra Docker Desktop đang chạy (icon xanh ở system tray)
> - Thử restart Docker Desktop
> - Đảm bảo ổ đĩa còn ít nhất 10GB trống

### 3.4. Cấu hình Environment

```powershell
cd D:\alpha-studio\alpha-studio-host-agent

# Copy template
copy .env.example .env

# Mở bằng Notepad để chỉnh sửa
notepad .env
```

Nội dung `.env`:

```env
# Port mà agent lắng nghe (Backend sẽ gọi vào đây)
PORT=4000

# Secret key — PHẢI khớp với secret khi đăng ký máy trong Admin Panel
# Tạo secret ngẫu nhiên (chạy trong PowerShell):
#   [System.Guid]::NewGuid().ToString() + [System.Guid]::NewGuid().ToString()
# Hoặc đặt bất kỳ chuỗi nào đủ dài
AGENT_SECRET=your-secret-key-here

# URL của Backend API
# Nếu Backend chạy trên cùng máy:
BACKEND_URL=http://localhost:3001/api
# Nếu Backend chạy trên máy khác hoặc cloud:
# BACKEND_URL=https://alpha-studio-backend.onrender.com/api

# ID duy nhất cho máy này — PHẢI khớp với machineId khi đăng ký trong Admin
MACHINE_ID=win-pc-01

# IP mà client (trình duyệt) sẽ dùng để truy cập noVNC
# Xem bảng hướng dẫn chọn HOST_IP bên dưới
HOST_IP=localhost
```

#### Cách chọn HOST_IP đúng

| Tình huống | HOST_IP | Cách kiểm tra |
|-----------|---------|---------------|
| Tất cả chạy trên 1 máy (dev) | `localhost` | — |
| Client và Agent cùng mạng LAN | IP LAN của máy (ví dụ `192.168.1.20`) | `ipconfig` → IPv4 Address |
| Client truy cập từ Internet | IP public | Truy cập https://whatismyip.com |
| Dùng port forwarding qua router | IP public + cấu hình trên router | Xem [Phần 8](#phần-8-mạng--firewall-trên-windows) |

**Xem IP LAN** (PowerShell):
```powershell
ipconfig | findstr "IPv4"
# IPv4 Address. . . . . . . . . . . : 192.168.1.20
```

### 3.5. Chạy thử

```powershell
cd D:\alpha-studio\alpha-studio-host-agent
node src/index.js
```

Bạn sẽ thấy:
```
Alpha Studio Host Agent
  Machine ID: win-pc-01
  Port: 4000
  Backend: http://localhost:3001/api
  Host IP: localhost
```

Sau 5 giây sẽ có log heartbeat:
```
[Heartbeat] Failed: fetch failed
```
> Đây là bình thường nếu Backend chưa chạy hoặc máy chưa đăng ký trong Admin Panel.

Nhấn `Ctrl+C` để dừng.

---

## Phần 4: Đăng ký máy trong Admin Panel

**Bước này BẮT BUỘC trước khi Agent có thể gửi heartbeat thành công.**

### 4.1. Đăng nhập Admin

1. Truy cập website Alpha Studio (ví dụ: http://localhost:5173 hoặc URL production)
2. Đăng nhập tài khoản **admin**

### 4.2. Vào trang quản lý Cloud Desktop

1. Click menu **Admin** (hoặc truy cập `/admin`)
2. Chọn tab **"Cloud Desktop"**
3. Đang ở sub-tab **"Máy chủ"**

### 4.3. Đăng ký máy mới

Bấm **"+ Đăng ký máy"** và điền:

| Field | Giá trị ví dụ | Lưu ý |
|-------|--------------|-------|
| Tên máy | `PC Windows Phòng Lab` | Tên hiển thị, đặt tùy ý |
| Machine ID | `win-pc-01` | **PHẢI KHỚP** với `MACHINE_ID` trong `.env` |
| Agent URL | `http://192.168.1.20:4000` | URL mà Backend gọi đến Agent. Nếu cùng máy: `http://localhost:4000` |
| Secret Key | `your-secret-key-here` | **PHẢI KHỚP** với `AGENT_SECRET` trong `.env` |
| CPU | `Intel Core i7-13700` | Thông tin hiển thị (Agent tự cập nhật qua heartbeat) |
| RAM | `16GB` | Thông tin hiển thị |
| GPU | `NVIDIA RTX 4060 8GB` | Thông tin hiển thị |
| Max Containers | `3` | Số container tối đa (khuyến nghị: (RAM - 4GB) / 4GB) |

Bấm **"Lưu"**.

### 4.4. Xác minh kết nối

1. Đảm bảo Agent đang chạy (`node src/index.js`)
2. Đợi 30 giây (1 chu kỳ heartbeat)
3. Refresh trang Admin
4. Kiểm tra:
   - **Status**: Chuyển sang **"Khả dụng"** (xanh lá) ✅
   - **Last Ping**: Hiện thời gian gần đây (ví dụ "5s ago")
   - **Containers**: Hiện `0 / 3`
   - Console Agent hiện: `[Heartbeat] status=available, containers=0`

---

## Phần 5: Kiểm tra & Xác minh

### 5.1. Checklist sau cài đặt

Chạy từng lệnh trong **PowerShell**:

```powershell
# 1. Docker hoạt động
docker ps
# → Không lỗi

# 2. Image đã build
docker images | findstr alpha-desktop
# → alpha-desktop   latest   xxxxxxxx   ~2.5GB

# 3. Agent health check (mở terminal khác trong khi agent đang chạy)
curl http://localhost:4000/api/health
# → {"success":true,"message":"Host agent is running","machineId":"win-pc-01",...}
```

> **Lưu ý:** `curl` có sẵn trên Windows 10 build 17063+. Nếu không có, dùng trình duyệt truy cập `http://localhost:4000/api/health`.

### 5.2. Test tạo container thủ công

```powershell
# Tạo container thử
curl -X POST http://localhost:4000/api/sessions/create -H "Content-Type: application/json" -H "x-agent-secret: your-secret-key-here" -d "{\"userId\":\"test\"}"
# → {"success":true,"data":{"containerId":"abc123...","noVncUrl":"http://localhost:6080/vnc.html?..."}}

# Kiểm tra container đang chạy
docker ps --filter "name=desktop-"
# → 1 container

# Mở noVNC: copy URL từ kết quả trên → dán vào trình duyệt → thấy desktop Ubuntu

# Xóa container thử
curl -X POST http://localhost:4000/api/sessions/abc123.../destroy -H "Content-Type: application/json" -H "x-agent-secret: your-secret-key-here"
# → {"success":true,"message":"Container destroyed"}
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

## Phần 6: Chạy Agent như Windows Service

Để Agent tự động chạy khi Windows khởi động (không cần đăng nhập), có 3 cách:

### Option A: PM2 + pm2-windows-startup (Khuyến nghị)

```powershell
# Cài PM2 globally
npm install -g pm2

# Cài module Windows startup
npm install -g pm2-windows-startup

# Chạy agent qua PM2
cd D:\alpha-studio\alpha-studio-host-agent
pm2 start src/index.js --name "host-agent"

# Kiểm tra
pm2 status
pm2 logs host-agent

# Cấu hình tự khởi động cùng Windows
pm2-startup install
pm2 save

# Các lệnh quản lý
pm2 restart host-agent    # Restart
pm2 stop host-agent       # Dừng
pm2 delete host-agent     # Xóa khỏi PM2
pm2 logs host-agent       # Xem log
```

### Option B: NSSM (Non-Sucking Service Manager)

NSSM cho phép chạy bất kỳ ứng dụng nào như Windows Service.

1. **Tải NSSM:** https://nssm.cc/download
2. **Giải nén** vào `C:\nssm\` (hoặc vị trí khác)
3. **Mở PowerShell (Administrator):**

```powershell
# Cài đặt service
C:\nssm\win64\nssm.exe install AlphaHostAgent

# Cửa sổ GUI sẽ mở ra, điền:
#   Path:              C:\Program Files\nodejs\node.exe
#   Startup directory: D:\alpha-studio\alpha-studio-host-agent
#   Arguments:         src\index.js

# Hoặc cài bằng command line:
C:\nssm\win64\nssm.exe install AlphaHostAgent "C:\Program Files\nodejs\node.exe" "src\index.js"
C:\nssm\win64\nssm.exe set AlphaHostAgent AppDirectory "D:\alpha-studio\alpha-studio-host-agent"
C:\nssm\win64\nssm.exe set AlphaHostAgent Description "Alpha Studio Host Agent - Docker Container Manager"
C:\nssm\win64\nssm.exe set AlphaHostAgent Start SERVICE_AUTO_START

# Cấu hình log output
C:\nssm\win64\nssm.exe set AlphaHostAgent AppStdout "D:\alpha-studio\alpha-studio-host-agent\logs\service.log"
C:\nssm\win64\nssm.exe set AlphaHostAgent AppStderr "D:\alpha-studio\alpha-studio-host-agent\logs\error.log"
C:\nssm\win64\nssm.exe set AlphaHostAgent AppRotateFiles 1
C:\nssm\win64\nssm.exe set AlphaHostAgent AppRotateBytes 5000000

# Đảm bảo service phụ thuộc Docker Desktop
C:\nssm\win64\nssm.exe set AlphaHostAgent DependOnService "com.docker.service"

# Khởi động service
C:\nssm\win64\nssm.exe start AlphaHostAgent
```

Tạo thư mục logs trước:
```powershell
mkdir D:\alpha-studio\alpha-studio-host-agent\logs
```

Quản lý service:
```powershell
# Kiểm tra trạng thái
C:\nssm\win64\nssm.exe status AlphaHostAgent

# Dừng
C:\nssm\win64\nssm.exe stop AlphaHostAgent

# Restart
C:\nssm\win64\nssm.exe restart AlphaHostAgent

# Xóa service
C:\nssm\win64\nssm.exe remove AlphaHostAgent confirm
```

Hoặc dùng Windows Services GUI: `services.msc` → tìm "AlphaHostAgent".

### Option C: Task Scheduler (Đơn giản nhất, không cần cài thêm)

1. Mở **Task Scheduler** (tìm "Task Scheduler" trong Start Menu)
2. Bấm **Create Task** (không phải Create Basic Task)
3. Tab **General**:
   - Name: `Alpha Host Agent`
   - ✅ "Run whether user is logged on or not"
   - ✅ "Run with highest privileges"
4. Tab **Triggers**:
   - New → Begin the task: **At startup**
   - Delay task for: **30 seconds** (đợi Docker Desktop khởi động)
5. Tab **Actions**:
   - New → Action: Start a program
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `src\index.js`
   - Start in: `D:\alpha-studio\alpha-studio-host-agent`
6. Tab **Settings**:
   - ✅ "If the task fails, restart every 1 minute"
   - "Attempt to restart up to: 999 times"
   - ❌ "Stop the task if it runs longer than" → **BỎ CHỌN**
7. Bấm **OK** → Nhập mật khẩu Windows

> **Lưu ý Task Scheduler:** Không có log tự động. Để xem output, đổi action thành script `.bat`:
> ```bat
> @echo off
> cd /d D:\alpha-studio\alpha-studio-host-agent
> node src\index.js >> logs\agent.log 2>&1
> ```

---

## Phần 7: Bảo trì & Vận hành

### Cập nhật Agent code

```powershell
cd D:\alpha-studio\alpha-studio-host-agent

# Pull code mới (nếu dùng git)
git pull

# Cài lại dependencies nếu package.json thay đổi
npm install

# Restart agent
pm2 restart host-agent
# hoặc
C:\nssm\win64\nssm.exe restart AlphaHostAgent
```

### Rebuild Docker Image

Khi `Dockerfile.desktop` hoặc `startup.sh` thay đổi:

```powershell
cd D:\alpha-studio\alpha-studio-host-agent

# Build lại
docker build -f Dockerfile.desktop -t alpha-desktop:latest .

# Container mới sẽ dùng image mới
# Container cũ đang chạy KHÔNG bị ảnh hưởng
```

### Dọn dẹp container rác

Nếu agent bị crash hoặc container không được xóa đúng cách:

```powershell
# Xem tất cả container desktop (kể cả đã dừng)
docker ps -a --filter "name=desktop-"

# Xóa tất cả container desktop
# PowerShell:
docker ps -a --filter "name=desktop-" -q | ForEach-Object { docker rm -f $_ }

# Hoặc CMD:
for /f %i in ('docker ps -a --filter "name=desktop-" -q') do docker rm -f %i

# Dọn dẹp Docker resources không dùng
docker system prune -f
```

### Xem log

```powershell
# PM2
pm2 logs host-agent --lines 50

# NSSM (xem file log)
Get-Content D:\alpha-studio\alpha-studio-host-agent\logs\service.log -Tail 50

# Log realtime
Get-Content D:\alpha-studio\alpha-studio-host-agent\logs\service.log -Wait

# Log của container cụ thể
docker logs <container-id>
```

### Kiểm tra tài nguyên

```powershell
# Xem Docker sử dụng bao nhiêu tài nguyên
docker stats

# Xem tổng quan disk
docker system df
```

---

## Phần 8: Mạng & Firewall trên Windows

### 8.1. Windows Firewall — Mở port cho Agent

Mở **PowerShell (Administrator)**:

```powershell
# Mở port 4000 (Agent API - Backend gọi vào)
New-NetFirewallRule -DisplayName "Alpha Host Agent" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow

# Mở port range 6080-6999 (noVNC - Client truy cập)
New-NetFirewallRule -DisplayName "Alpha Desktop noVNC" -Direction Inbound -Protocol TCP -LocalPort 6080-6999 -Action Allow
```

Hoặc mở qua GUI:
1. Tìm **"Windows Defender Firewall with Advanced Security"** trong Start Menu
2. Click **Inbound Rules** → **New Rule**
3. Rule Type: **Port** → TCP → Specific ports: `4000` → Allow → Đặt tên
4. Lặp lại cho port `6080-6999`

### 8.2. Kiểm tra port đã mở

```powershell
# Kiểm tra agent đang listen
netstat -an | findstr "4000"
# TCP    0.0.0.0:4000    0.0.0.0:0    LISTENING

# Kiểm tra port noVNC (khi có container đang chạy)
netstat -an | findstr "6080"
```

### 8.3. Truy cập từ máy khác trong mạng LAN

1. Xem IP LAN:
```powershell
ipconfig | findstr "IPv4"
# Ví dụ: 192.168.1.20
```

2. Cấu hình `.env`:
```env
HOST_IP=192.168.1.20
```

3. Đăng ký trong Admin Panel:
   - Agent URL: `http://192.168.1.20:4000`

4. Từ máy khác trong LAN, test:
```
http://192.168.1.20:4000/api/health
```

### 8.4. Truy cập từ Internet (Port Forwarding)

Nếu client cần truy cập từ ngoài mạng LAN:

1. **Vào router** (thường `192.168.1.1`)
2. Tìm mục **Port Forwarding** / **NAT** / **Virtual Server**
3. Thêm rules:

| Tên | Port ngoài | Port trong | IP trong | Protocol |
|-----|-----------|-----------|----------|----------|
| Agent API | 4000 | 4000 | 192.168.1.20 | TCP |
| noVNC 1 | 6080 | 6080 | 192.168.1.20 | TCP |
| noVNC 2 | 6081 | 6081 | 192.168.1.20 | TCP |
| ... | ... | ... | ... | ... |
| noVNC N | 6089 | 6089 | 192.168.1.20 | TCP |

> **Tip:** Chỉ forward số port noVNC bằng số max container. Ví dụ max 3 container → forward 6080-6082.

4. Cấu hình `.env`:
```env
# IP public (kiểm tra tại https://whatismyip.com)
HOST_IP=203.0.113.50
```

5. Đăng ký trong Admin Panel:
   - Agent URL: `http://203.0.113.50:4000`

> **Lưu ý bảo mật:** Khi mở port ra Internet, hãy đảm bảo:
> - `AGENT_SECRET` đủ mạnh (32+ ký tự ngẫu nhiên)
> - Cân nhắc dùng VPN hoặc Cloudflare Tunnel thay vì mở port trực tiếp

---

## Troubleshooting

### Docker Desktop không khởi động

**Lỗi: "WSL 2 is not installed"**
```powershell
# Mở PowerShell (Administrator)
wsl --install
# Khởi động lại máy
```

**Lỗi: "Hardware assisted virtualization is not enabled"**
→ Cần bật **Virtualization** trong BIOS:
1. Khởi động lại → vào BIOS (thường nhấn F2, F12, hoặc Delete)
2. Tìm **Intel VT-x** hoặc **AMD-V** → Enable
3. Lưu và khởi động lại

**Lỗi: Docker icon xoay mãi không khởi động**
```powershell
# Restart Docker service
Restart-Service *docker*

# Hoặc tắt và mở lại Docker Desktop
```

---

### Agent khởi động lỗi

**Lỗi: `Missing required env vars`**
→ Kiểm tra file `.env` có tồn tại và đầy đủ 3 biến bắt buộc: `AGENT_SECRET`, `BACKEND_URL`, `MACHINE_ID`.

**Lỗi: `docker: command not found` hoặc `'docker' is not recognized`**
→ Docker Desktop chưa chạy hoặc chưa thêm vào PATH:
1. Mở Docker Desktop, đợi đến khi icon xanh
2. Mở terminal **mới** (đóng terminal cũ)
3. Thử lại `docker ps`

---

### Heartbeat thất bại

**Lỗi: `[Heartbeat] Failed: fetch failed`**
→ Backend không truy cập được:
```powershell
# Kiểm tra backend
curl http://localhost:3001/api/health
# Hoặc mở trong trình duyệt
```

**Lỗi: `[Heartbeat] Failed: 404`**
→ Machine chưa được đăng ký trong Admin Panel. Xem [Phần 4](#phần-4-đăng-ký-máy-trong-admin-panel).

**Lỗi: `[Heartbeat] Failed: 403`**
→ `AGENT_SECRET` trong `.env` không khớp với secret đăng ký trong Admin. Kiểm tra lại cả 2 nơi.

---

### Docker build lỗi

**Lỗi: `error during connect: ... The system cannot find the file specified`**
→ Docker Desktop chưa chạy. Mở Docker Desktop và đợi icon xanh.

**Lỗi: Build quá chậm hoặc timeout**
→ Do tải packages từ internet. Kiểm tra kết nối mạng và thử lại.

**Lỗi: `no space left on device`**
→ Ổ đĩa hết dung lượng hoặc Docker virtual disk đầy:
```powershell
# Dọn dẹp Docker
docker system prune -a

# Kiểm tra dung lượng Docker
docker system df
```

---

### Container tạo lỗi

**Lỗi: `No free ports available`**
→ Đã dùng hết port 6080-6999:
```powershell
docker ps --filter "name=desktop-"
# Xóa bớt container không dùng
```

**Lỗi: `port is already allocated`**
→ Port đang bị chiếm bởi ứng dụng khác:
```powershell
# Kiểm tra ai đang dùng port
netstat -ano | findstr "6080"
# Cột cuối là PID, tìm ứng dụng:
tasklist | findstr "<PID>"
```

---

### noVNC không hiện desktop

**Trình duyệt hiện "Unable to connect"**
1. Kiểm tra container đang chạy: `docker ps --filter "name=desktop-"`
2. Kiểm tra port mapping: `docker port <container-id>`
3. Kiểm tra firewall đã mở port (xem [Phần 8](#phần-8-mạng--firewall-trên-windows))
4. Kiểm tra HOST_IP đúng

**Trình duyệt hiện trang trắng hoặc loading mãi**
→ VNC server trong container chưa sẵn sàng. Đợi 5-10 giây rồi refresh.

**Kiểm tra bên trong container:**
```powershell
# Vào shell container
docker exec -it <container-id> bash

# Kiểm tra processes
ps aux | grep vnc
ps aux | grep websockify
```

---

### Máy hiện "Ngoại tuyến" trong Admin

| Nguyên nhân | Kiểm tra |
|-------------|----------|
| Agent chưa chạy | `curl http://localhost:4000/api/health` |
| MACHINE_ID không khớp | So sánh `.env` với Admin Panel |
| AGENT_SECRET không khớp | So sánh `.env` với Admin Panel |
| Backend không nhận được heartbeat | Kiểm tra `BACKEND_URL` trong `.env` |
| Firewall chặn | Xem [Phần 8](#phần-8-mạng--firewall-trên-windows) |

---

## Tóm tắt nhanh

```powershell
# === SETUP LẦN ĐẦU ===
# 1. Cài Docker Desktop (bật WSL2)
# 2. Cài Node.js LTS
# 3. cd alpha-studio-host-agent
# 4. npm install
# 5. docker build -f Dockerfile.desktop -t alpha-desktop:latest .
# 6. copy .env.example .env → chỉnh sửa
# 7. Đăng ký máy trong Admin Panel (MACHINE_ID + AGENT_SECRET phải khớp)
# 8. node src/index.js (test) hoặc pm2 start src/index.js --name host-agent

# === KIỂM TRA ===
# curl http://localhost:4000/api/health
# Admin Panel → Cloud Desktop → Machines → Status = "Khả dụng"

# === CHẠY HÀNG NGÀY ===
# Docker Desktop tự khởi động cùng Windows (nếu đã bật setting)
# Agent tự khởi động nếu dùng PM2/NSSM/Task Scheduler
```
