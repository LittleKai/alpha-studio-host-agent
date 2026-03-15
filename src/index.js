import express from 'express';
import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import si from 'systeminformation';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const AGENT_SECRET = process.env.AGENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL;
const MACHINE_ID = process.env.MACHINE_ID;
const HOST_IP = process.env.HOST_IP || 'localhost';

if (!AGENT_SECRET || !BACKEND_URL || !MACHINE_ID) {
    console.error('Missing required env vars: AGENT_SECRET, BACKEND_URL, MACHINE_ID');
    process.exit(1);
}

app.use(express.json());

// Secret-based auth middleware
const authMiddleware = (req, res, next) => {
    const secret = req.headers['x-agent-secret'];
    if (secret !== AGENT_SECRET) {
        return res.status(403).json({ success: false, message: 'Invalid secret' });
    }
    next();
};

// Track used ports
const usedPorts = new Set();
const MIN_PORT = 6080;
const MAX_PORT = 6999;

function findFreePort() {
    for (let port = MIN_PORT; port <= MAX_PORT; port++) {
        if (!usedPorts.has(port)) {
            return port;
        }
    }
    return null;
}

// POST /api/sessions/create - Create a new desktop container
app.post('/api/sessions/create', authMiddleware, async (req, res) => {
    try {
        const port = findFreePort();
        if (!port) {
            return res.status(503).json({
                success: false,
                message: 'No free ports available'
            });
        }

        const containerName = `desktop-${Date.now()}`;

        // Run Docker container
        const dockerCmd = [
            'docker run -d',
            `--name ${containerName}`,
            `-p ${port}:6080`,
            '--cpus=2',
            '--memory=4g',
            '--shm-size=512m',
            '--gpus all',
            'alpha-desktop:latest'
        ].join(' ');

        let containerId;
        try {
            containerId = execSync(dockerCmd, { encoding: 'utf-8' }).trim();
        } catch (dockerError) {
            console.error('Docker run failed:', dockerError.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to create container'
            });
        }

        usedPorts.add(port);

        // Wait for container to be ready (noVNC takes a moment)
        await new Promise(resolve => setTimeout(resolve, 3000));

        const noVncUrl = `http://${HOST_IP}:${port}/vnc.html?autoconnect=true&resize=remote&password=alphadesktop`;

        console.log(`[Create] Container ${containerId.substring(0, 12)} on port ${port}`);

        res.json({
            success: true,
            data: {
                containerId: containerId.substring(0, 12),
                noVncUrl,
                port
            }
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ success: false, message: 'Failed to create session' });
    }
});

// POST /api/sessions/:containerId/destroy - Destroy a container
app.post('/api/sessions/:containerId/destroy', authMiddleware, async (req, res) => {
    try {
        const { containerId } = req.params;

        // Get container port before stopping
        try {
            const portInfo = execSync(
                `docker port ${containerId} 6080 2>/dev/null`,
                { encoding: 'utf-8' }
            ).trim();
            const portMatch = portInfo.match(/:(\d+)$/);
            if (portMatch) {
                usedPorts.delete(parseInt(portMatch[1]));
            }
        } catch {
            // Port info may not be available
        }

        // Stop and remove container
        try {
            execSync(`docker stop ${containerId}`, { timeout: 10000 });
            execSync(`docker rm ${containerId}`, { timeout: 5000 });
        } catch {
            // Force remove if graceful stop fails
            try {
                execSync(`docker rm -f ${containerId}`, { timeout: 5000 });
            } catch {
                // Container may already be removed
            }
        }

        console.log(`[Destroy] Container ${containerId}`);

        res.json({ success: true, message: 'Container destroyed' });
    } catch (error) {
        console.error('Destroy session error:', error);
        res.status(500).json({ success: false, message: 'Failed to destroy container' });
    }
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Host agent is running',
        machineId: MACHINE_ID,
        timestamp: new Date().toISOString()
    });
});

// Heartbeat: send status to backend every 30 seconds
async function sendHeartbeat() {
    try {
        // Get system info
        const [cpuData, memData] = await Promise.all([
            si.cpu(),
            si.mem()
        ]);

        // Count running desktop containers
        let containerCount = 0;
        try {
            const output = execSync(
                'docker ps --filter "name=desktop-" --format "{{.ID}}" 2>/dev/null',
                { encoding: 'utf-8' }
            ).trim();
            containerCount = output ? output.split('\n').length : 0;
        } catch {
            containerCount = 0;
        }

        const specs = {
            cpu: `${cpuData.manufacturer} ${cpuData.brand} (${cpuData.cores} cores)`,
            ram: `${Math.round(memData.total / 1073741824)}GB`,
            gpu: ''
        };

        // Try to get GPU info
        try {
            const gpuData = await si.graphics();
            if (gpuData.controllers.length > 0) {
                const gpu = gpuData.controllers[0];
                specs.gpu = `${gpu.model} (${gpu.vram}MB)`;
            }
        } catch {
            // GPU info may not be available
        }

        const status = containerCount > 0 ? 'busy' : 'available';

        await fetch(`${BACKEND_URL}/cloud/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-secret': AGENT_SECRET
            },
            body: JSON.stringify({
                machineId: MACHINE_ID,
                status,
                currentContainers: containerCount,
                specs
            })
        });

        console.log(`[Heartbeat] status=${status}, containers=${containerCount}`);
    } catch (error) {
        console.error('[Heartbeat] Failed:', error.message);
    }
}

// Start heartbeat interval
setInterval(sendHeartbeat, 30000);

// Send initial heartbeat after startup
setTimeout(sendHeartbeat, 5000);

app.listen(PORT, () => {
    console.log(`\nAlpha Studio Host Agent`);
    console.log(`  Machine ID: ${MACHINE_ID}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Backend: ${BACKEND_URL}`);
    console.log(`  Host IP: ${HOST_IP}\n`);
});
