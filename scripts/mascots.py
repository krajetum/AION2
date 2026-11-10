"""The mascots' sprite sheets (public/mascots/<class>-<m|f>-<elyos|asmo>.png), drawn pixel by pixel from code: original
chibi pixel art made for this app (no game art). Each sheet: 48x48 frames, one row per animation in ORDER, frames left to
right; the mascot faces right (the app mirrors it). Elyos have white wings, Asmodians black ones (the game's server
faction). Frame counts must match ANIMS in src/domain/mascot.ts.

    python3 scripts/mascots.py                 # every class, gender and faction into public/mascots/
    python3 scripts/mascots.py OUT CLASS m|f elyos|asmo [--preview]   # one sheet (+ a 4x preview PNG and a GIF)

Needs Pillow and numpy (a development tool: the app only ships the PNGs).
"""
import math, sys, json, os, subprocess

if len(sys.argv) == 1:
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "mascots")
    os.makedirs(out, exist_ok=True)
    for cls in ["assassin", "gladiator", "templar", "ranger", "sorcerer", "spiritmaster", "cleric", "chanter"]:
        for g in "mf":
            for f in ("elyos", "asmo"):
                subprocess.run([sys.executable, "-I", os.path.abspath(__file__), out, cls, g, f], check=True)
    sys.exit(0)

import numpy as np
from PIL import Image, ImageDraw

S = 48
OUT, CLS, GENDER, FACTION = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
FEMALE = GENDER == "f"

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

PAL = {k: hexc(v) for k, v in {
    "k": "#16161f", "s": "#f4cba3", "S": "#dba57d", "p": "#ef8e86", "w": "#ffffff", "e": "#1a1a26",
    "a": "#7a4a2a", "A": "#55331c", "y": "#ffd84a", "Y": "#f0a020", "t": "#86ccff", "T": "#cfeaff",
    "m": "#e4e8ee", "M": "#8f99a6", "g": "#7d7a75", "G": "#55524d", "o": "#ff6b6b", "q": "#7ee081", "u": "#b38bff",
    "b": "#5a3d2b", "B": "#3c271b",
}.items()}
# h/H headgear, c/C body, r/R trim (scarf, plume, band), n/N cape, x/X off-hand or special
CLASSES = {
    "assassin": dict(head="ninja", mask=True, tail="scarf", main="dagger", off="dagger", robe=False, plates=False,
        colors={"h": "#2b303b", "H": "#1c2028", "c": "#2b303b", "C": "#1c2028", "r": "#5aae46", "R": "#3a7a2c"}),
    "gladiator": dict(head="plume", tail="cape", main="greatsword", off=None, robe=False, plates=True,
        colors={"h": "#c3ccd4", "H": "#86939e", "c": "#3f8fa3", "C": "#2a6273", "r": "#d0402f", "R": "#8e2a1f", "n": "#3f8fa3", "N": "#2a6273"}),
    "templar": dict(head="helm", tail="cape", main="sword", off="shield", robe=False, plates=True,
        colors={"h": "#c9d3dc", "H": "#8794a1", "c": "#4d6fc4", "C": "#344d8f", "r": "#e2bd52", "R": "#a3812c", "n": "#344d8f", "N": "#22325e", "x": "#4d6fc4", "X": "#e2bd52"}),
    "ranger": dict(head="robin", tail=None, main=None, off="bow", robe=False, plates=False,
        colors={"h": "#3fa57a", "H": "#287355", "c": "#6b5136", "C": "#4b3824", "r": "#a8d46a", "R": "#6f9a3a", "x": "#8a5a32", "X": "#e8e2cf"}),
    "sorcerer": dict(head="witch", tail=None, main="book", off=None, robe=True, plates=False,
        colors={"h": "#6b4ab0", "H": "#4a3080", "c": "#7d58c8", "C": "#583c96", "r": "#ffd166", "R": "#c99a2e", "x": "#a33a3a", "X": "#ffd166"}),
    "spiritmaster": dict(head="circlet", hair=("#e3d4f5", "#b39ad6"), tail=None, main="orb", off=None, robe=True, plates=False, spirit=True,
        colors={"h": "#b14aa6", "H": "#7a2d72", "c": "#5a2f66", "C": "#3e1f47", "r": "#ffb347", "R": "#d07a1e", "x": "#ff9f43", "X": "#ffe28a"}),
    "cleric": dict(head="mitre", tail="cape", main="mace", off="shield", robe=True, plates=False,
        colors={"h": "#f4efe0", "H": "#c9bf9f", "c": "#f4efe0", "C": "#c9bf9f", "r": "#d8b45a", "R": "#a3812c", "n": "#d8b45a", "N": "#a3812c", "x": "#f4efe0", "X": "#d8b45a"}),
    "chanter": dict(head="band", tail="cape", main="staff", off=None, robe=False, plates=True, tabard=True,
        colors={"h": "#e09a48", "H": "#a86a28", "c": "#a7b0ba", "C": "#747e89", "r": "#e09a48", "R": "#a86a28", "n": "#e8d9b0", "N": "#b8a77a", "x": "#8a5a32", "X": "#ffd166"}),
}
K = CLASSES[CLS]
for k, v in K["colors"].items(): PAL[k] = hexc(v)
if "hair" in K: PAL["a"], PAL["A"] = hexc(K["hair"][0]), hexc(K["hair"][1])
if FACTION == "elyos": PAL["W"], PAL["V"], WING_LINE = hexc("#f6f7fc"), hexc("#c3c9db"), hexc("#3a3f55")
else: PAL["W"], PAL["V"], WING_LINE = hexc("#2c2536"), hexc("#4c4060"), hexc("#9a82cc")


