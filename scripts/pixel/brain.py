"""Fallow's brain creature: simple silhouette, big eyes, little else.

32x32 grid per frame. Four stages, four frames each. The stage is carried by
the eyes and mouth; colour does the rest.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

W = H = 32
OUT = Path(__file__).parent / "out"
TS_OUT = Path(__file__).resolve().parents[2] / "src" / "pixel"
OUT.mkdir(exist_ok=True)

PALETTE = {
    ".": None,
    # bright ramp (thriving)
    "h": "#ffe3da",
    "p": "#f6a79d",
    "q": "#dc7b74",
    "W": "#fff8ef",  # eye shine
    "R": "#ef8b84",  # cheeks
    # pink ramp (steady)
    "L": "#fbd9d1",
    "B": "#f0a89f",
    "S": "#d47f78",
    "O": "#4b2a2e",
    # muted ramp (fading)
    "l": "#efd9ce",
    "b": "#d9b5ab",
    "s": "#b58b83",
    "o": "#4a3331",
    # dried ramp (fallow)
    "1": "#e4dac6",
    "2": "#c3b296",
    "3": "#9a8a6c",
    "5": "#3d342a",
    # face and accents
    "K": "#2a2124",
    "Y": "#ffd166",
    "D": "#9cc8dc",
    "d": "#cdbf9f",
}

STAGE = {
    "thriving": dict(light="h", base="p", shade="q", outline="O"),
    "steady": dict(light="L", base="B", shade="S", outline="O"),
    "fading": dict(light="l", base="b", shade="s", outline="o"),
    "fallow": dict(light="1", base="2", shade="3", outline="5"),
}


def blank():
    return [["." for _ in range(W)] for _ in range(H)]


def circle(m, cx, cy, r):
    for y in range(H):
        for x in range(W):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                m[y][x] = True


def ellipse(m, cx, cy, rx, ry):
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                m[y][x] = True


def body_mask(dy=0.0, sx=1.0, sy=1.0):
    m = [[False] * W for _ in range(H)]
    base, cx = 23.0, 16.0
    tx = lambda x: cx + (x - cx) * sx  # noqa: E731
    ty = lambda y: base + (y - base) * sy + dy  # noqa: E731
    circle(m, tx(12.5), ty(12.5), 6.6 * sx)
    circle(m, tx(19.5), ty(12.5), 6.6 * sx)
    ellipse(m, tx(16.0), ty(16.5), 10.2 * sx, 7.0 * sy)
    # sit flat on the ground
    floor = int(round(ty(22.5)))
    for y in range(H):
        if y > floor:
            m[y] = [False] * W
    for yy in range(0, 9):
        y = int(round(ty(yy)))
        if 0 <= y < H:
            m[y][16] = m[y][16] and yy > 7
    return m


def erode(mask):
    out = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if mask[y][x] and all(0 <= x + dx < W and 0 <= y + dy < H and mask[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = True
    return out


def render_body(g, mask, c, dy=0.0):
    inner = erode(mask)
    cx, cy = 16.0, 16.0 + dy
    for y in range(H):
        for x in range(W):
            if not mask[y][x]:
                continue
            diag = (x + 0.5 - cx) / 10.0 * 0.9 + (y + 0.5 - cy) / 8.0
            key = c["base"]
            if not inner[y][x]:
                if diag < -0.5:
                    key = c["light"]
                elif diag > 0.45:
                    key = c["shade"]
            g[y][x] = key
    for y in range(H):
        for x in range(W):
            if mask[y][x]:
                continue
            if any(0 <= x + dx < W and 0 <= y + dyy < H and mask[y + dyy][x + dx] for dx, dyy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                g[y][x] = c["outline"]


def stamp(g, pts, key, dy=0):
    for x, y in pts:
        yy = y + dy
        if 0 <= x < W and 0 <= yy < H:
            g[yy][x] = key


def mirror(pts):
    return [(31 - x, y) for x, y in pts]


FOLD_L = [(8, 10), (9, 9), (10, 9)]  # one soft curve per lobe
FISSURE = [(16, 8), (16, 9), (16, 10)]
CRACK_L = [(6, 15), (7, 16), (7, 17), (8, 18)]
CRACK_R = [(23, 7), (24, 8), (24, 9), (25, 10)]

# Eyes: 2x2 dots, left cols 11-12, right cols 19-20, rows 14-15. Moods live in the eyes.
EYE_L = [(11, 14), (12, 14), (11, 15), (12, 15)]
EYE_R = [(19, 14), (20, 14), (19, 15), (20, 15)]
HAPPY_L = [(10, 15), (11, 14), (12, 14), (13, 15)]  # closed, smiling
HAPPY_R = [(18, 15), (19, 14), (20, 14), (21, 15)]
BLINK_L = [(11, 15), (12, 15)]
BLINK_R = [(19, 15), (20, 15)]
TIRED_L = [(11, 15), (12, 15)]  # heavy lids: shade on top, ink below
TIRED_R = [(19, 15), (20, 15)]
LID_L = [(11, 14), (12, 14)]
LID_R = [(19, 14), (20, 14)]
SHINE = [(11, 14), (19, 14)]  # one bright pixel per eye
CHEEKS = [(9, 16), (10, 16), (21, 16), (22, 16)]
SHUT_L = [(10, 15), (11, 15), (12, 15), (13, 15)]  # dormant
SHUT_R = [(18, 15), (19, 15), (20, 15), (21, 15)]

SPARKLE_A = [(6, 5), (5, 6), (6, 6), (7, 6), (6, 7), (26, 7), (4, 14)]
SPARKLE_B = [(25, 3), (24, 4), (25, 4), (26, 4), (25, 5), (5, 9), (28, 15)]
SWEAT = [(25, 9), (24, 10), (25, 10), (26, 10), (25, 11)]
DUST_A = [(27, 12), (28, 10), (4, 11)]
DUST_B = [(28, 13), (29, 11), (3, 10), (5, 12)]


def frame(stage, body_dy=0.0, sx=1.0, sy=1.0, eyes="open", extras=(), face_dy=0):
    c = STAGE[stage]
    g = blank()
    d = int(round(body_dy))
    render_body(g, body_mask(dy=body_dy, sx=sx, sy=sy), c, dy=body_dy)
    if stage == "fallow":
        stamp(g, CRACK_L + CRACK_R, "5", d)
        stamp(g, FISSURE, c["shade"], d)
    else:
        stamp(g, FOLD_L, c["shade"], d)
        stamp(g, mirror(FOLD_L), c["shade"], d)
        stamp(g, FISSURE, c["shade"], d)
    fd = d + face_dy
    if eyes == "open":
        stamp(g, EYE_L + EYE_R, "K", fd)
    elif eyes == "gleam":
        stamp(g, EYE_L + EYE_R, "K", fd)
        stamp(g, SHINE, "W", fd)
    elif eyes == "happy":
        stamp(g, HAPPY_L + HAPPY_R, "K", fd)
    elif eyes == "blink":
        stamp(g, BLINK_L + BLINK_R, "K", fd)
    elif eyes == "tired":
        stamp(g, LID_L + LID_R, c["shade"], fd)
        stamp(g, TIRED_L + TIRED_R, "K", fd)
    elif eyes == "shut":
        stamp(g, SHUT_L + SHUT_R, "K", fd)
    if stage == "thriving":
        stamp(g, CHEEKS, "R", fd)
    for pts, key in extras:
        stamp(g, pts, key)
    return ["".join(r) for r in g]


FRAMES = {
    "thriving": [
        frame("thriving", eyes="gleam"),
        frame("thriving", eyes="happy", body_dy=-1, extras=[(SPARKLE_A, "Y")]),
        frame("thriving", eyes="gleam", extras=[(SPARKLE_B[-2:], "Y")]),
        frame("thriving", eyes="happy", sx=1.04, sy=0.95, extras=[(SPARKLE_B, "Y")]),
    ],
    "steady": [
        frame("steady"),
        frame("steady", body_dy=-1),
        frame("steady", eyes="happy"),
        frame("steady", eyes="blink"),
    ],
    "fading": [
        frame("fading", eyes="tired"),
        frame("fading", eyes="tired", sy=0.97),
        frame("fading", eyes="tired", sy=0.97, extras=[(SWEAT, "D")]),
        frame("fading", eyes="blink"),
    ],
    "fallow": [
        frame("fallow", eyes="shut"),
        frame("fallow", eyes="shut"),
        frame("fallow", eyes="shut", extras=[(DUST_A, "d")]),
        frame("fallow", eyes="shut", extras=[(DUST_B, "d")]),
    ],
}


def to_image(rows, scale=1):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, k in enumerate(row):
            h = PALETTE[k]
            if h:
                px[x, y] = tuple(int(h[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    return img.resize((W * scale, H * scale), Image.NEAREST) if scale != 1 else img


def sheet(scale=8, bg=(243, 232, 210, 255)):
    stages = list(FRAMES)
    out = Image.new("RGBA", (W * scale * 4, H * scale * len(stages)), bg)
    for r, st in enumerate(stages):
        for col, fr in enumerate(FRAMES[st]):
            im = to_image(fr, scale)
            out.paste(im, (col * W * scale, r * H * scale), im)
    return out


def gif(scale=8, bg=(243, 232, 210, 255), ms=180):
    stages = list(FRAMES)
    seq = {"thriving": [0, 1, 1, 0, 2, 3, 3, 0], "steady": [0, 1, 0, 2, 0, 0, 3, 0], "fading": [0, 0, 1, 1, 2, 2, 1, 3], "fallow": [0, 0, 0, 0, 2, 3, 0, 0]}
    frames = []
    for i in range(8):
        canvas = Image.new("RGBA", (W * scale * len(stages), H * scale), bg)
        for col, st in enumerate(stages):
            im = to_image(FRAMES[st][seq[st][i]], scale)
            canvas.paste(im, (col * W * scale, 0), im)
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE, colors=64))
    frames[0].save(OUT / "brain-stages.gif", save_all=True, append_images=frames[1:], duration=ms, loop=0, disposal=2)


def write_ts():
    TS_OUT.mkdir(parents=True, exist_ok=True)
    lines = [
        "// Generated by scripts/pixel/brain.py. Edit the Python, not this file.",
        "export type Stage = \"thriving\" | \"steady\" | \"fading\" | \"fallow\";",
        "export const BRAIN_PALETTE: Record<string, string | null> = " + json.dumps(PALETTE, indent=2) + ";",
        "export const BRAIN_FRAMES: Record<Stage, string[][]> = " + json.dumps(FRAMES, indent=2) + ";",
        "export const BRAIN_SIZE = 32;",
        "",
    ]
    (TS_OUT / "brain.ts").write_text("\n".join(lines))


if __name__ == "__main__":
    sheet().save(OUT / "brain-sheet.png")
    gif()
    write_ts()
    print("wrote", OUT, "and", TS_OUT / "brain.ts")
