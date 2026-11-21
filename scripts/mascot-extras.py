"""The mascot's event companions (public/mascots/foe.png, festival.png), drawn pixel by pixel from code: original pixel
art made for this app (no game art). 48x48 frames left to right, facing left (they stand right of the mascot; the app
mirrors them). Frame counts must match EXTRAS in src/domain/mascot.ts.

    foe.png       the Dimensional Invasion: a rift wisp the mascot fights, 6 frames (hit on 3 and 4, with the mascot's strike)
    festival.png  the Shugo Festival: a paper-lantern critter that bounces next to the mascot, 6 frames

    python3 scripts/mascot-extras.py [OUT] [--preview]

Needs Pillow (a development tool: the app only ships the PNGs).
"""
import math, os, random, sys
from PIL import Image, ImageDraw

S = 48
OUT = next((a for a in sys.argv[1:] if not a.startswith("--")), os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "mascots"))
os.makedirs(OUT, exist_ok=True)
INK = "#16161f"

def blob(d, box, fill, outline=INK):
    d.ellipse(box, fill=fill, outline=outline)

def px(d, pts, col):
    for x, y in pts: d.point((x, y), fill=col)

# --- foe: a dark wisp with horns and glowing eyes, bobbing; flinches white when hit -------------------------------------
def foe(t):
    im = Image.new("RGBA", (S, S)); d = ImageDraw.Draw(im)
    hit = t in (3, 4)
    bob = (0, -1, -2, 0, 1, 0)[t] + (2 if hit else 0)
    x0 = 14 + (3 if hit else 0)
    body, dark, glow = ("#f4ecff", "#c9b6f0", "#ffffff") if t == 3 else ("#5b3a9e", "#3a2368", "#ffd84a")
    # tail of smoke under it
    for k in range(4):
        w = 9 - k * 2
        d.ellipse([x0 + 10 - w + (k + t) % 2, 36 + bob + k * 2, x0 + 10 + w + (k + t) % 2, 40 + bob + k * 2], fill=dark)
    blob(d, [x0, 14 + bob, x0 + 21, 38 + bob], body)
    d.chord([x0 + 1, 26 + bob, x0 + 20, 37 + bob], 0, 180, fill=dark)
    # horns
    d.polygon([(x0 + 3, 17 + bob), (x0 + 1, 8 + bob), (x0 + 7, 15 + bob)], fill=dark, outline=INK)
    d.polygon([(x0 + 18, 17 + bob), (x0 + 20, 8 + bob), (x0 + 14, 15 + bob)], fill=dark, outline=INK)
    # eyes, looking left at the mascot; squeezed when hit
    if hit: px(d, [(x0 + 4, 23 + bob), (x0 + 5, 24 + bob), (x0 + 4, 25 + bob), (x0 + 11, 23 + bob), (x0 + 10, 24 + bob), (x0 + 11, 25 + bob)], INK)
    else:
        d.rectangle([x0 + 3, 22 + bob, x0 + 5, 25 + bob], fill=glow); d.rectangle([x0 + 10, 22 + bob, x0 + 12, 25 + bob], fill=glow)
    d.line([x0 + 5, 30 + bob, x0 + 10, 30 + bob], fill=INK)
    # little claws reaching left
    d.polygon([(x0 + 1, 28 + bob), (x0 - 4 + (t % 2), 30 + bob), (x0 + 1, 32 + bob)], fill=dark, outline=INK)
    # sparkles of the rift around it
    r = random.Random(t)
    px(d, [(r.randrange(4, 44), r.randrange(4, 44)) for _ in range(5)], "#b38bff")
    return im

# --- festival: a round paper lantern with feet, a face and a tassel, bouncing among confetti ---------------------------
def festival(t):
    im = Image.new("RGBA", (S, S)); d = ImageDraw.Draw(im)
    jump = (0, -2, -5, -6, -4, -1)[t]
    squash = 2 if t == 0 else 0
    y0, y1 = 14 + jump + squash, 38 + jump
    # feet
    if jump < -1: d.ellipse([16, y1 - 1, 21, y1 + 3], fill="#7a4a2a", outline=INK); d.ellipse([27, y1 - 1, 32, y1 + 3], fill="#7a4a2a", outline=INK)
    else: d.ellipse([15, 39, 21, 43], fill="#7a4a2a", outline=INK); d.ellipse([27, 39, 33, 43], fill="#7a4a2a", outline=INK)
    # the lantern: body, ribs, caps
    d.ellipse([9, y0, 39, y1], fill="#e8483c", outline=INK)
    for k, yy in enumerate((y0 + 6, y0 + 12, y1 - 6)):
        d.arc([10, yy - 3, 38, yy + 3], 0, 180, fill="#b52f27")
    d.ellipse([13, y0 + 3, 20, y0 + 8], fill="#ff8a7a")  # shine
    d.rectangle([17, y0 - 3, 31, y0 + 1], fill="#2b2b36", outline=INK)
    d.rectangle([18, y1 - 1, 30, y1 + 1], fill="#2b2b36")
    d.line([24, y0 - 7, 24, y0 - 3], fill=INK); d.ellipse([22, y0 - 9, 26, y0 - 6], fill="#ffd84a", outline=INK)
    # tassel swinging
    sw = (0, 1, 2, 1, 0, -1)[t]
    d.line([35, y0 + 10, 38 + sw, y0 + 16], fill="#ffd84a"); d.line([38 + sw, y0 + 16, 38 + sw, y0 + 22], fill="#f0a020")
    # face, looking left; happy eyes at the top of the jump
    ey = y0 + 13
    if jump <= -5: px(d, [(15, ey + 1), (16, ey), (17, ey + 1), (24, ey + 1), (25, ey), (26, ey + 1)], INK)
    else: d.rectangle([15, ey, 16, ey + 2], fill=INK); d.rectangle([24, ey, 25, ey + 2], fill=INK)
    px(d, [(19, ey + 4), (20, ey + 5), (21, ey + 5), (22, ey + 4)], INK)
    px(d, [(13, ey + 3), (14, ey + 3), (27, ey + 3), (28, ey + 3)], "#ffb0a0")
    # confetti
    r = random.Random(100 + t)
    for _ in range(9):
        x, y = r.randrange(2, 46), r.randrange(0, 14)
        d.rectangle([x, y, x + 1, y], fill=r.choice(["#ffd84a", "#7ee081", "#86ccff", "#b38bff", "#ff6b6b"]))
    return im

for name, fn in (("foe", foe), ("festival", festival)):
    frames = [fn(t) for t in range(6)]
    sheet = Image.new("RGBA", (S * len(frames), S))
    for k, f in enumerate(frames): sheet.paste(f, (k * S, 0), f)
    sheet.save(os.path.join(OUT, f"{name}.png"))
    if "--preview" in sys.argv:
        bg = Image.new("RGBA", sheet.size, (38, 42, 50, 255)); bg.alpha_composite(sheet)
        bg.resize((sheet.width * 4, S * 4), Image.NEAREST).save(os.path.join(OUT, f"{name}-4x.png"))