class Canvas:
    def __init__(self): self.px = np.zeros((S, S, 4), np.uint8)

    def layer(self, draw_fn, color, outline=PAL["k"], shade=None):
        """Rasterize a shape (draw_fn gets an ImageDraw on an L mask), fill it, outline it (4-neighbour) and paste on top."""
        m = Image.new("L", (S, S), 0)
        draw_fn(ImageDraw.Draw(m))
        mask = np.array(m) > 0
        if outline is not None:
            d = mask.copy()
            d[1:, :] |= mask[:-1, :]; d[:-1, :] |= mask[1:, :]; d[:, 1:] |= mask[:, :-1]; d[:, :-1] |= mask[:, 1:]
            self.px[d & ~mask] = outline
        self.px[mask] = color
        if shade: shade(self, mask)
        return mask

    def put(self, pts, color):
        for x, y in pts:
            if 0 <= x < S and 0 <= y < S: self.px[y, x] = color

    def image(self): return Image.fromarray(self.px, "RGBA")


def rot(pts, ox, oy, deg):
    a = math.radians(deg)
    return [(ox + (x - ox) * math.cos(a) - (y - oy) * math.sin(a), oy + (x - ox) * math.sin(a) + (y - oy) * math.cos(a)) for x, y in pts]

def mirror(pts): return [(48 - x, y) for x, y in pts]

_W = [(19, 27), (14, 20), (9, 16), (4, 15), (3, 19), (5, 21), (3, 24), (6, 26), (5, 29), (9, 30), (10, 33), (14, 31), (19, 30)]
_F = [((18, 27), (5, 20)), ((18, 28), (5, 25)), ((18, 29), (8, 29))]
sc = lambda p: (19 + (p[0] - 19) * 0.85, 27 + (p[1] - 27) * 0.85)
WING = [sc(p) for p in _W]
FEATHERS = [(sc(a), sc(b)) for a, b in _F]


XS = np.arange(S)[None, :]
YS = np.arange(S)[:, None]

