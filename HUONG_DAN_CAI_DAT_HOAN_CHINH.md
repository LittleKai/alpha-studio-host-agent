# Hướng dẫn cài đặt hoàn chỉnh — Alpha Studio Host Agent
# (Nhiều máy, mạng VNPT, remote từ Windows)

---

## Tổng quan luồng cài đặt

```
[Mỗi máy Ubuntu]
Bước 1-4: Cài Ubuntu Server          ← Cần làm TRỰC TIẾP tại máy
Bước 5:   Setup remote access         ← Cần làm TRỰC TIẾP tại máy (1 lần duy nhất)
          ↓
          Từ đây làm hoàn toàn qua SSH từ Windows
          ↓
Bước 6:   Cài Docker
Bước 7:   Cài Node.js
Bước 8:   Deploy Host Agent
Bước 9:   Cấu hình systemd
Bước 10:  Build Docker Image
Bước 11:  Đăng ký máy trong Admin Panel
```

> Mỗi máy chỉ cần ra trực tiếp 1 lần duy nhất (Bước 1-5). Sau đó quản lý hoàn toàn từ xa.

---

## Chuẩn bị trước khi bắt đầu

Ghi lại thông tin cho từng máy sẽ cài:

| Máy | Machine ID | IP LAN (điền sau) | Ghi chú |
|-----|-----------|------------------|---------|
| Máy 1 | machine-01 | 192.168.1.??? | |
| Máy 2 | machine-02 | 192.168.1.??? | |
| Máy 3 | machine-03 | 192.168.1.??? | |

---

## ═══ PHẦN 1: CÀI UBUNTU (Làm trực tiếp tại máy) ═══

---

## Bước 1: Tải ISO Ubuntu Server 22.04 LTS

Tải tại: https://ubuntu.com/download/server

Chọn **Ubuntu Server 22.04.x LTS** → Download

---

## Bước 2: Tạo USB Boot

Dùng **Rufus** (Windows):
1. Tải Rufus: https://rufus.ie
2. Cắm USB ≥ 8GB
3. Mở Rufus → chọn ISO vừa tải
4. Partition scheme: **GPT** (máy UEFI) hoặc **MBR** (Legacy BIOS)
5. Click Start → chờ xong

---

## Bước 3: Boot từ USB

1. Cắm USB vào máy Agent
2. Khởi động máy → bấm phím boot menu (thường **F2**, **F12**, **Del**, hoặc **Esc** tùy hãng)
3. Chọn boot từ USB

---

## Bước 4: Cài Ubuntu Server

### 4.1 — Language & Keyboard
- Language: **English**
- Keyboard: **English (US)**

### 4.2 — Network
- Nếu có DHCP: tự động lấy IP (dùng tạm, sẽ đặt tĩnh sau)
- Nếu cần IP tĩnh ngay: Edit IPv4 → Manual → điền Subnet, Address, Gateway, DNS (8.8.8.8)

### 4.3 — Storage
- Chọn **Use entire disk**
- Bỏ chọn LVM nếu không cần
- Confirm → Done

### 4.4 — Profile Setup

```
Your name:    alpha
Server name:  alpha-host-01   ← đổi số theo thứ tự máy (01, 02, 03...)
Username:     alpha
Password:     [đặt mật khẩu mạnh, ghi lại]
```

### 4.5 — SSH (BẮT BUỘC)
- **Tick: Install OpenSSH server** ✅
- Bắt buộc — cần để remote sau này

### 4.6 — Snap packages
- Bỏ qua hết → Done

### 4.7 — Hoàn tất
- Chờ cài xong → **Reboot Now**
- Rút USB khi máy khởi động lại
- Đăng nhập bằng `alpha` / password vừa đặt

---

## Bước 5: Setup Remote Access (Tailscale) — Làm trực tiếp tại máy

> Đây là bước quan trọng nhất. Sau bước này bạn không cần ra máy nữa.

### 5.1 — Cập nhật hệ thống trước

```bash
sudo apt update && sudo apt upgrade -y
```

### 5.2 — Ghi lại IP LAN và MAC của máy

```bash
# IP LAN
hostname -I

# MAC address
ip link show | grep "link/ether"
```

Ghi vào bảng ở phần "Chuẩn bị" bên trên.

### 5.3 — Cài Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Sẽ hiện link dạng:
```
To authenticate, visit: https://login.tailscale.com/a/xxxxxx
```

Mở link đó trên **điện thoại** hoặc máy khác → đăng nhập tài khoản Tailscale → xong.

### 5.4 — Lấy IP Tailscale

```bash
tailscale ip -4
# Ví dụ: 100.64.1.10
```

Ghi lại IP Tailscale này — dùng để SSH từ Windows.

### 5.5 — Bật SSH qua Tailscale

```bash
sudo tailscale up --ssh
```

> Lặp lại Bước 5 cho từng máy. Mỗi máy sẽ có 1 IP Tailscale khác nhau.

---

## ═══ PHẦN 2: CÀI ĐẶT QUA SSH TỪ WINDOWS ═══

> Từ đây, tất cả thao tác làm từ xa. Không cần ra máy nữa.

---

## Cài Tailscale trên Windows (1 lần duy nhất)

Tải tại: https://tailscale.com/download/windows

Cài xong → đăng nhập **cùng tài khoản Tailscale** → Windows join cùng mạng.

---

## SSH vào máy từ Windows

Mở **PowerShell** hoặc **Windows Terminal**:

```bash
# Máy 1
ssh alpha@100.64.1.10

# Máy 2
ssh alpha@100.64.1.11

# Máy 3
ssh alpha@100.64.1.12
```

Dùng port 22 bình thường, không cần port đặc biệt.

