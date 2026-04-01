# Kế hoạch: Shared Chrome Profile — Học viên dùng chung tài khoản, không biết mật khẩu
# Trạng thái: PLAN — Chưa thực hiện
# Ngày tạo: 2026-03-15

---

## Yêu cầu

1. Tất cả học viên khi remote vào đều thấy Chrome **đã đăng nhập sẵn** vào các tài khoản định sẵn
2. Học viên **không thể biết mật khẩu** của các tài khoản đó
3. Học viên dùng **đồng thời** không ảnh hưởng nhau

---

## Nguyên lý hoạt động

Chrome lưu 2 thứ riêng biệt:
- **`Cookies`** — trạng thái "đang đăng nhập" (session token)
- **`Login Data`** — mật khẩu đã lưu

→ **Giải pháp:** Chỉ giữ `Cookies` (để học viên dùng được), xóa `Login Data` (để không ai thấy mật khẩu).

---

## Kiến trúc

```
Admin setup (1 lần):
  1. Tạo base profile → login tất cả tài khoản cần thiết
  2. Xóa file Login Data (mật khẩu) khỏi base profile
  3. Lưu base profile vào /opt/chrome-base-profile/ trên host Ubuntu

Mỗi lần học viên kết nối:
  1. Agent COPY base profile → /opt/chrome-sessions/<containerId>/
  2. Mount bản copy vào container (không mount trực tiếp base)
  3. Học viên dùng Chrome với tài khoản đã login sẵn

Khi học viên ngắt kết nối:
  1. Container bị xóa
  2. Agent xóa /opt/chrome-sessions/<containerId>/
  3. Base profile vẫn nguyên vẹn
```

> Mỗi học viên nhận **bản sao riêng** của base profile → dùng đồng thời không conflict, không ảnh hưởng nhau.

---

## Tại sao học viên không biết được mật khẩu?

| Cách tấn công | Đã chặn chưa | Lý do |
|--------------|-------------|-------|
| Vào Chrome Settings → Passwords | ✅ Chặn | File `Login Data` đã bị xóa → không có mật khẩu nào |
| Dùng DevTools → Application → Cookies | ✅ Chặn | Chrome Policy tắt DevTools |
| Vào trang "Đổi mật khẩu" | ⚠️ Cần chuẩn bị | Dùng email/phone riêng cho tài khoản |
| Export cookies bằng extension | ✅ Chặn | Chrome Policy chặn cài extension lạ |
| Đọc file Cookies trực tiếp | ✅ Chặn | Chrome Policy tắt terminal/file manager access (tùy cấu hình) |

---

## Các bước thực hiện chi tiết

---

### BƯỚC 1: Chuẩn bị tài khoản an toàn

Trước khi setup, đảm bảo các tài khoản dùng chung:

- Dùng **email riêng** không liên quan cá nhân
- Bật **2FA** bằng số điện thoại chỉ admin có
- Không dùng tài khoản cá nhân hoặc tài khoản quan trọng
- Nếu là tài khoản có phí → theo dõi usage để phát hiện lạm dụng

---

### BƯỚC 2: Tạo Base Profile trên máy Ubuntu

SSH vào Ubuntu, chạy container tạm để setup:

```bash
# Tạo thư mục base profile
sudo mkdir -p /opt/chrome-base-profile
sudo chown alpha:alpha /opt/chrome-base-profile

# Chạy container tạm với port noVNC
docker run -d \
  --name chrome-setup \
  -p 6090:6080 \
  --shm-size=512m \
  alpha-desktop:latest
```

Truy cập `http://<HOST_IP>:6090/vnc.html?autoconnect=true&password=alphadesktop`

Trong desktop:
1. Mở Chrome
2. Đăng nhập tất cả tài khoản cần thiết
3. Đảm bảo Chrome **KHÔNG lưu mật khẩu** (bấm "Never" khi Chrome hỏi)
4. Kiểm tra đã login xong tất cả

Sau đó copy profile ra host:

```bash
docker cp chrome-setup:/home/student/.config/google-chrome /opt/chrome-base-profile/data

# Xóa file mật khẩu
rm -f /opt/chrome-base-profile/data/Default/Login\ Data
rm -f /opt/chrome-base-profile/data/Default/Login\ Data-journal

# Xóa container tạm
docker stop chrome-setup && docker rm chrome-setup
```

---

### BƯỚC 3: Cấu hình Chrome Policy (chặn DevTools, Extensions)

Thêm vào `Dockerfile.desktop`:

```dockerfile
# Chrome enterprise policies
RUN mkdir -p /etc/opt/chrome/policies/managed
RUN printf '{\n\
  "DeveloperToolsAvailability": 2,\n\
  "PasswordManagerEnabled": false,\n\
  "IncognitoModeAvailability": 1,\n\
  "BrowserSignin": 0,\n\
  "SyncDisabled": true,\n\
  "ExtensionInstallBlocklist": ["*"],\n\
  "ExtensionInstallAllowlist": []\n\
}\n' > /etc/opt/chrome/policies/managed/policy.json
```

Giải thích từng policy:

| Policy | Giá trị | Tác dụng |
|--------|---------|---------|
| `DeveloperToolsAvailability` | 2 | Tắt hoàn toàn DevTools (F12 không mở được) |
| `PasswordManagerEnabled` | false | Tắt password manager |
| `IncognitoModeAvailability` | 1 | Tắt chế độ ẩn danh |
| `BrowserSignin` | 0 | Tắt đăng nhập tài khoản Google vào Chrome |
| `SyncDisabled` | true | Tắt sync |
| `ExtensionInstallBlocklist` | `["*"]` | Chặn cài extension lạ |