def frame(eyes="open", mouth="mask", arms=((14, 35), (34, 35)), legs=(0, 0, 0, 0), by=0, gy=0, flap=0,
          extras=(), lean=0, hair_wind=0, t=0):
    c = Canvas()
    Y = lambda v: v + by + gy  # upper body
    G = lambda v: v + gy        # legs
    hx0 = 24 + lean
    hooded = K["head"] in ("hood", "ninja", "robin")

    # wings (behind everything)
    for side in (0, 1):
        pts = rot(WING, 19, 27, -flap * 12)
        pts = [(x, y + by + gy) for x, y in pts]
        fe = [rot([a, b], 19, 27, -flap * 12) for a, b in FEATHERS]
        fe = [[(x, y + by + gy) for x, y in seg] for seg in fe]
        if side: pts = mirror(pts); fe = [mirror(seg) for seg in fe]
        c.layer(lambda d: d.polygon(pts, fill=255), PAL["W"], outline=WING_LINE)
        for seg in fe:
            m = Image.new("L", (S, S)); ImageDraw.Draw(m).line(seg, fill=255)
            c.px[(np.array(m) > 0) & (c.px[:, :, :3] == PAL["W"][:3]).all(-1)] = PAL["V"]

    # cape or scarf tail, behind
    if K["tail"] == "cape":
        w = hair_wind
        cape = [(18, Y(25)), (30, Y(25)), (33 + w, Y(40)), (29 + w, Y(41)), (24 + w, Y(40)), (19 + w, Y(41)), (15 + w, Y(40))]
        c.layer(lambda d: d.polygon(cape, fill=255), PAL["n"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= 28 + w), PAL["N"]))
    elif K["tail"] == "scarf":
        tail = [(29, Y(27)), (35 + hair_wind, Y(28)), (39 + hair_wind, Y(31 - flap)), (36 + hair_wind, Y(31)), (33, Y(30)), (29, Y(30))]
        c.layer(lambda d: d.polygon(tail, fill=255), PAL["R"])
    # long hair behind (female, heads that show hair)
    if FEMALE and not hooded:
        wide = 3 if K["head"] in ("plume", "helm") else 0  # out from under the helmet
        c.layer(lambda d: d.polygon([(hx0 - 11, Y(12)), (hx0 + 11, Y(12)), (hx0 + 12 + wide + hair_wind, Y(31)), (hx0 + 9 + wide + hair_wind, Y(34)),
                                     (hx0 - 9 - wide - hair_wind, Y(34)), (hx0 - 12 - wide - hair_wind, Y(31))], fill=255), PAL["a"],
                shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(29)), PAL["A"]))

    # legs
    dxl, dyl, dxr, dyr = legs
    for (x0, dx, dy) in ((19, dxl, dyl), (26, dxr, dyr)):
        c.layer(lambda d: d.rectangle([x0 + dx, G(33 + dy), x0 + 3 + dx, G(41 + dy)], fill=255), PAL["C"])
        c.layer(lambda d: d.rectangle([x0 - 1 + dx, G(40 + dy), x0 + 3 + dx, G(43 + dy)], fill=255), PAL["b"],
                shade=lambda cv, m: cv.put([(x0 - 1 + k + dx, G(43 + dy)) for k in range(5)], PAL["B"]))

    # torso: tunic, robe (to the knees) or a short skirt
    def torso(d):
        d.rounded_rectangle([17, Y(25), 31, Y(36)], 3, fill=255)
        if K["robe"]: d.polygon([(17, Y(31)), (31, Y(31)), (33, Y(40)), (15, Y(40))], fill=255)
        elif FEMALE: d.polygon([(17, Y(32)), (31, Y(32)), (33, Y(38)), (15, Y(38))], fill=255)
    def torso_shade(cv, m):
        cv.px[m & (XS >= 28)] = PAL["C"]
        cv.put([(x, Y(33)) for x in range(17, 32)], PAL["b"]); cv.put([(23, Y(33)), (24, Y(33))], PAL["y"])
        if K["robe"]: cv.put([(x, Y(39)) for x in range(16, 33)], PAL["r"])
        if K.get("tabard"):
            cv.put([(x, y) for x in range(21, 28) for y in range(Y(26), Y(37))], PAL["r"]); cv.put([(27, y) for y in range(Y(26), Y(37))], PAL["R"])
            cv.put([(x, Y(33)) for x in range(17, 32)], PAL["b"]); cv.put([(23, Y(33)), (24, Y(33))], PAL["y"])
        if CLS == "cleric": cv.put([(24, Y(27)), (24, Y(28)), (24, Y(29)), (24, Y(30)), (23, Y(28)), (25, Y(28))], PAL["r"])
    c.layer(torso, PAL["c"], shade=torso_shade)

    # arms and what the hands hold; the off-hand's shield goes in front later
    def weapon(kind, hx, hy, vx, vy, side):
        n = math.hypot(vx, vy) or 1; ux, uy = vx / n, vy / n
        P = lambda k: (hx + ux * k, hy + uy * k)
        if kind == "dagger":
            c.layer(lambda d: d.line([P(2), P(7)], fill=255, width=2), PAL["m"])
        elif kind == "sword":
            c.layer(lambda d: d.line([P(2), P(11)], fill=255, width=2), PAL["m"])
            c.layer(lambda d: d.line([(hx + uy * 2 + ux * 2, hy - ux * 2 + uy * 2), (hx - uy * 2 + ux * 2, hy + ux * 2 + uy * 2)], fill=255, width=1), PAL["R"])
        elif kind == "greatsword":
            ux, uy = (0.35, -1.0) if hy > Y(24) else (0.95, -0.35)
            n2 = math.hypot(ux, uy); ux, uy = ux / n2, uy / n2
            P = lambda k: (hx + ux * k, hy + uy * k)
            c.layer(lambda d: d.line([P(-4), P(1)], fill=255, width=2), PAL["b"])
            c.layer(lambda d: d.polygon([(P(3)[0] - uy * 2.5, P(3)[1] + ux * 2.5), (P(3)[0] + uy * 2.5, P(3)[1] - ux * 2.5),
                                         (P(27)[0] + uy * 2, P(27)[1] - ux * 2), P(31), (P(27)[0] - uy * 2, P(27)[1] + ux * 2)], fill=255), PAL["m"],
                    shade=lambda cv, m: (lambda mm: cv.px.__setitem__((np.array(mm) > 0) & m, PAL["M"]))(
                        (lambda im: (ImageDraw.Draw(im).line([P(4), P(27)], fill=255), im)[1])(Image.new("L", (S, S)))))
            c.layer(lambda d: d.line([(P(2)[0] - uy * 5, P(2)[1] + ux * 5), (P(2)[0] + uy * 5, P(2)[1] - ux * 5)], fill=255, width=2), PAL["R"])
        elif kind == "mace":
            c.layer(lambda d: d.line([P(1), P(7)], fill=255, width=1), PAL["b"])
            x, y = P(8); c.layer(lambda d: d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=255), PAL["r"], shade=lambda cv, m: cv.put([(round(x) - 1, round(y) - 1)], PAL["w"]))
        elif kind == "staff":  # held upright whatever the arm does
            c.layer(lambda d: d.line([(hx, hy + 6), (hx, hy - 14)], fill=255, width=2), PAL["x"])
            c.layer(lambda d: d.ellipse([hx - 2, hy - 18, hx + 2, hy - 14], fill=255), PAL["X"], shade=lambda cv, m: cv.put([(hx - 1, hy - 17)], PAL["w"]))
        elif kind == "book":
            bx = round(hx) + side * 2
            c.layer(lambda d: d.rectangle([min(bx, bx + side * 6), hy - 4, max(bx, bx + side * 6), hy + 3], fill=255), PAL["x"],
                    shade=lambda cv, m: cv.put([(bx + side * 3, round(hy) - 3 + k) for k in range(7)] + [(bx + side * 5, round(hy) - 1), (bx + side * 4, round(hy) - 1)], PAL["X"]))
        elif kind == "orb":
            x, y = hx + side * 2, hy - 4
            c.layer(lambda d: d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=255), PAL["x"], shade=lambda cv, m: cv.put([(x - 1, y - 2), (x - 2, y - 1)], PAL["X"]))
        elif kind == "bow":  # an arc across the arm
            px, py = -uy, ux
            pts = [(hx + px * k + ux * (2 - abs(k) * 0.25 * abs(k) / 3), hy + py * k + uy * (2 - abs(k) * 0.25 * abs(k) / 3)) for k in range(-9, 10)]
            c.layer(lambda d: d.line(pts, fill=255, width=2), PAL["x"])
            m = Image.new("L", (S, S)); ImageDraw.Draw(m).line([pts[0], pts[-1]], fill=255)
            c.px[np.array(m) > 0] = PAL["X"]

    def arm(sx, sy, hx, hy, kind, side):
        hy2 = Y(hy)
        c.layer(lambda d: d.line([(sx, Y(sy)), (hx, hy2)], fill=255, width=3), PAL["c" if not K["plates"] else "C"])
        hand = lambda: c.layer(lambda d: d.ellipse([hx - 1, hy2 - 1, hx + 1, hy2 + 1], fill=255), PAL["s"])
        if kind == "greatsword":  # drawn last, in front of the head and shoulders
            later.append(lambda: (weapon(kind, hx, hy2, hx - sx, hy2 - Y(sy), side), hand())); return
        if kind and kind != "shield": weapon(kind, hx, hy2, hx - sx, hy2 - Y(sy), side)
        hand()

    later = []
    (lx, ly), (rx, ry) = arms
    arm(18, 27, lx, ly, K["off"], -1); arm(30, 27, rx, ry, K["main"], 1)
    if K["plates"]:
        for x0 in (14, 28):
            c.layer(lambda d: d.ellipse([x0, Y(23), x0 + 6, Y(28)], fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(27)), PAL["H"]))

    # head
    def face_features(c, top):
        ex = (hx0 - 5, hx0 + 3); ey = Y(15)
        if eyes in ("open", "wide"):
            h = 4 if eyes == "wide" else 3
            for x in ex:
                c.put([(x, ey + i) for i in range(h)] + [(x + 1, ey + i) for i in range(h)], PAL["e"]); c.put([(x, ey)], PAL["w"])
            if FEMALE: c.put([(ex[0] - 1, ey - 1), (ex[1] + 2, ey - 1)], PAL["e"])
        elif eyes == "blink":
            for x in ex: c.put([(x - 1, ey + 2), (x, ey + 2), (x + 1, ey + 2), (x + 2, ey + 2)], PAL["e"])
        elif eyes == "happy":
            for x in ex: c.put([(x - 1, ey + 2), (x, ey + 1), (x + 1, ey + 1), (x + 2, ey + 2)], PAL["e"])
        elif eyes == "squeeze":
            c.put([(ex[0] - 1, ey), (ex[0], ey + 1), (ex[0] + 1, ey + 2), (ex[0], ey + 3), (ex[0] - 1, ey + 4)], PAL["e"])
            c.put([(ex[1] + 2, ey), (ex[1] + 1, ey + 1), (ex[1], ey + 2), (ex[1] + 1, ey + 3), (ex[1] + 2, ey + 4)], PAL["e"])
        elif eyes == "sad":
            for x in ex: c.put([(x, ey + 2), (x + 1, ey + 2), (x, ey + 3), (x + 1, ey + 3)], PAL["e"])
            c.put([(ex[0] - 1, ey), (ex[0], ey), (ex[0] + 1, ey - 1)], PAL["e"]); c.put([(ex[1], ey - 1), (ex[1] + 1, ey), (ex[1] + 2, ey)], PAL["e"])
        elif eyes == "dizzy":
            for x in ex: c.put([(x - 1, ey), (x, ey), (x + 1, ey), (x + 2, ey), (x + 2, ey + 1), (x + 2, ey + 2), (x + 1, ey + 2), (x, ey + 2), (x, ey + 1), (x - 1, ey + 3)], PAL["e"])
        c.put([(hx0 - 7, Y(18 if K.get("mask") else 19)), (hx0 - 6, Y(18 if K.get("mask") else 19)), (hx0 + 6, Y(18 if K.get("mask") else 19)), (hx0 + 7, Y(18 if K.get("mask") else 19))], PAL["p"])

        if mouth == "open" and K.get("mask"):  # a dent in the cloth
            c.put([(hx0 - 1, Y(22)), (hx0, Y(22)), (hx0 + 1, Y(22)), (hx0 - 1, Y(23)), (hx0, Y(23)), (hx0 + 1, Y(23))], PAL["H"])
        elif mouth == "small" and K.get("mask"): pass
        elif mouth == "open":
            c.layer(lambda d: d.ellipse([hx0 - 2, Y(20), hx0 + 2, Y(23)], fill=255), PAL["e"], outline=None)
            c.put([(hx0 - 1, Y(23)), (hx0, Y(23)), (hx0 + 1, Y(23))], PAL["o"])
        elif mouth == "small":
            c.put([(hx0, Y(21)), (hx0 - 1, Y(21)), (hx0, Y(22)), (hx0 - 1, Y(22))], PAL["e"])
        elif not K.get("mask"):  # a little smile
            c.put([(hx0 - 2, Y(20)), (hx0 - 1, Y(21)), (hx0, Y(21)), (hx0 + 1, Y(20))], PAL["e"])

    head = K["head"]
    if hooded:
        w = hair_wind
        if head == "robin":  # the hood's long point, hanging down the back
            c.layer(lambda d: d.polygon([(hx0 + 2, Y(3)), (hx0 + 10, Y(4)), (hx0 + 17 + w, Y(10)), (hx0 + 20 + w, Y(20)), (hx0 + 17 + w, Y(17)), (hx0 + 12, Y(14))], fill=255), PAL["H"])
        if head == "ninja":  # headband knot tails, behind
            c.layer(lambda d: d.polygon([(hx0 + 9, Y(8)), (hx0 + 17 + w, Y(6 + flap)), (hx0 + 18 + w, Y(9 + flap)), (hx0 + 11, Y(11))], fill=255), PAL["R"])
            c.layer(lambda d: d.polygon([(hx0 + 9, Y(10)), (hx0 + 16 + w, Y(13 + flap)), (hx0 + 15 + w, Y(15 + flap)), (hx0 + 9, Y(12))], fill=255), PAL["r"])
        c.layer(lambda d: d.ellipse([hx0 - 12, Y(3), hx0 + 12, Y(26)], fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 7), PAL["H"]))
        if head == "ninja":  # only the eyes show
            c.layer(lambda d: d.rounded_rectangle([hx0 - 8, Y(12), hx0 + 8, Y(20)], 2, fill=255), PAL["s"], outline=PAL["H"])
            c.layer(lambda d: d.rectangle([hx0 - 12, Y(8), hx0 + 12, Y(10)], fill=255), PAL["r"], outline=None)
            c.put([(x, Y(10)) for x in range(hx0 - 11, hx0 + 12)], PAL["R"]); c.put([(hx0 + 9, Y(9)), (hx0 + 10, Y(9))], PAL["R"])
            # a metal plate on the band
            c.put([(hx0 - 2 + k, Y(9)) for k in range(5)], PAL["m"])
        else:
            c.layer(lambda d: d.rounded_rectangle([hx0 - 8, Y(11), hx0 + 8, Y(24)], 4, fill=255), PAL["s"], outline=PAL["H"])
            c.put([(x, Y(11)) for x in range(hx0 - 6, hx0 + 7)], PAL["S"])
        if head == "robin":  # fringe peeking out, and a feather
            c.put([(x, Y(12)) for x in range(hx0 - 6, hx0 + 7, 2)] + [(x, Y(11)) for x in range(hx0 - 7, hx0 + 8)], PAL["a"])
            c.layer(lambda d: d.line([(hx0 - 9, Y(8)), (hx0 - 15, Y(1))], fill=255, width=2), PAL["o"])
        face_features(c, 11)
        if K.get("gem"): c.layer(lambda d: d.rectangle([hx0 - 1, Y(9), hx0 + 1, Y(11)], fill=255), PAL["r"], shade=lambda cv, m: cv.put([(hx0 - 1, Y(9))], PAL["w"]))
        if FEMALE:
            for sx, d in ((hx0 - 9, -1), (hx0 + 8, 1)):
                lock = [(sx, Y(13)), (sx + 1, Y(13)), (sx + 1 + d * hair_wind, Y(25)), (sx + d * 2 + d * hair_wind, Y(28)), (sx + d * hair_wind, Y(24))]
                c.layer(lambda dd: dd.polygon(lock, fill=255), PAL["a"], shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(22)), PAL["A"]))
    else:
        # a round face with hair on top, then the headgear
        if head == "band" and FEMALE:  # top knot, behind the head
            c.layer(lambda d: d.ellipse([hx0 + 3, Y(0), hx0 + 9, Y(6)], fill=255), PAL["a"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 7), PAL["A"]))
            c.layer(lambda d: d.rectangle([hx0 + 4, Y(5), hx0 + 7, Y(6)], fill=255), PAL["r"], outline=None)
        c.layer(lambda d: d.ellipse([hx0 - 11, Y(4), hx0 + 11, Y(25)], fill=255), PAL["s"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 8), PAL["S"]))
        c.layer(lambda d: d.chord([hx0 - 11, Y(4), hx0 + 11, Y(16)], 180, 360, fill=255), PAL["a"], outline=None)
        fringe = [(hx0 - 11, Y(13)), (hx0 + 11, Y(13))] + [(hx0 + 11 - k * 2, Y(13) + (1 if k % 2 else 3)) for k in range(12)]
        c.layer(lambda d: d.polygon([(hx0 - 11, Y(8)), (hx0 + 11, Y(8)), (hx0 + 11, Y(19)), (hx0 + 9, Y(16)), (hx0 + 7, Y(13)), (hx0 + 4, Y(11)),
                                     (hx0 + 1, Y(10)), (hx0 - 1, Y(12)), (hx0 - 4, Y(14)), (hx0 - 7, Y(13)), (hx0 - 9, Y(14)), (hx0 - 10, Y(19)), (hx0 - 11, Y(19))], fill=255), PAL["a"], outline=None,
                shade=lambda cv, m: cv.put([(hx0 - 6 + k, Y(7) + (k // 4)) for k in range(9)], tuple(min(255, v + 40) for v in PAL["a"][:3]) + (255,)))
        face_features(c, 13)
        if head == "plume":
            c.layer(lambda d: d.chord([hx0 - 12, Y(2), hx0 + 12, Y(24)], 180, 360, fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 7), PAL["H"]))
            for x0 in (hx0 - 12, hx0 + 9):
                c.layer(lambda d: d.rectangle([x0, Y(12), x0 + 3, Y(21)], fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(19)), PAL["H"]))
            c.put([(hx0, Y(4 + k)) for k in range(9)], PAL["H"])
            c.layer(lambda d: d.polygon([(hx0 - 2, Y(3)), (hx0 + 2, Y(0)), (hx0 + 9 + hair_wind, Y(-1)), (hx0 + 14 + hair_wind, Y(4)), (hx0 + 10 + hair_wind, Y(3)), (hx0 + 2, Y(5))], fill=255), PAL["r"],
                    shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 9), PAL["R"]))
        elif head == "helm":
            c.layer(lambda d: d.chord([hx0 - 12, Y(2), hx0 + 12, Y(26)], 180, 360, fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 7), PAL["H"]))
            for x0 in (hx0 - 12, hx0 + 9):
                c.layer(lambda d: d.rectangle([x0, Y(13), x0 + 3, Y(23)], fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(21)), PAL["H"]))
            c.put([(x, Y(13)) for x in range(hx0 - 9, hx0 + 10)], PAL["H"])
            c.layer(lambda d: d.rectangle([hx0 - 1, Y(1), hx0 + 1, Y(12)], fill=255), PAL["r"], outline=PAL["R"])
        elif head == "witch":
            c.layer(lambda d: d.polygon([(hx0 - 9, Y(9)), (hx0 + 9, Y(9)), (hx0 + 5, Y(2)), (hx0 + 9 + hair_wind, Y(-2)), (hx0 + 3, Y(0)), (hx0 - 3, Y(3))], fill=255), PAL["h"],
                    shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 4), PAL["H"]))
            c.layer(lambda d: d.ellipse([hx0 - 15, Y(8), hx0 + 15, Y(12)], fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (YS >= Y(11)), PAL["H"]))
            c.put([(x, Y(8)) for x in range(hx0 - 8, hx0 + 9)] + [(x, Y(7)) for x in range(hx0 - 8, hx0 + 8)], PAL["r"])
        elif head == "mitre":
            c.layer(lambda d: d.polygon([(hx0 - 8, Y(10)), (hx0 + 8, Y(10)), (hx0 + 7, Y(2)), (hx0, Y(-1)), (hx0 - 7, Y(2))], fill=255), PAL["h"],
                    shade=lambda cv, m: cv.px.__setitem__(m & (XS >= hx0 + 5), PAL["H"]))
            c.put([(hx0, Y(2 + k)) for k in range(7)] + [(hx0 - 2 + k, Y(4)) for k in range(5)], PAL["r"])
            c.put([(x, Y(9)) for x in range(hx0 - 8, hx0 + 9)], PAL["r"])
        elif head == "circlet":
            c.put([(x, Y(10) + (1 if abs(x - hx0) > 7 else 0)) for x in range(hx0 - 11, hx0 + 12)], PAL["r"])
            c.put([(x, Y(11) + (1 if abs(x - hx0) > 7 else 0)) for x in range(hx0 - 11, hx0 + 12)], PAL["R"])
            c.layer(lambda d: d.polygon([(hx0, Y(6)), (hx0 + 2, Y(9)), (hx0, Y(12)), (hx0 - 2, Y(9))], fill=255), hexc("#c04fd0"), outline=PAL["R"],
                    shade=lambda cv, m: cv.put([(hx0 - 1, Y(8))], PAL["w"]))
        elif head == "band":
            c.layer(lambda d: d.rectangle([hx0 - 11, Y(9), hx0 + 11, Y(11)], fill=255), PAL["r"], shade=lambda cv, m: cv.put([(x, Y(11)) for x in range(hx0 - 11, hx0 + 12)], PAL["R"]))
            c.put([(hx0, Y(10))], PAL["X"])
            c.layer(lambda d: d.polygon([(hx0 + 11, Y(9)), (hx0 + 16 + hair_wind, Y(12)), (hx0 + 15 + hair_wind, Y(14)), (hx0 + 11, Y(11))], fill=255), PAL["R"])


    # scarf around the neck (assassin, ranger) or a collar
    if K["head"] == "robin":
        cap = [(16, Y(23)), (32, Y(23)), (34, Y(29)), (31, Y(27)), (28, Y(30)), (25, Y(27)), (22, Y(30)), (19, Y(27)), (16, Y(30)), (14, Y(29))]
        c.layer(lambda d: d.polygon(cap, fill=255), PAL["h"], shade=lambda cv, m: cv.px.__setitem__(m & (XS >= 29), PAL["H"]))
    else:
        c.layer(lambda d: d.rounded_rectangle([18, Y(24), 30, Y(27)], 1, fill=255), PAL["r"],
                shade=lambda cv, m: cv.put([(x, Y(27)) for x in range(19, 30)], PAL["R"]))

    # shield in front, on the off-hand
    if K["off"] == "shield":
        x, y = lx, Y(ly)
        c.layer(lambda d: d.polygon([(x - 5, y - 5), (x + 5, y - 5), (x + 5, y + 2), (x, y + 7), (x - 5, y + 2)], fill=255), PAL["x"],
                shade=lambda cv, m: (cv.put([(x, y - 4 + k) for k in range(10)] + [(x - 4 + k, y - 1) for k in range(9)], PAL["X"])))

    # the spirits (spiritmaster): fire, water, earth and wind floating around
    if K.get("spirit"):
        b = lambda k: (1 if (t + k) % 2 else 0)
        def eyes2(x, y): c.put([(x - 1, y), (x + 1, y)], PAL["e"])
        x, y = 6, 7 + b(0)   # fire
        c.layer(lambda d: d.polygon([(x - 3, y + 3), (x - 3, y), (x - 1, y - 4), (x, y - 1), (x + 2, y - 5), (x + 3, y), (x + 3, y + 3), (x, y + 5)], fill=255), hexc("#ff8a3d"),
                shade=lambda cv, m: cv.put([(x - 1, y + 2), (x, y + 3), (x + 1, y + 2)], hexc("#ffe066"))); eyes2(x, y + 1)
        x, y = 42, 7 + b(1)  # water
        c.layer(lambda d: d.polygon([(x, y - 5), (x + 3, y), (x + 3, y + 2), (x + 1, y + 4), (x - 1, y + 4), (x - 3, y + 2), (x - 3, y)], fill=255), hexc("#4aa8ff"),
                shade=lambda cv, m: cv.put([(x - 2, y), (x - 1, y - 1)], hexc("#d6efff"))); eyes2(x, y + 1)
        x, y = 5, 40 + b(2)  # earth
        c.layer(lambda d: d.rounded_rectangle([x - 3, y - 3, x + 3, y + 3], 2, fill=255), hexc("#9a7448"),
                shade=lambda cv, m: cv.put([(x, y - 4), (x + 1, y - 5), (x - 1, y - 5)], hexc("#7ed957"))); eyes2(x, y)
        x, y = 43, 40 + b(3)  # wind
        c.layer(lambda d: d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=255), hexc("#a8f0e4"),
                shade=lambda cv, m: cv.put([(x - 2, y + 1), (x - 1, y + 2), (x, y + 2), (x + 1, y + 1), (x + 4, y - 2), (x + 4, y + 1)], hexc("#e9fffb"))); eyes2(x, y - 1)

    for f in later: f()
    for kind, pts in extras:
        c.put(pts, PAL[kind])
    return c.image()


