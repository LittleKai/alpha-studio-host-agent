# Fix: Agent không kết nối được — VNPT Port Forwarding

## Triệu chứng
- Admin Panel hiển thị máy "Khả dụng" (heartbeat OK)
- Nhưng khi kết nối: `502 - Host agent unreachable`
- SSH từ Windows vào Ubuntu cũng timeout
- Backend (Fly.io) không gọi vào được `http://113.189.107.63:4000`

## Nguyên nhân
Router VNPT chưa forward port ra ngoài. Backend gọi vào IP public nhưng bị chặn tại router.

---

## Cách 1: Port Forwarding trên Router VNPT (Cố định)

### Bước 1: Vào trang quản trị router VNPT
```
Trình duyệt → http://192.168.1.1
```
Tài khoản mặc định VNPT:
- Username: `admin` | Password: `admin`
- Username: `user` | Password: `user`
- Hoặc xem nhãn dưới đáy modem

### Bước 2: Lấy IP LAN của máy Ubuntu
Ra trực tiếp máy Ubuntu, chạy:
```bash
hostname -I
```
Ghi lại IP, ví dụ: `192.168.1.105`

### Bước 3: Đặt IP tĩnh cho máy Ubuntu (tránh IP bị đổi sau khi restart)
Trên router VNPT → DHCP → Address Reservation (hoặc Static IP):
- MAC Address: lấy bằng `ip link show` trên Ubuntu
- IP: `192.168.1.105` (IP vừa lấy)

### Bước 4: Thêm Port Forwarding
Tìm mục: **Port Forwarding** / **Virtual Server** / **NAT** / **Applications**

Thêm 2 rule:

| Tên       | External Port | Internal Port | Internal IP     | Protocol |
|-----------|--------------|--------------|-----------------|---------|
| SSH       | 22           | 22           | 192.168.1.105   | TCP      |
| AlphaAgent| 4000         | 4000         | 192.168.1.105   | TCP      |

### Bước 5: Kiểm tra
```bash
# Từ Windows PowerShell
ssh alpha@113.189.107.63

# Hoặc test health check
curl http://113.189.107.63:4000/api/health
```

---

## Cách 2: Cloudflare Tunnel (Không cần Port Forwarding)

Dùng khi không quản lý được router (thuê nhà, tòa nhà văn phòng...).

### Trên máy Ubuntu:
```bash
# Tải cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Chạy tunnel tạm thời (test)
cloudflared tunnel --url http://localhost:4000
```

Sẽ sinh URL dạng: `https://abc-def-ghi.trycloudflare.com`

### Cập nhật Admin Panel:
- Vào Admin → Cloud → Sửa machine-01
- **Agent URL:** `https://abc-def-ghi.trycloudflare.com`

### Chạy tự động khi boot (systemd):
```bash
sudo nano /etc/systemd/system/cloudflared-agent.service
```

```ini
[Unit]
Description=Cloudflare Tunnel for Alpha Agent
After=network.target

[Service]
Type=simple
User=alpha
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:4000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-agent
sudo systemctl start cloudflared-agent
```

> Lưu ý: URL của Cloudflare Tunnel thay đổi mỗi lần restart nếu dùng free tunnel.
> Để URL cố định cần tạo Named Tunnel (có tài khoản Cloudflare).

---

## Cách 3: Ngrok (Nhanh nhất để test)

```bash
# Cài ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Đăng ký tài khoản ngrok.com → lấy authtoken
ngrok config add-authtoken <your-token>

# Chạy
ngrok http 4000
```

Sinh URL dạng: `https://xxxx.ngrok.io` → dùng làm Agent URL.

---

## Khuyến nghị

| Tình huống | Cách dùng |
|-----------|-----------|
| Quản lý được router VNPT | Cách 1 (Port Forwarding) — ổn định nhất |
| Không quản lý được router | Cách 2 (Cloudflare Tunnel) |
| Chỉ test nhanh | Cách 3 (Ngrok) |

---

## Sau khi fix xong — Kiểm tra lại

```bash
# Trên Ubuntu
sudo systemctl status alpha-agent
ss -tlnp | grep 4000

# Từ Windows
curl http://113.189.107.63:4000/api/health
# Kỳ vọng: { "success": true, "status": "online" }
```