---

### BƯỚC 4: Cập nhật Agent — Copy base profile khi tạo container

Sửa `src/index.js`:

```javascript
app.post('/api/sessions/create', authMiddleware, async (req, res) => {
    const port = findFreePort();
    const containerName = `desktop-${Date.now()}`;
    const sessionProfileDir = `/opt/chrome-sessions/${containerName}`;

    // Copy base profile cho session này
    try {
        execSync(`cp -r /opt/chrome-base-profile/data ${sessionProfileDir}`);
        execSync(`chown -R 1000:1000 ${sessionProfileDir}`);
    } catch (e) {
        console.error('Failed to copy base profile:', e.message);
        // Tiếp tục dù không copy được (dùng profile trống)
    }

    const dockerCmd = [
        'docker run -d',
        `--name ${containerName}`,
        `-p ${port}:6080`,
        '--cpus=2',
        '--memory=4g',
        '--shm-size=512m',
        '--gpus all',
        `-v ${sessionProfileDir}:/home/student/.config/google-chrome`,
        'alpha-desktop:latest'
    ].join(' ');

    // ... phần còn lại giữ nguyên
});
```

Sửa phần destroy container — **xóa profile session** sau khi container bị xóa:

```javascript
app.post('/api/sessions/:containerId/destroy', authMiddleware, async (req, res) => {
    // ... stop + rm container như cũ ...

    // Xóa profile session
    const sessionProfileDir = `/opt/chrome-sessions/desktop-*`;
    try {
        // Tìm và xóa thư mục profile của container này
        execSync(`find /opt/chrome-sessions -maxdepth 1 -name "*${containerId.substring(0,6)}*" -exec rm -rf {} \\; 2>/dev/null || true`);
    } catch (e) {
        // Ignore cleanup errors
    }
    // ...
});
```

> **Lưu ý:** Logic tìm đúng thư mục cần tinh chỉnh thêm khi implement — cần lưu mapping `containerId → sessionProfileDir` trong memory.

---

### BƯỚC 5: Chuẩn bị thư mục trên Ubuntu

```bash
sudo mkdir -p /opt/chrome-sessions
sudo chown alpha:alpha /opt/chrome-sessions
sudo chmod 700 /opt/chrome-sessions
```

---

### BƯỚC 6: Rebuild Docker Image

Sau khi thêm Chrome Policy vào Dockerfile:

```bash
cd /opt/alpha-agent
git pull
docker build -f Dockerfile.desktop -t alpha-desktop:latest .
```

---

## Cập nhật Base Profile khi cần

Khi cần đăng nhập thêm tài khoản mới vào base profile:

```bash
# Backup base profile cũ
cp -r /opt/chrome-base-profile/data /opt/chrome-base-profile/data.bak

# Chạy container tạm để login thêm
docker run -d --name chrome-update -p 6090:6080 \
  -v /opt/chrome-base-profile/data:/home/student/.config/google-chrome \
  --shm-size=512m alpha-desktop:latest

# Truy cập noVNC → đăng nhập tài khoản mới
# http://<HOST_IP>:6090/vnc.html?autoconnect=true&password=alphadesktop

# Sau khi xong → xóa Login Data mới
docker stop chrome-update && docker rm chrome-update
rm -f /opt/chrome-base-profile/data/Default/Login\ Data
rm -f /opt/chrome-base-profile/data/Default/Login\ Data-journal
```

---

## Disk Space

```
Base profile:        ~200-500MB (1 bản duy nhất)
Mỗi session copy:    ~200-500MB (xóa khi disconnect)
5 session đồng thời: ~1-2.5GB tạm thời
```

---

## Thứ tự thực hiện

```
Bước 1: Chuẩn bị tài khoản an toàn (email riêng, 2FA)
Bước 2: Thêm Chrome Policy vào Dockerfile.desktop → rebuild image
Bước 3: Chạy container tạm → login các tài khoản → copy ra base profile
Bước 4: Xóa Login Data khỏi base profile
Bước 5: Sửa src/index.js → thêm copy profile + volume mount
Bước 6: Push GitHub → git pull trên Ubuntu → restart agent
Bước 7: Tạo thư mục /opt/chrome-sessions/ trên Ubuntu
Bước 8: Test — kết nối 2 tab khác nhau, kiểm tra độc lập, kiểm tra F12 bị chặn
```

---

## Checklist khi thực hiện

- [ ] Tài khoản dùng chung đã dùng email/phone riêng, bật 2FA
- [ ] Chrome Policy đã thêm vào Dockerfile và rebuild image
- [ ] Base profile đã tạo: login xong, đã xóa Login Data
- [ ] `/opt/chrome-base-profile/data/` tồn tại trên Ubuntu
- [ ] `/opt/chrome-sessions/` tồn tại với đúng permission
- [ ] Agent đã cập nhật: copy profile + volume mount + cleanup khi destroy
- [ ] Test F12 bị chặn ✅
- [ ] Test Settings → Passwords không thấy gì ✅
- [ ] Test 2 học viên cùng lúc, độc lập nhau ✅
- [ ] Test disconnect → profile session bị xóa ✅