# --- animations -------------------------------------------------------------------------------------------
def sound_lines(t):
    o = t % 2
    return [("y", [(7 - o, 10), (6 - o, 11), (6 - o, 12), (7 - o, 13), (4 - o, 8), (3 - o, 10), (3 - o, 13), (4 - o, 15),
                   (40 + o, 10), (41 + o, 11), (41 + o, 12), (40 + o, 13), (43 + o, 8), (44 + o, 10), (44 + o, 13), (43 + o, 15)])]

def sparkle(x, y, col="y"): return (col, [(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)])

def confetti(t):
    import random
    r = random.Random(t)
    return [(r.choice("yoqtu"), [(r.randrange(2, 46), r.randrange(0, 30))]) for _ in range(14)]

DOWN = ((14, 35), (34, 35))
UP = ((9, 12), (39, 12))
anims = {}
anims["idle"] = [frame(t=0), frame(by=0, flap=0.3, t=1), frame(by=1, flap=0.5, t=2), frame(by=1, eyes="blink", flap=0.3, t=3)]
walk = [(-2, 0, 2, 0, 0), (0, -3, 0, 0, -1), (2, -1, -2, 0, 0), (2, 0, -2, 0, 0), (0, 0, 0, -3, -1), (-2, 0, 2, -1, 0)]
anims["walk"] = [frame(legs=l[:4], by=l[4], gy=0, flap=(i % 2) * 0.6,
                       arms=((14 + (1 if i < 3 else -1), 35), (34 + (-1 if i < 3 else 1), 35))) for i, l in enumerate(walk)]
