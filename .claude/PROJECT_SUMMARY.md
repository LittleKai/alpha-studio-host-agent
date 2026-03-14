# Project Summary - Host Agent
**Last Updated:** 2026-02-18 (Initial creation)
**Updated By:** Claude Code

---

## 1. Project Overview
- **Name:** Alpha Studio Host Agent
- **Type:** Docker container manager / agent service
- **Role:** Chạy trên mỗi máy chủ vật lý, quản lý Docker container (Ubuntu + XFCE + noVNC) cho tính năng Cloud Desktop
- **Tech Stack:**
  - Node.js 18+ (ES Modules)
  - Express.js 5.x
  - systeminformation (thu thập CPU/RAM/GPU)
  - Docker CLI (execSync)
- **Giao tiếp:**
  - Nhận lệnh từ Backend qua HTTP (tạo/xóa container)
  - Gửi heartbeat đến Backend mỗi 30s
  - Auth: `x-agent-secret` header (shared secret, không dùng JWT)

---

## 2. File Structure

```
alpha-studio-host-agent/
├── .claude/
│   ├── PROJECT_SUMMARY.md       # This file
│   └── history/                 # Change logs
├── src/
│   └── index.js                 # Server entry point (duy nhất 1 file code)
├── Dockerfile.desktop           # Docker image: Ubuntu 22.04 + XFCE + VNC + noVNC + Chrome
├── startup.sh                   # Script khởi động VNC + websockify trong container
├── package.json
├── .env.example
├── .gitignore
└── README.md                    # Hướng dẫn setup
```

---

## 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/sessions/create` | `x-agent-secret` | Tạo container mới, trả `{containerId, noVncUrl}` |
| `POST` | `/api/sessions/:containerId/destroy` | `x-agent-secret` | Stop + remove container |
| `GET` | `/api/health` | None | Health check, trả `{machineId, timestamp}` |

**Response format:** Giống Backend - `{ success: boolean, message?: string, data?: any }`

---

## 4. Cách hoạt động

### Container Lifecycle
```
Backend gọi POST /api/sessions/create
  → Agent tìm port trống (6080-6999)
  → docker run -d --name desktop-{timestamp} -p {port}:6080 alpha-desktop:latest
  → Đợi 3s cho VNC khởi động
  → Trả containerId + noVNC URL

Backend gọi POST /api/sessions/:id/destroy
  → docker stop {id} → docker rm {id}
  → Giải phóng port
```

### Heartbeat (30s interval)
```
Mỗi 30 giây:
  → Thu thập CPU/RAM/GPU qua systeminformation
  → Đếm container đang chạy: docker ps --filter "name=desktop-"
  → POST đến Backend /api/cloud/heartbeat với:
    { machineId, status, currentContainers, specs }
```

### Docker Container Specs
- Image: `alpha-desktop:latest` (build từ Dockerfile.desktop)
- Resources per container: 2 CPU, 4GB RAM, 512MB shared memory
- Port mapping: host {6080-6999} → container 6080 (noVNC)
- Nội dung: Ubuntu 22.04, XFCE4, x11vnc, noVNC/websockify, Chrome, Firefox, Python3

---

## 5. Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Agent HTTP port (default: 4000) | `4000` |
| `AGENT_SECRET` | **Yes** | Shared secret, phải khớp với Backend khi đăng ký máy | `my-secret-key` |
| `BACKEND_URL` | **Yes** | Backend API URL | `http://localhost:3001/api` |
| `MACHINE_ID` | **Yes** | ID máy, phải khớp với Backend khi đăng ký máy | `machine-01` |
| `HOST_IP` | No | IP mà client truy cập noVNC (default: localhost) | `192.168.1.100` |

---

## 6. Quan hệ với các project khác

```
Frontend (alpha-studio)
  └── User bấm "Kết nối" → gọi Backend

Backend (alpha-studio-backend)
  ├── Nhận request từ Frontend
  ├── Chọn máy khả dụng từ DB (HostMachine model)
  ├── Gọi Agent POST /api/sessions/create
  ├── Lưu CloudSession vào DB
  └── Nhận heartbeat từ Agent, cron kiểm tra offline

Host Agent (alpha-studio-host-agent) ← THIS
  ├── Nhận lệnh tạo/xóa container từ Backend
  ├── Quản lý Docker containers
  └── Gửi heartbeat (specs, container count) đến Backend
```

**Lưu ý:** Agent KHÔNG giao tiếp trực tiếp với Frontend. Frontend chỉ nhận noVNC URL từ Backend rồi mở trong tab mới.

---

## 7. Quick Commands
```bash
# Cài đặt
npm install

# Build Docker image (chỉ cần lần đầu)
docker build -f Dockerfile.desktop -t alpha-desktop:latest .

# Chạy dev (auto-reload)
npm run dev

# Chạy production
npm start

# Kiểm tra image đã build
docker images | grep alpha-desktop

# Xem container đang chạy
docker ps --filter "name=desktop-"

# Xóa tất cả container desktop (cleanup)
docker ps -a --filter "name=desktop-" -q | xargs -r docker rm -f
```

---

## 8. Recent Changes

1. **2026-02-18** - Initial creation
   - Express server với secret-based auth
   - Docker container management (create/destroy)
   - Heartbeat system (30s interval, systeminformation)
   - Dockerfile.desktop (Ubuntu 22.04 + XFCE + VNC + noVNC)
   - Port allocation (6080-6999)
