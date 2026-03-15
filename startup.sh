#!/bin/bash

# Start virtual framebuffer
Xvfb $DISPLAY -screen 0 $RESOLUTION &
sleep 1

# Start XFCE desktop
startxfce4 &
sleep 2

# Start VNC server
x11vnc -display $DISPLAY -forever -shared -rfbauth /home/student/.vnc/passwd -rfbport 5900 &
sleep 1

# Start noVNC (websockify bridges WebSocket to VNC)
websockify --web /usr/share/novnc 6080 localhost:5900 &
sleep 2

# Disable screensaver and screen lock
xset s off
xset -dpms
xset s noblank
pkill xfce4-screensaver 2>/dev/null || true

# Auto-launch Chrome browser
DISPLAY=:1 google-chrome-stable \
  --no-sandbox \
  --disable-dev-shm-usage \
  --no-first-run \
  --password-store=basic \
  --start-maximized \
  "https://www.google.com" &

echo "Desktop environment ready"
echo "  VNC: port 5900"
echo "  noVNC: port 6080"

# Keep container running
wait