anims["shout"] = [frame(eyes="squeeze", mouth="open", arms=UP, flap=1.2 * (i % 2), by=-(i % 2), extras=sound_lines(i)) for i in range(4)]
jump = [0, -1, -2, -3, -2, -1]
anims["happy"] = [frame(eyes="happy" if 1 <= i <= 4 else "open", arms=UP if 2 <= i <= 3 else DOWN, gy=j, flap=1.2 if j < -1 else 0.2,
                        legs=(0, -2, 0, -2) if j < -1 else (0, 0, 0, 0), extras=[sparkle(6, 6 + i), sparkle(42, 9 - i)] if i % 2 else [])
                  for i, j in enumerate(jump)]
anims["celebrate"] = [frame(eyes="happy", mouth="small", arms=UP if i % 2 == 0 else ((12, 18), (36, 18)), gy=-(i % 2) * 3,
                            flap=1.4 * (i % 2), extras=confetti(i)) for i in range(6)]
anims["sad"] = [frame(eyes="sad", by=2, arms=((15, 37), (33, 37)), flap=-1,
                      extras=[("t", [(19, 20 + i % 2), (19, 21 + i % 2), (18, 22 + i % 2)]), ("t", [(12, 2 + i % 2), (12, 4 + i % 2), (36, 1 + i % 2), (36, 3 + i % 2)])])
                for i in range(4)]
