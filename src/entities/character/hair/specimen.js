// T1 test specimens, not approved hairstyles. Angular controls: theta/phi degrees, clearance metres.
export const specimenParts=[
  {
    "version": 1,
    "id": "hair-t1-front",
    "slot": "front",
    "bodies": [
      "male",
      "female"
    ],
    "join": "scalp-v1",
    "compatibility": [
      "t1-specimen"
    ],
    "material": "debug-t1",
    "lod": "near-t1",
    "physics": "fixed-t1",
    "clumps": [
      {
        "rootAnchor": {
          "theta": 12,
          "phi": -25
        },
        "controlPoints": [
          [
            12,
            -25,
            0.004
          ],
          [
            27,
            -23,
            0.017
          ],
          [
            43,
            -19,
            0.022
          ],
          [
            65,
            -8,
            0.018
          ]
        ],
        "widthProfile": [
          0.018,
          0.036,
          0.029,
          0.0018
        ],
        "depthProfile": [
          0.006,
          0.012,
          0.009,
          0.0012
        ],
        "twistProfile": [
          0,
          5,
          -10
        ],
        "crossSection": "lens",
        "grooves": 2,
        "segments": 24,
        "sides": 10,
        "physicsProfile": "fixed-t1"
      },
      {
        "rootAnchor": {
          "theta": 14,
          "phi": 30
        },
        "controlPoints": [
          [
            14,
            30,
            0.004
          ],
          [
            29,
            32,
            0.017
          ],
          [
            45,
            29,
            0.022
          ],
          [
            66,
            23,
            0.018
          ]
        ],
        "widthProfile": [
          0.016,
          0.033,
          0.027,
          0.0018
        ],
        "depthProfile": [
          0.006,
          0.012,
          0.009,
          0.0012
        ],
        "twistProfile": [
          0,
          5,
          -10
        ],
        "crossSection": "lens",
        "grooves": 2,
        "segments": 24,
        "sides": 10,
        "physicsProfile": "fixed-t1"
      }
    ]
  },
  {
    "version": 1,
    "id": "hair-t1-middle",
    "slot": "middle",
    "bodies": [
      "male",
      "female"
    ],
    "join": "scalp-v1",
    "compatibility": [
      "t1-specimen"
    ],
    "material": "debug-t1",
    "lod": "near-t1",
    "physics": "fixed-t1",
    "clumps": [
      {
        "rootAnchor": {
          "theta": 18,
          "phi": 80
        },
        "controlPoints": [
          [
            18,
            80,
            0.004
          ],
          [
            39,
            82,
            0.017
          ],
          [
            63,
            83,
            0.024
          ],
          [
            90,
            79,
            0.02
          ]
        ],
        "widthProfile": [
          0.018,
          0.032,
          0.029,
          0.002
        ],
        "depthProfile": [
          0.006,
          0.012,
          0.011,
          0.0012
        ],
        "twistProfile": [
          0,
          5,
          -10
        ],
        "crossSection": "lens",
        "grooves": 2,
        "segments": 24,
        "sides": 10,
        "physicsProfile": "fixed-t1"
      }
    ]
  },
  {
    "version": 1,
    "id": "hair-t1-back",
    "slot": "back",
    "bodies": [
      "male",
      "female"
    ],
    "join": "scalp-v1",
    "compatibility": [
      "t1-specimen"
    ],
    "material": "debug-t1",
    "lod": "near-t1",
    "physics": "fixed-t1",
    "clumps": [
      {
        "rootAnchor": {
          "theta": 15,
          "phi": 165
        },
        "controlPoints": [
          [
            15,
            165,
            0.004
          ],
          [
            46,
            165,
            0.019
          ],
          [
            77,
            160,
            0.022
          ],
          [
            111,
            151,
            0.02
          ]
        ],
        "widthProfile": [
          0.018,
          0.041,
          0.03,
          0.002
        ],
        "depthProfile": [
          0.006,
          0.012,
          0.01,
          0.0012
        ],
        "twistProfile": [
          0,
          5,
          -10
        ],
        "crossSection": "lens",
        "grooves": 2,
        "segments": 24,
        "sides": 10,
        "physicsProfile": "fixed-t1"
      }
    ]
  }
];