> **Tip:** Lưu SSH config để gõ nhanh hơn.
> Tạo file `C:\Users\<tên>\\.ssh\config`:
> ```
> Host machine-01
>     HostName 100.64.1.10
>     User alpha
>
> Host machine-02
>     HostName 100.64.1.11
>     User alpha
> ```
> Sau đó chỉ cần gõ: `ssh machine-01`

---

## Bước 6: Cài Docker

```bash
# Cài dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Thêm Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Thêm Docker repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Cho phép user alpha chạy Docker không cần sudo
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra
docker --version
docker run hello-world
```

---

## Bước 7: Cài Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Kiểm tra
node --version   # v20.x.x
npm --version
```

---

## Bước 8: Deploy Host Agent

```bash
# Clone code về máy
git clone https://github.com/LittleKai/alpha-studio-host-agent /opt/alpha-agent
cd /opt/alpha-agent

# Cài dependencies
sudo npm install

# Tạo file .env
sudo cp .env.example .env
sudo nano .env
```

Điền vào `.env` (thay đổi theo từng máy):

```env
PORT=4000
AGENT_SECRET=y68glk
BACKEND_URL=https://alpha-studio-backend.fly.dev/api
MACHINE_ID=machine-01          ← đổi theo máy: machine-01, machine-02...
HOST_IP=100.64.1.10            ← IP Tailscale của máy này
```

> **Lưu ý HOST_IP:** Dùng IP Tailscale để noVNC URL hoạt động trong cùng mạng Tailscale.
> Nếu student truy cập từ ngoài mạng → cần giải pháp khác (xem Phần 3).

---

## Bước 9: Cấu hình systemd (tự động chạy khi boot)

```bash
sudo nano /etc/systemd/system/alpha-agent.service
```

Dán nội dung sau:

```ini
[Unit]
Description=Alpha Studio Host Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=alpha
WorkingDirectory=/opt/alpha-agent
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/alpha-agent/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable alpha-agent
sudo systemctl start alpha-agent

# Kiểm tra
sudo systemctl status alpha-agent
```

---

## Bước 10: Build Desktop Docker Image

```bash
cd /opt/alpha-agent
docker build -f Dockerfile.desktop -t alpha-desktop:latest .
```

> Lần đầu mất **10-20 phút**. Chạy xong kiểm tra:

```bash
docker images | grep alpha-desktop
```

---

## Bước 11: Đăng ký máy trong Admin Panel

1. Đăng nhập Frontend → Admin → Tab **Cloud / Máy chủ**
2. Thêm máy mới:

| Trường | Giá trị |
|--------|---------|
| Machine ID | `machine-01` (khớp với `.env`) |
| Agent URL | `http://100.64.1.10:4000` (IP Tailscale + port 4000) |
| Agent Secret | `y68glk` (khớp với `.env`) |

3. Lưu lại → kiểm tra trạng thái máy chuyển sang **Khả dụng**

---

## Kiểm tra cuối cùng

```bash
# Trên máy Ubuntu (qua SSH)
sudo systemctl status alpha-agent
docker images | grep alpha-desktop
curl http://localhost:4000/api/health
```

Kết quả mong đợi:
```json
{ "success": true, "status": "online" }
```

---

## ═══ PHẦN 3: BACKEND FLY.IO TRUY CẬP AGENT ═══

Backend trên Fly.io cần gọi vào Agent URL. Có 2 cách:

### Cách 1: Cài Tailscale trên Fly.io (khuyến nghị)

```bash
# SSH vào Fly.io app
fly ssh console -a alpha-studio-backend

# Trong console
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=<auth-key> --hostname=fly-backend
```

Lấy Auth Key tại: Tailscale Admin → Settings → Keys → Generate auth key (reusable)

Sau đó Agent URL dùng IP Tailscale: `http://100.64.1.10:4000`

### Cách 2: Port Forwarding trên Router VNPT

Nếu không muốn cài Tailscale trên Fly.io, mở port agent ra ngoài:

Vào router VNPT `http://192.168.1.1` → Port Forwarding:

| Rule | External Port | Internal IP | Internal Port |
|------|--------------|------------|--------------|
| Agent máy 1 | 4001 | 192.168.1.101 | 4000 |
| Agent máy 2 | 4002 | 192.168.1.102 | 4000 |
| Agent máy 3 | 4003 | 192.168.1.103 | 4000 |

Cập nhật Agent URL trong Admin Panel:
- machine-01: `http://113.189.107.63:4001`
- machine-02: `http://113.189.107.63:4002`
- machine-03: `http://113.189.107.63:4003`

---

## Checklist cho mỗi máy

- [ ] Ubuntu Server 22.04 đã cài
- [ ] SSH hoạt động (qua Tailscale)
- [ ] Docker chạy được (`docker run hello-world`)
- [ ] Node.js 20 đã cài (`node --version`)
- [ ] `.env` đã điền đúng (MACHINE_ID, HOST_IP, AGENT_SECRET)
- [ ] `alpha-agent` service chạy tự động (`systemctl status alpha-agent`)
- [ ] `alpha-desktop:latest` image đã build (`docker images`)
- [ ] Máy đã đăng ký trong Admin Panel, trạng thái Khả dụng
- [ ] Backend có thể gọi vào Agent URL → health check OK

---

## Thông tin các máy đang triển khai

| Máy | Machine ID | IP Tailscale | Agent Secret | Trạng thái |
|-----|-----------|-------------|-------------|-----------|
| Máy 1 | machine-01 | 100.64.1.10 | y68glk | Đang chạy |
| Máy 2 | machine-02 | | | Chưa cài |
| Máy 3 | machine-03 | | | Chưa cài |