anims["held"] = [frame(eyes="wide", mouth="small", arms=((14, 1), (34, 1)), legs=(-1 + (i % 2) * 2, 2, 1 - (i % 2) * 2, 2), flap=1.0 + 0.4 * (i % 2),
                       extras=[("t", [(37, 10), (37, 11), (36, 11)])]) for i in range(4)]
spin = frame(eyes="squeeze", mouth="open", arms=((11, 22), (37, 22)), legs=(-2, -1, 2, -1), flap=1.4)
anims["thrown"] = [spin.rotate(-90 * i, resample=Image.NEAREST) for i in range(4)]

def stars(t):
    pts = []
    for k in range(3):
        a = t * 0.9 + k * 2.1
        pts.append(sparkle(int(24 + 13 * math.cos(a)), int(4 + 3 * math.sin(a))))
    return pts
anims["dizzy"] = [frame(eyes="dizzy", mouth="small", lean=(-1, 0, 1, 0)[i], extras=stars(i), flap=-0.5) for i in range(4)]

def squash(img, w, h):
    big = img.resize((w, h), Image.NEAREST)
    out = Image.new("RGBA", (S, S))
    out.paste(big, ((S - w) // 2, S - h - (S - 44 - 1) + 0), big)
    return out
base = frame(eyes="squeeze", arms=((12, 32), (36, 32)), flap=1.3)
anims["land"] = [squash(base, 56, 38), squash(frame(eyes="open", flap=-0.6), 44, 50), frame()]

# rift: hanging on to a rock, pulled sideways (head to the left), legs flapping in the wind
rift = []
for i in range(4):
    f = frame(eyes="squeeze", mouth="open", arms=((21, -1), (27, -1)), gy=3, legs=(-1, -1 + (i % 2) * 2, 1, 1 - (i % 2) * 2), flap=-1.2 + 0.5 * (i % 2), hair_wind=3)
    f = f.rotate(90, resample=Image.NEAREST, expand=False)
    c = Canvas(); c.px = np.array(f)
    c.layer(lambda d: d.polygon([(0, 17), (3, 16), (4, 22), (4, 30), (0, 31)], fill=255), PAL["g"],
            shade=lambda cv, m: cv.px.__setitem__(m & (np.arange(S)[:, None] >= 26), PAL["G"]))
    # the hands again over the rock
    c.layer(lambda d: d.ellipse([2, 19, 4, 21], fill=255), PAL["s"]); c.layer(lambda d: d.ellipse([2, 25, 4, 27], fill=255), PAL["s"])
    off = i * 3
    c.put([((10 + off + k) % 48, 8) for k in range(5)] + [((30 + off + k) % 48, 40) for k in range(6)] + [((20 + off * 2 + k) % 48, 44) for k in range(4)], PAL["T"])
    rift.append(c.image())
anims["rift"] = rift

ORDER = ["idle", "walk", "shout", "happy", "celebrate", "sad", "held", "thrown", "dizzy", "land", "rift"]
cols = max(len(anims[n]) for n in ORDER)
sheet = Image.new("RGBA", (cols * S, len(ORDER) * S))
for r, n in enumerate(ORDER):
    for k, f in enumerate(anims[n]): sheet.paste(f, (k * S, r * S), f)
name = f"{CLS}-{GENDER}-{FACTION}"
sheet.save(f"{OUT}/{name}.png")

if "--preview" in sys.argv:
    # previews: the sheet at 4x on a dark background, and a GIF going through every animation
    Z = 4
    bg = Image.new("RGBA", sheet.size, (38, 42, 50, 255)); bg.alpha_composite(sheet)
    bg.resize((sheet.width * Z, sheet.height * Z), Image.NEAREST).save(f"{OUT}/{name}-sheet-4x.png")
    DUR = {"idle": 260, "walk": 120, "shout": 110, "happy": 90, "celebrate": 130, "sad": 380, "held": 160, "thrown": 80, "dizzy": 160, "land": 120, "rift": 100}
    frames, durs = [], []
    for n in ORDER:
        reps = 3 if len(anims[n]) <= 4 else 2
        for _ in range(reps):
            for f in anims[n]:
                b = Image.new("RGBA", (S, S), (38, 42, 50, 255)); b.alpha_composite(f)
                frames.append(b.resize((S * 5, S * 5), Image.NEAREST).convert("P", palette=Image.ADAPTIVE)); durs.append(DUR[n])
    frames[0].save(f"{OUT}/{name}.gif", save_all=True, append_images=frames[1:], duration=durs, loop=0, disposal=2)
