# Alpha Studio Host Agent

Host agent that manages Docker desktop containers (Ubuntu + XFCE + noVNC) for Alpha Studio's Cloud Desktop feature.

## Prerequisites

- Node.js >= 18
- Docker installed and running
- Docker accessible without sudo (or run agent with appropriate permissions)

## Setup

### 1. Build the Desktop Docker Image

```bash
docker build -f Dockerfile.desktop -t alpha-desktop:latest .
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Agent HTTP port | `4000` |
| `AGENT_SECRET` | Shared secret with backend | `my-secret-key` |
| `BACKEND_URL` | Backend API URL | `http://localhost:3001/api` |
| `MACHINE_ID` | Unique machine identifier | `machine-01` |
| `HOST_IP` | IP address accessible by clients | `192.168.1.100` |

### 3. Register Machine in Admin Panel

Before starting the agent, register this machine in the Alpha Studio admin panel:
- Go to Admin > Cloud Desktop > Machines
- Click "Register Machine"
- Fill in: name, machine ID (must match `MACHINE_ID` in .env), agent URL (`http://<agent-host>:<PORT>`), and the same secret

### 4. Install Dependencies & Start

```bash
npm install
npm start
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/sessions/create` | `x-agent-secret` | Create a new desktop container |
| `POST` | `/api/sessions/:id/destroy` | `x-agent-secret` | Stop and remove a container |
| `GET` | `/api/health` | None | Health check |

## WSL2 Notes (Windows)

If running Docker via WSL2:
- Set `HOST_IP` to your Windows host IP (not `localhost`)
- Ensure Docker Desktop is configured to expose ports to the host
- Port range 6080-6999 must be available

## Architecture

```
Client Browser
    |
    | (noVNC WebSocket)
    v
Host Machine (this agent)
    |
    | (Docker API)
    v
Desktop Container
    ├── Xvfb (virtual display)
    ├── XFCE4 (desktop environment)
    ├── x11vnc (VNC server)
    ├── websockify + noVNC (web access)
    ├── Chrome + Firefox
    └── Python3
```
# alpha-studio-host-agent
