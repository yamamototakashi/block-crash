// Stage data per mode.
// Each stage is an array of 8-character row strings.
// Characters:
//   '.'      empty
//   'N'      normal block (color by row)
//   'T'      tough block (2 hits)
//   'B'      bomb (explodes, triggers neighbors)
//   'C'      chain block (triggers local chain)
//   'R'      rainbow block (wild color)
//   '1'-'7'  normal block with explicit color index (1..7)
//
// To add stages: push a new 8-wide array into the list.

(function (global) {
  const STAGES = {
    CLASSIC: [
      // 1 - warm up
      [
        "NNNNNNNN",
        "NNNNNNNN",
        "NNNNNNNN"
      ],
      // 2 - frame
      [
        ".NNNNNN.",
        "NNNNNNNN",
        "N......N",
        "NNNNNNNN",
        ".NNNNNN."
      ],
      // 3 - zig
      [
        "NNNNNNNN",
        "N.N..N.N",
        "NNNNNNNN",
        "N..NN..N",
        "NNNNNNNN"
      ],
      // 4 - tough band
      [
        "TTTTTTTT",
        "NNNNNNNN",
        "NNNNNNNN",
        "TTTTTTTT"
      ],
      // 5 - checker
      [
        "TNTNTNTN",
        "NTNTNTNT",
        "TNTNTNTN",
        "NTNTNTNT",
        "TNTNTNTN"
      ]
    ],

    RAINBOW: [
      // 1 - diagonal
      [
        "12345671",
        "23456712",
        "34567123",
        "45671234"
      ],
      // 2 - sparse rainbows
      [
        "RNNNNNNR",
        "NRNNNNRN",
        "NNRNNRNN",
        "NNNRRNNN"
      ],
      // 3 - chain field
      [
        "CNCNCNCN",
        "NCNCNCNC",
        "CNCNCNCN"
      ],
      // 4 - banner
      [
        "RRRRRRRR",
        "1234567R",
        "R7654321",
        "RRRRRRRR"
      ],
      // 5 - spectrum
      [
        "11223344",
        "55667711",
        "22334455",
        "66771122",
        "RRRRRRRR"
      ]
    ],

    CHAOS: [
      // 1 - mixed light
      [
        "NNNNNNNN",
        ".N.N.N.N",
        "N.N.N.N.",
        "NNNNNNNN"
      ],
      // 2 - bomb corners
      [
        "BNNNNNNB",
        "NTTTTTTN",
        "NTNNNNTN",
        "NTTTTTTN",
        "BNNNNNNB"
      ],
      // 3 - heavy chaos
      [
        "NNCNNCNN",
        "NTTNNTTN",
        "CNNBBNNC",
        "NTTNNTTN",
        "NNCNNCNN"
      ],
      // 4 - bomb checker
      [
        "TBTBTBTB",
        "NNNNNNNN",
        "BTBTBTBT",
        "NNNNNNNN",
        "TBTBTBTB"
      ],
      // 5 - pressure
      [
        "RRRRRRRR",
        "NBNCNBNC",
        "TTTTTTTT",
        "CNBNCNBN",
        "RRRRRRRR"
      ]
    ],

    PUZZLE: [
      // 1 - funnel
      [
        "...BB...",
        "..TTTT..",
        ".NNNNNN.",
        "NNNNNNNN"
      ],
      // 2 - triangle
      [
        "N......N",
        "NT....TN",
        "NTT..TTN",
        "NTTTTTTN",
        "NNNNNNNN"
      ],
      // 3 - box with bombs
      [
        "BTTTTTTB",
        "T......T",
        "T.NNNN.T",
        "T......T",
        "BTTTTTTB"
      ],
      // 4 - alternating tough
      [
        "TNTNTNTN",
        "NTNTNTNT",
        "BNBNBNBN",
        "NTNTNTNT",
        "TNTNTNTN"
      ],
      // 5 - final gauntlet
      [
        "CTCTCTCT",
        "TBTBTBTB",
        "CTCTCTCT",
        "TBTBTBTB",
        "CCCCCCCC"
      ]
    ]
  };

  const MODE_CONFIG = {
    CLASSIC: { itemRate: 0.10, chaos: false, rainbow: false, baseSpeed: 320, speedUp: 18 },
    RAINBOW: { itemRate: 0.22, chaos: false, rainbow: true,  baseSpeed: 310, speedUp: 16 },
    CHAOS:   { itemRate: 0.22, chaos: true,  rainbow: false, baseSpeed: 330, speedUp: 20 },
    PUZZLE:  { itemRate: 0.08, chaos: false, rainbow: false, baseSpeed: 300, speedUp: 16 }
  };

  // Validate rows are exactly 8 chars - log a warning if not (helps when adding stages).
  Object.keys(STAGES).forEach((mode) => {
    STAGES[mode].forEach((stage, i) => {
      stage.forEach((row, r) => {
        if (row.length !== 8) {
          console.warn('[stages] ' + mode + ' stage ' + (i + 1) + ' row ' + r + ' len=' + row.length);
        }
      });
    });
  });

  global.STAGES = STAGES;
  global.MODE_CONFIG = MODE_CONFIG;
})(window);
