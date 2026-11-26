// HAIR-11260710: preserved Flow Detail 7 front, independent middle/back bob study.
export const flowParts=[
  {
    "version": 1,
    "id": "hair-t1-front-flow",
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
          "theta": 31,
          "phi": -65
        },
        "controlPoints": [
          [
            31,
            -65,
            0.005
          ],
          [
            49,
            -67,
            0.01
          ],
          [
            70,
            -70,
            0.013
          ],
          [
            91,
            -75,
            0.013
          ],
          [
            104,
            -69,
            0.012
          ]
        ],
        "angularWidth": [
          30,
          31,
          27,
          16,
          2.7
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.004,
          0.0048,
          0.003,
          0.0008
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 3,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 1.2,
        "role": "left boundary outward"
      },
      {
        "rootAnchor": {
          "theta": 21,
          "phi": -49
        },
        "controlPoints": [
          [
            21,
            -49,
            0.006
          ],
          [
            42,
            -51,
            0.011
          ],
          [
            59,
            -45,
            0.015
          ],
          [
            76,
            -40,
            0.015
          ],
          [
            94,
            -44,
            0.014
          ],
          [
            101,
            -49,
            0.012
          ]
        ],
        "angularWidth": [
          32,
          36,
          31,
          24,
          12,
          3.3
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.0048,
          0.0056,
          0.003,
          0.0008
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 2.4,
        "role": "left supporting inward"
      },
      {
        "rootAnchor": {
          "theta": 12,
          "phi": -32
        },
        "controlPoints": [
          [
            12,
            -32,
            0.006
          ],
          [
            33,
            -35,
            0.012
          ],
          [
            55,
            -30,
            0.017
          ],
          [
            74,
            -28,
            0.019
          ],
          [
            92,
            -26,
            0.017
          ],
          [
            113,
            -25,
            0.014
          ]
        ],
        "angularWidth": [
          38,
          40,
          35,
          28,
          17,
          2.8
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.0048,
          0.006,
          0.004,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -5,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 3.8,
        "role": "left dominant sweep",
        "detail": {
          "start": 0.43,
          "hem": [
            [
              -1,
              0.9
            ],
            [
              -0.78,
              0.925
            ],
            [
              -0.57,
              0.79
            ],
            [
              -0.37,
              0.91
            ],
            [
              -0.1,
              0.935
            ],
            [
              0.14,
              0.925
            ],
            [
              0.37,
              0.86
            ],
            [
              0.55,
              0.925
            ],
            [
              0.76,
              0.89
            ],
            [
              1,
              0.83
            ]
          ],
          "grooves": [
            {
              "u": -0.48,
              "start": 0.36,
              "drift": -0.14,
              "width": 0.1,
              "depth": 0.00095
            },
            {
              "u": 0.34,
              "start": 0.54,
              "drift": 0.13,
              "width": 0.08,
              "depth": 0.00075
            }
          ],
          "bend": [
            [
              -1,
              -5.2
            ],
            [
              -0.78,
              -4.9
            ],
            [
              -0.57,
              -2.8
            ],
            [
              -0.1,
              -1.6
            ],
            [
              0.14,
              -0.5
            ],
            [
              0.55,
              3.7
            ],
            [
              1,
              4
            ]
          ]
        }
      },
      {
        "rootAnchor": {
          "theta": 5,
          "phi": -8
        },
        "controlPoints": [
          [
            5,
            -8,
            0.006
          ],
          [
            26,
            -10,
            0.013
          ],
          [
            49,
            -4,
            0.019
          ],
          [
            72,
            9,
            0.02
          ],
          [
            89,
            16,
            0.019
          ],
          [
            105,
            23,
            0.015
          ]
        ],
        "angularWidth": [
          43,
          42,
          35,
          28,
          20,
          4.2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.0048,
          0.0064,
          0.004,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -3,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 1.6,
        "role": "central dominant inward curl",
        "detail": {
          "start": 0.47,
          "hem": [
            [
              -1,
              0.89
            ],
            [
              -0.76,
              0.98
            ],
            [
              -0.52,
              0.83
            ],
            [
              -0.29,
              0.94
            ],
            [
              0.02,
              0.96
            ],
            [
              0.27,
              0.76
            ],
            [
              0.5,
              0.89
            ],
            [
              0.71,
              1
            ],
            [
              0.91,
              0.92
            ],
            [
              1,
              0.88
            ]
          ],
          "grooves": [
            {
              "u": -0.36,
              "start": 0.29,
              "drift": 0.15,
              "width": 0.1,
              "depth": 0.001
            },
            {
              "u": 0.28,
              "start": 0.48,
              "drift": -0.12,
              "width": 0.085,
              "depth": 0.0011
            },
            {
              "u": 0.68,
              "start": 0.65,
              "drift": 0.08,
              "width": 0.07,
              "depth": 0.0007
            }
          ],
          "bend": [
            [
              -1,
              -3.2
            ],
            [
              -0.52,
              -1.4
            ],
            [
              0,
              -0.7
            ],
            [
              0.5,
              1.2
            ],
            [
              1,
              2.3
            ]
          ]
        }
      },
      {
        "rootAnchor": {
          "theta": 12,
          "phi": 19
        },
        "controlPoints": [
          [
            12,
            19,
            0.006
          ],
          [
            34,
            22,
            0.012
          ],
          [
            60,
            31,
            0.016
          ],
          [
            78,
            37,
            0.017
          ],
          [
            97,
            35,
            0.012
          ]
        ],
        "angularWidth": [
          34,
          37,
          30,
          18,
          2.8
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.004,
          0.0056,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 3.2,
        "role": "right supporting divergent",
        "detail": {
          "start": 0.57,
          "hem": [
            [
              -1,
              0.9
            ],
            [
              -0.7,
              0.97
            ],
            [
              -0.4,
              0.79
            ],
            [
              -0.09,
              0.95
            ],
            [
              0.28,
              1
            ],
            [
              0.6,
              0.96
            ],
            [
              1,
              0.86
            ]
          ],
          "grooves": [
            {
              "u": -0.35,
              "start": 0.41,
              "drift": 0.18,
              "width": 0.095,
              "depth": 0.0008
            }
          ],
          "bend": [
            [
              -1,
              -2.6
            ],
            [
              -0.4,
              -1
            ],
            [
              0.3,
              0.6
            ],
            [
              1,
              2
            ]
          ]
        }
      },
      {
        "rootAnchor": {
          "theta": 24,
          "phi": 46
        },
        "controlPoints": [
          [
            24,
            46,
            0.006
          ],
          [
            40,
            49,
            0.01
          ],
          [
            64,
            55,
            0.014
          ],
          [
            85,
            66,
            0.014
          ],
          [
            108,
            73,
            0.012
          ]
        ],
        "angularWidth": [
          30,
          33,
          26,
          15,
          2.4
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.004,
          0.0048,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 1.5,
        "role": "right boundary outward",
        "detail": {
          "start": 0.62,
          "hem": [
            [
              -1,
              0.88
            ],
            [
              -0.67,
              0.94
            ],
            [
              -0.4,
              0.83
            ],
            [
              -0.1,
              0.99
            ],
            [
              0.24,
              1
            ],
            [
              0.55,
              0.94
            ],
            [
              1,
              0.91
            ]
          ],
          "grooves": [
            {
              "u": -0.38,
              "start": 0.46,
              "drift": -0.1,
              "width": 0.1,
              "depth": 0.0007
            }
          ],
          "bend": [
            [
              -1,
              -1.6
            ],
            [
              0,
              0
            ],
            [
              1,
              1.8
            ]
          ]
        }
      },
      {
        "rootAnchor": {
          "theta": 53,
          "phi": -33
        },
        "controlPoints": [
          [
            53,
            -33,
            0.01
          ],
          [
            66,
            -36,
            0.015
          ],
          [
            82,
            -30,
            0.016
          ],
          [
            103,
            -26,
            0.012
          ]
        ],
        "angularWidth": [
          9,
          12,
          13,
          7,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.003,
          0.004,
          0.002,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 1.8,
        "role": "left fork from main mid"
      },
      {
        "rootAnchor": {
          "theta": 67,
          "phi": 4
        },
        "controlPoints": [
          [
            67,
            4,
            0.012
          ],
          [
            78,
            9,
            0.016
          ],
          [
            90,
            23,
            0.018
          ],
          [
            100,
            26,
            0.01
          ]
        ],
        "angularWidth": [
          8,
          12,
          10,
          5,
          1.4
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.003,
          0.0038,
          0.002,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 2.8,
        "role": "central fork from main lower"
      },
      {
        "rootAnchor": {
          "theta": 30,
          "phi": -24
        },
        "controlPoints": [
          [
            30,
            -24,
            0.008
          ],
          [
            43,
            -25,
            0.012
          ],
          [
            56,
            -24,
            0.014
          ],
          [
            69,
            -18,
            0.016
          ],
          [
            81,
            -9,
            0.016
          ],
          [
            92,
            3,
            0.015
          ],
          [
            100,
            13,
            0.012
          ]
        ],
        "angularWidth": [
          8,
          18,
          24,
          25,
          24,
          19,
          1.1
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0012,
          0.0027,
          0.004,
          0.0046,
          0.004,
          0.0028,
          0.00055
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "tipCut": 0.7,
        "role": "central left edge companion",
        "edgeCompanion": {
          "parent": "central dominant inward curl",
          "neighbor": "left dominant sweep",
          "start": 0.3,
          "end": 0.055,
          "leftTrace": [
            [
              0,
              0
            ],
            [
              0.34,
              -0.012
            ],
            [
              0.53,
              0.018
            ],
            [
              0.7,
              0.13
            ],
            [
              0.84,
              0.43
            ],
            [
              0.94,
              0.77
            ],
            [
              1,
              1
            ]
          ]
        }
      }
    ]
  },
  {
    "version": 1,
    "id": "hair-t1-middle-flow-bob",
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
        "role": "left temple framing",
        "rootAnchor": {
          "theta": 24,
          "phi": -69
        },
        "controlPoints": [
          [
            24,
            -69,
            0.005
          ],
          [
            45,
            -74,
            0.011
          ],
          [
            68,
            -74,
            0.016
          ],
          [
            91,
            -69,
            0.018
          ],
          [
            123,
            -66,
            0.014
          ]
        ],
        "angularWidth": [
          19,
          27,
          29,
          23,
          1.4
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.0038,
          0.0048,
          0.0036,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 2.2,
        "surfaceLimit": 90,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "left upper ear sweep",
        "rootAnchor": {
          "theta": 18,
          "phi": -93
        },
        "controlPoints": [
          [
            18,
            -93,
            0.005
          ],
          [
            38,
            -94,
            0.01
          ],
          [
            57,
            -95,
            0.015
          ],
          [
            79,
            -98,
            0.018
          ],
          [
            108,
            -108,
            0.015
          ]
        ],
        "angularWidth": [
          30,
          36,
          38,
          32,
          2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.004,
          0.0052,
          0.004,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -4,
        "tipCut": 2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "left behind ear nape",
        "rootAnchor": {
          "theta": 38,
          "phi": -110
        },
        "controlPoints": [
          [
            38,
            -110,
            0.006
          ],
          [
            62,
            -118,
            0.012
          ],
          [
            83,
            -122,
            0.016
          ],
          [
            105,
            -121,
            0.016
          ],
          [
            121,
            -110,
            0.012
          ]
        ],
        "angularWidth": [
          25,
          30,
          29,
          20,
          2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.004,
          0.005,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 2.6,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right temple framing",
        "rootAnchor": {
          "theta": 27,
          "phi": 72
        },
        "controlPoints": [
          [
            27,
            72,
            0.005
          ],
          [
            45,
            76,
            0.011
          ],
          [
            66,
            77,
            0.016
          ],
          [
            88,
            72,
            0.018
          ],
          [
            119,
            67,
            0.014
          ]
        ],
        "angularWidth": [
          20,
          28,
          29,
          22,
          1.6
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.0038,
          0.0045,
          0.0034,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -2,
        "tipCut": 1.5,
        "surfaceLimit": 90,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right upper ear sweep",
        "rootAnchor": {
          "theta": 16,
          "phi": 92
        },
        "controlPoints": [
          [
            16,
            92,
            0.005
          ],
          [
            36,
            97,
            0.01
          ],
          [
            58,
            98,
            0.015
          ],
          [
            79,
            101,
            0.018
          ],
          [
            106,
            111,
            0.014
          ]
        ],
        "angularWidth": [
          29,
          35,
          37,
          30,
          1.7
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.0015,
          0.004,
          0.005,
          0.004,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 3,
        "tipCut": 2.6,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right behind ear nape",
        "rootAnchor": {
          "theta": 35,
          "phi": 112
        },
        "controlPoints": [
          [
            35,
            112,
            0.006
          ],
          [
            61,
            118,
            0.012
          ],
          [
            82,
            125,
            0.016
          ],
          [
            106,
            123,
            0.016
          ],
          [
            118,
            113,
            0.012
          ]
        ],
        "angularWidth": [
          26,
          30,
          28,
          18,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.004,
          0.005,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -2,
        "tipCut": 1.7,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      }
    ],
    "foundation": [
      [
        [
          -124,
          106
        ],
        [
          -112,
          99
        ],
        [
          -97,
          88
        ],
        [
          -85,
          94
        ],
        [
          -76,
          100
        ],
        [
          -68,
          92
        ]
      ],
      [
        [
          68,
          92
        ],
        [
          76,
          100
        ],
        [
          85,
          95
        ],
        [
          97,
          89
        ],
        [
          112,
          100
        ],
        [
          124,
          106
        ]
      ]
    ]
  },
  {
    "version": 1,
    "id": "hair-t1-back-flow-bob",
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
        "role": "left rear shoulder of silhouette",
        "rootAnchor": {
          "theta": 25,
          "phi": 121
        },
        "controlPoints": [
          [
            25,
            121,
            0.006
          ],
          [
            47,
            130,
            0.012
          ],
          [
            71,
            133,
            0.019
          ],
          [
            95,
            135,
            0.021
          ],
          [
            118,
            127,
            0.018
          ],
          [
            131,
            121,
            0.014
          ]
        ],
        "angularWidth": [
          24,
          30,
          34,
          31,
          20,
          1.8
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.005,
          0.007,
          0.006,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -3,
        "tipCut": 2.6,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right rear shoulder of silhouette",
        "rootAnchor": {
          "theta": 23,
          "phi": 239
        },
        "controlPoints": [
          [
            23,
            239,
            0.006
          ],
          [
            45,
            231,
            0.012
          ],
          [
            70,
            228,
            0.018
          ],
          [
            94,
            229,
            0.021
          ],
          [
            116,
            232,
            0.018
          ],
          [
            128,
            238,
            0.014
          ]
        ],
        "angularWidth": [
          25,
          31,
          34,
          29,
          19,
          1.7
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.005,
          0.0065,
          0.005,
          0.003,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 3,
        "tipCut": 1.9,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear right broad sweep",
        "rootAnchor": {
          "theta": 13,
          "phi": 148
        },
        "controlPoints": [
          [
            13,
            148,
            0.005
          ],
          [
            34,
            147,
            0.012
          ],
          [
            58,
            151,
            0.019
          ],
          [
            83,
            156,
            0.024
          ],
          [
            108,
            160,
            0.021
          ],
          [
            133,
            152,
            0.015
          ]
        ],
        "angularWidth": [
          33,
          38,
          39,
          36,
          26,
          2.3
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.005,
          0.007,
          0.006,
          0.004,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -3,
        "tipCut": 2.7,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear central broad sweep",
        "rootAnchor": {
          "theta": 9,
          "phi": 180
        },
        "controlPoints": [
          [
            9,
            180,
            0.005
          ],
          [
            30,
            180,
            0.012
          ],
          [
            54,
            177,
            0.02
          ],
          [
            80,
            177,
            0.025
          ],
          [
            107,
            181,
            0.022
          ],
          [
            136,
            188,
            0.016
          ]
        ],
        "angularWidth": [
          37,
          42,
          42,
          39,
          27,
          2.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.005,
          0.0075,
          0.006,
          0.004,
          0.0008
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 3.2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "detail": {
          "rows": 18,
          "cols": 14,
          "start": 0.58,
          "hem": [
            [
              -1,
              0.92
            ],
            [
              -0.72,
              0.98
            ],
            [
              -0.48,
              0.85
            ],
            [
              -0.22,
              0.97
            ],
            [
              0.12,
              1
            ],
            [
              0.4,
              0.88
            ],
            [
              0.66,
              0.96
            ],
            [
              1,
              0.9
            ]
          ],
          "grooves": [
            {
              "u": -0.46,
              "start": 0.33,
              "width": 0.095,
              "depth": 0.00085,
              "drift": 0.13
            },
            {
              "u": 0.38,
              "start": 0.53,
              "width": 0.09,
              "depth": 0.0007,
              "drift": -0.09
            }
          ],
          "bend": [
            [
              -1,
              -2.5
            ],
            [
              -0.5,
              -1
            ],
            [
              0,
              0
            ],
            [
              0.5,
              1.5
            ],
            [
              1,
              2.2
            ]
          ]
        }
      },
      {
        "role": "rear left broad sweep",
        "rootAnchor": {
          "theta": 15,
          "phi": 212
        },
        "controlPoints": [
          [
            15,
            212,
            0.005
          ],
          [
            35,
            212,
            0.012
          ],
          [
            59,
            210,
            0.019
          ],
          [
            83,
            206,
            0.024
          ],
          [
            108,
            204,
            0.021
          ],
          [
            132,
            211,
            0.015
          ]
        ],
        "angularWidth": [
          32,
          38,
          39,
          35,
          24,
          2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.002,
          0.005,
          0.007,
          0.006,
          0.0035,
          0.0007
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 3,
        "tipCut": 2,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      }
    ],
    "foundation": [
      [
        [
          118,
          103
        ],
        [
          140,
          113
        ],
        [
          165,
          118
        ],
        [
          190,
          119
        ],
        [
          215,
          116
        ],
        [
          242,
          103
        ]
      ]
    ]
  }
];
