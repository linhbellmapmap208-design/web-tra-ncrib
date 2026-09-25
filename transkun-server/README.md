# Transkun V2 worker

The Next.js app (port 3000) runs Transkun V2 itself: `/api/transcribe` starts
`worker.py` as a persistent Python child process, which loads the original
`2.0.pt` checkpoint from the package installed straight from
https://github.com/Yujia-Yan/Transkun. No separate server or port is needed.

## Setup

```bash
pnpm setup:transkun   # creates transkun-server/.venv with CPU PyTorch + Transkun
pnpm dev              # http://localhost:3000
```

For an NVIDIA GPU, install the CUDA build of PyTorch instead:

```bash
TORCH_INDEX=https://download.pytorch.org/whl/cu121 pnpm setup:transkun
```

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `TRANSKUN_PYTHON` | `transkun-server/.venv/bin/python` | Python interpreter to use |
| `TRANSKUN_DEVICE` | `cuda` if available, else `cpu` | Force a device |
| `MAX_DURATION_SECONDS` | `900` | Audio beyond this length is ignored |

Because PyTorch is far larger than Vercel Functions allow, run the app with
`pnpm build && pnpm start` on a machine or container that has Python (a VPS,
Railway, Fly.io, or a GPU box).
