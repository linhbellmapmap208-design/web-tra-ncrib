# MP3 → MIDI (Transkun V2)

Web tải lên bản thu piano (MP3/WAV/FLAC) rồi nhận về file MIDI, có nghe thử ngay trên trình duyệt.

- **Frontend/backend:** Next.js 16 (App Router) + React 19 + Tailwind 4
- **Nhận dạng:** Transkun V2 chạy trong tiến trình Python, do Next spawn ra (`transkun-server/worker.py`), giao tiếp qua stdin/stdout từng dòng JSON
- **Deploy:** cần một máy có Python + venv — không chạy được trên Vercel (PyTorch vượt giới hạn dung lượng của Vercel Functions)

## Yêu cầu

| Công cụ | Bản tối thiểu | Ghi chú |
| --- | --- | --- |
| Node.js | 20.9 | Next 16 yêu cầu `>=20.9.0`; khuyến nghị 22 (bản CI đang dùng) |
| pnpm | 12 | `package.json` khai báo `packageManager: pnpm@12.3.4` |
| Python | 3.11+ | chỉ cần cho phần nhận dạng |
| Dung lượng | ~2 GB | PyTorch (bản CPU) + trọng số mô hình |

## 1. Cài dependencies

```bash
corepack enable      # lấy đúng phiên bản pnpm khai báo trong package.json
pnpm install
```

`pnpm install` phải dùng `pnpm-lock.yaml` (không phải `.yml`) — nếu báo `ERR_PNPM_NO_LOCKFILE` thì tên file đang sai.

## 2. Chạy web

```bash
pnpm dev             # http://localhost:3000
```

Giao diện chạy được ngay, nhưng chưa nhận dạng được — phần đó cần bước 3.
Muốn xem trên thiết bị khác trong cùng mạng: `pnpm dev -- -H 0.0.0.0`.

## 3. Bật phần nhận dạng (Python worker)

```bash
pnpm setup:transkun          # tạo transkun-server/.venv với PyTorch CPU + Transkun
```

Có card NVIDIA thì dùng bản CUDA:

```bash
TORCH_INDEX=https://download.pytorch.org/whl/cu121 pnpm setup:transkun
```

Khởi động lại `pnpm dev` (lần đầu nạp mô hình mất khoảng 10–60s), rồi kiểm tra:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","model":"transkun-2.0","device":"cpu"}
```

### Biến môi trường

| Tên | Mặc định | Tác dụng |
| --- | --- | --- |
| `TRANSKUN_PYTHON` | `transkun-server/.venv/bin/python` | Đường dẫn Python sẽ được spawn |
| `TRANSKUN_DEVICE` | `cuda` nếu có, ngược lại `cpu` | Ép chạy trên `cpu` / `cuda` |
| `MAX_DURATION_SECONDS` | `900` | Audio dài hơn mức này bị bỏ qua |

### Kiểm tra nhanh là pipeline chạy thật

Tạo một file WAV 4 nốt (C4 E4 G4 C5) rồi đẩy qua API, không cần mở trình duyệt:

```bash
curl -F "file=@test-piano.wav;type=audio/wav" -o out.mid -D - \
  http://localhost:3000/api/transcribe
```

Kết quả đúng phải là `HTTP 200`, `content-type: audio/midi`, có header `x-transkun-device`.
Mở `out.mid` bằng `pretty_midi` phải thấy đúng 4 nốt `60, 64, 67, 72`.
Tham khảo thực tế đã đo: **~13s cho 3.6s audio trên CPU**, model `transkun-2.0` (56 MB, nằm sẵn trong package).

> Lưu ý khi mạng bị chặn `download.pytorch.org`: `setup.sh` lấy index đó làm `--index-url`.
> Có thể cài trực tiếp từ PyPI (`pip install -r transkun-server/requirements.txt`), nhưng trên Linux
> PyPI không có bản CPU nên sẽ kéo theo cả `cuda-toolkit`/`cudnn`/`triton` — venv lên tới **~5.9 GB**
> thay vì ~200 MB. torch vẫn chạy CPU bình thường (`cuda avail: False`), chỉ tốn dung lượng.


## 4. Build và chạy production

```bash
pnpm build && pnpm start
```

Máy chạy `pnpm start` cũng phải có venv ở bước 3, vì worker Python được spawn lúc chạy.

## Kiểm tra tĩnh

```bash
pnpm exec tsc --noEmit
```

Cần chạy riêng vì `next.config.js` đặt `typescript.ignoreBuildErrors: true`, nên `next build` **không** báo lỗi type.

## CI

`.github/workflows/ci.yml` chạy trên mỗi push vào `main`/`arena/**` và mỗi pull request: `pnpm install --frozen-lockfile` → `tsc --noEmit` → `next build`.

## Khắc phục sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| `/api/health` luôn trả `{"status":"loading"}`, UI báo "đang nạp mô hình" mãi | Không tìm thấy Python có Transkun. Chưa chạy `pnpm setup:transkun`, hoặc venv nằm ở đường dẫn khác — đặt `TRANSKUN_PYTHON` trỏ tới `.../.venv/bin/python`. Xem mục "Hạn chế đã biết" bên dưới — đây là hành vi đã biết của app, không phải lỗi mạng. |
| `No module named 'transkun'` / `'torch'` | venv chưa cài xong; xoá `transkun-server/.venv` rồi chạy lại `pnpm setup:transkun` |
| `Failed to fetch ... from Google Fonts` khi build | `app/layout.tsx` dùng `next/font/google` nên build cần mạng. Offline thì tự host font bằng `next/font/local` |
| `ERR_PNPM_NO_LOCKFILE` | `pnpm-lock.yaml` bị thiếu/đổi tên |
| `pnpm install` đổi tên/mất script `postinstall` | repo dùng `pnpm`, đừng chạy `npm install` (sẽ sinh `package-lock.json`) |

## Hạn chế đã biết (chưa sửa)

- **Lỗi nạp model bị ẩn.** Khi Python/Transkun không tồn tại, `worker.py` in `fatal` rồi thoát mã 1; `lib/transkun-worker.ts` xoá worker khỏi cache toàn cục trong `fail()`, nên mỗi lần UI poll lại spawn một tiến trình mới và đọc trạng thái ngay lúc còn `loading`. Người dùng thấy spinner vô hạn thay vì thông báo `"Không nạp được Transkun: ..."`, kèm theo một process Python chết yểu cho mỗi lần poll.
- **`.next/` và `node_modules/` đang bị git theo dõi** — chỉ cần `pnpm dev` một lần là `git status` có ~76 file đã sửa.
- **`next build` phụ thuộc mạng lúc build** (Google Fonts) và cảnh báo *"Dynamic filesystem access causes tracing of the whole project"* ở `lib/transkun-worker.ts:35` — sẽ quan trọng nếu deploy lên nền tảng serverless.


## Ghi chú về repo

`node_modules/` và `.next/` **đang được git theo dõi** (31k file, repo ~155 MB). Hệ quả thực tế: chỉ cần `pnpm dev` một lần là `.next/` sinh ra ~76 file đã sửa, `git status` bẩn liên tục. Cân nhắc thêm `.gitignore` chuẩn Next.js rồi `git rm -r --cached node_modules .next` — nhưng khi đó cần lưu ý cảnh báo *"Dynamic filesystem access causes tracing of the whole project"* ở `lib/transkun-worker.ts:35` nếu bạn deploy lên nền tảng serverless.
