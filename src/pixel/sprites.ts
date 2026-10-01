import { Grid } from "./grid";

/**
 * Small sprites authored as text so they stay readable in code review.
 * Each character maps to a colour; "." is transparent.
 */
function art(rows: string[], colors: Record<string, string>): Grid {
  const g = new Grid(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && g.set(x, y, colors[ch] ?? null)));
  return g;
}

export const SUN = art(
  [
    "...y..y...",
    "..........",
    "y..YYYY..y",
    "..YYOOYY..",
    "..YOOOOY..",
    "..YOOOOY..",
    "..YYOOYY..",
    "y..YYYY..y",
    "..........",
    "...y..y...",
  ],
  { Y: "#ffe27a", O: "#fff3b8", y: "#ffd25a" },
);

export const MOON = art(
  [
    "..mmmm..",
    ".mMMm...",
    "mMMm....",
    "mMMm....",
    "mMMm....",
    "mMMMm...",
    ".mMMMmm.",
    "..mmmm..",
  ],
  { M: "#fff6d6", m: "#e6dcb0" },
);

export const CLOUDS = [
  art(
    [
      "....wwww......",
      "..wwWWWWw.....",
      ".wWWWWWWWwww..",
      "wWWWWWWWWWWWw.",
      "wWWWWWWWWWWWWw",
      ".ssssssssssss.",
    ],
    { W: "#ffffff", w: "#f1f6fb", s: "#d8e6f2" },
  ),
  art(
    [
      "......www....",
      "..www.WWWw...",
      ".wWWWwWWWWw..",
      "wWWWWWWWWWWw.",
      ".sssssssssss.",
    ],
    { W: "#ffffff", w: "#f1f6fb", s: "#d8e6f2" },
  ),
];

export const HEART = art(
  [
    ".rr.rr.",
    "rRRrRRr",
    "rRRRRRr",
    ".rRRRr.",
    "..rRr..",
    "...r...",
  ],
  { R: "#ff7a95", r: "#d94f6c" },
);

export const SPARKLE = art(
  [
    "..y..",
    "..Y..",
    "yYWYy",
    "..Y..",
    "..y..",
  ],
  { Y: "#ffd84d", y: "#f2b632", W: "#fffbe0" },
);

export const STAR_TWINKLE = [
  art(["w"], { w: "#fff6d6" }),
  art([".w.", "wWw", ".w."], { W: "#ffffff", w: "#cfd8ff" }),
];

export const ZZZ = art(
  [
    "zzzz",
    "..z.",
    ".z..",
    "zzzz",
  ],
  { z: "#e9e4ff" },
);

export const NOTE = art(
  [
    "..nnn",
    "..n.n",
    "..n.n",
    "nnn.n",
    "nnn..",
  ],
  { n: "#5b4a8f" },
);

export const DROP = art([".b.", "bBb", "bBb", ".b."], { B: "#8fd3ff", b: "#4fa6e0" });

export const SWEAT = art([".d.", "dDd", ".d."], { D: "#bfe6ff", d: "#7fbfe6" });

export const DUST = art([".dd.", "dDDd", ".dd."], { D: "#e6d8b8", d: "#cdbb94" });

export const DIZZY_STAR = art(["..y..", ".yYy.", "yYYYy", ".y.y."], { Y: "#ffe27a", y: "#e0a92b" });

export const QUEST = art(
  [
    ".kkkkk.",
    "kYYYYYk",
    "kYYKYYk",
    "kYYKYYk",
    "kYYKYYk",
    "kYYYYYk",
    "kYYKYYk",
    "kYYYYYk",
    ".kkkkk.",
    "...k...",
  ],
  { k: "#3a2a22", Y: "#ffcf4a", K: "#3a2a22" },
);

export const WATERING_CAN = art(
  [
    "....bbbbb.......",
    "...b.....b......",
    "...b.....b......",
    ".GGGGGGGGGG.....",
    "GgggggggggG...s.",
    "GgggggggggGsss..",
    "GgggggggggGs....",
    "GgggggggggG.....",
    ".GGGGGGGGG......",
  ],
  { G: "#3f7f8f", g: "#68b4c4", b: "#2f5f6b", s: "#3f7f8f" },
);

export const FIREFLY = [art(["Y"], { Y: "#fff59a" }), art([".y.", "yYy", ".y."], { Y: "#fffbd0", y: "#e8e070" })];

export const SEED = art(["w.", ".s"], { w: "#ffffff", s: "#c9c3b0" });
