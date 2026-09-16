# Alpha Studio Host Agent - Agent Router

Node service dieu khien Docker desktop container va heartbeat ve backend.

## Doc theo viec

Luon doc `.claude/PROJECT_SUMMARY.md`.

| Task | Doc bat buoc |
|---|---|
| Container lifecycle, port, heartbeat | `.claude/PROJECT_SUMMARY.md` |
| Truoc khi giao | `.claude/SMOKE_TEST_CHECKLIST.md` |
| Contract cloud desktop | Summary backend va frontend lien quan |

Khong doc toan bo Docker context, image layer, `node_modules/` hay `.claude/archive/` chi de hieu project.

## Luat bat bien

- `AGENT_SECRET`, `MACHINE_ID`, `BACKEND_URL`, `HOST_IP` chi doc tu env.
- Kiem tra Docker truoc khi tao container; luon giai phong port khi destroy.
- Giu contract `x-agent-secret`, heartbeat va `{ success, message, data }` dong bo voi backend.
- Khong log secret. Khong xoa container/image ngoai dung pham vi user yeu cau.
- Logic hien nam trong `src/index.js`; khong tao abstraction neu chua can.

## VERIFY - artifact Node service + Docker image

1. Chay `node --check src/index.js` va build image neu cham Dockerfile/startup.
2. Khoi dong agent, kiem health/heartbeat va log khong chua secret.
3. Smoke create -> access noVNC -> destroy; port phai duoc tra lai sau lan hai.
4. Task chi sua docs duoc mien runtime; van phai kiem path, placeholder, secret va diff.

## Sau moi task

Cap nhat `.claude/PROJECT_SUMMARY.md`; verify tay theo smoke checklist khi cham lifecycle.
