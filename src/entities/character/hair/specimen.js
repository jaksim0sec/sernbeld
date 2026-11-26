// HAIR-11260710: preserved Flow Detail 7 front; layered side/rear study.
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
        "role": "left temple short sideburn",
        "rootAnchor": {
          "theta": 36,
          "phi": -66
        },
        "controlPoints": [
          [
            36,
            -66,
            0.007
          ],
          [
            55,
            -71,
            0.012
          ],
          [
            76,
            -72,
            0.013
          ],
          [
            96,
            -70,
            0.01
          ],
          [
            114,
            -67,
            0.007
          ]
        ],
        "angularWidth": [
          15,
          20,
          19,
          13,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 1.3,
        "tipCut": 1.8,
        "surfaceLimit": 92,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "left swept upper transition",
        "rootAnchor": {
          "theta": 22,
          "phi": -79
        },
        "controlPoints": [
          [
            22,
            -79,
            0.006
          ],
          [
            42,
            -84,
            0.011
          ],
          [
            62,
            -95,
            0.014
          ],
          [
            77,
            -109,
            0.013
          ],
          [
            93,
            -122,
            0.009
          ]
        ],
        "angularWidth": [
          22,
          33,
          37,
          30,
          2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -2,
        "tipCut": 1.6,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "left shorter over-ear layer",
        "rootAnchor": {
          "theta": 53,
          "phi": -77
        },
        "controlPoints": [
          [
            53,
            -77,
            0.008
          ],
          [
            67,
            -83,
            0.013
          ],
          [
            80,
            -92,
            0.014
          ],
          [
            90,
            -103,
            0.012
          ],
          [
            101,
            -111,
            0.008
          ]
        ],
        "angularWidth": [
          13,
          25,
          27,
          21,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "tipCut": 1.3,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "left rear ear transition",
        "rootAnchor": {
          "theta": 61,
          "phi": -111
        },
        "controlPoints": [
          [
            61,
            -111,
            0.009
          ],
          [
            76,
            -115,
            0.014
          ],
          [
            95,
            -120,
            0.014
          ],
          [
            108,
            -119,
            0.01
          ],
          [
            123,
            -111,
            0.008
          ]
        ],
        "angularWidth": [
          19,
          25,
          27,
          19,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 1,
        "tipCut": 1.8,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right temple short sideburn",
        "rootAnchor": {
          "theta": 38,
          "phi": 67
        },
        "controlPoints": [
          [
            38,
            67,
            0.007
          ],
          [
            57,
            71,
            0.012
          ],
          [
            76,
            73,
            0.013
          ],
          [
            94,
            70,
            0.01
          ],
          [
            111,
            68,
            0.007
          ]
        ],
        "angularWidth": [
          15,
          21,
          19,
          12,
          1.4
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1.3,
        "tipCut": 1.5,
        "surfaceLimit": 92,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right swept upper transition",
        "rootAnchor": {
          "theta": 24,
          "phi": 79
        },
        "controlPoints": [
          [
            24,
            79,
            0.006
          ],
          [
            44,
            85,
            0.011
          ],
          [
            61,
            94,
            0.014
          ],
          [
            78,
            108,
            0.013
          ],
          [
            96,
            121,
            0.009
          ]
        ],
        "angularWidth": [
          23,
          33,
          36,
          30,
          2
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 1.7,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right shorter over-ear layer",
        "rootAnchor": {
          "theta": 50,
          "phi": 78
        },
        "controlPoints": [
          [
            50,
            78,
            0.008
          ],
          [
            65,
            84,
            0.013
          ],
          [
            81,
            94,
            0.014
          ],
          [
            91,
            105,
            0.012
          ],
          [
            103,
            112,
            0.008
          ]
        ],
        "angularWidth": [
          14,
          24,
          28,
          20,
          1.5
        ],
        "widthProfile": [
          0.02,
          0.035,
          0.022,
          0.002
        ],
        "depthProfile": [
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 1,
        "tipCut": 1.5,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "right rear ear transition",
        "rootAnchor": {
          "theta": 62,
          "phi": 111
        },
        "controlPoints": [
          [
            62,
            111,
            0.009
          ],
          [
            77,
            116,
            0.014
          ],
          [
            94,
            121,
            0.014
          ],
          [
            107,
            119,
            0.01
          ],
          [
            121,
            112,
            0.008
          ]
        ],
        "angularWidth": [
          19,
          25,
          26,
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
          0.001,
          0.0025,
          0.0032,
          0.0025,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "tipCut": 1.4,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      }
    ],
    "foundation": [
      [
        [
          -132,
          114
        ],
        [
          -120,
          111
        ],
        [
          -110,
          104
        ],
        [
          -100,
          96
        ],
        [
          -93,
          94
        ],
        [
          -86,
          97
        ],
        [
          -79,
          104
        ],
        [
          -72,
          111
        ],
        [
          -65,
          106
        ],
        [
          -59,
          94
        ]
      ],
      [
        [
          59,
          94
        ],
        [
          65,
          105
        ],
        [
          72,
          110
        ],
        [
          79,
          104
        ],
        [
          86,
          97
        ],
        [
          93,
          94
        ],
        [
          100,
          96
        ],
        [
          110,
          104
        ],
        [
          120,
          111
        ],
        [
          132,
          114
        ]
      ]
    ],
    "sculpt": {
      "profile": [
        0.0035,
        0.009,
        0.012,
        0.01,
        0.005
      ],
      "flow": 8,
      "grooves": [
        {
          "u": 0.24,
          "drift": 0.13,
          "start": 0.24,
          "depth": 0.001
        },
        {
          "u": 0.49,
          "drift": 0.15,
          "start": 0.43,
          "depth": 0.0008
        },
        {
          "u": 0.78,
          "drift": 0.09,
          "start": 0.57,
          "depth": 0.0009
        }
      ],
      "hemDetail": 0.85
    }
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
        "role": "rear left diagonal connecting layer",
        "rootAnchor": {
          "theta": 34,
          "phi": 120
        },
        "controlPoints": [
          [
            34,
            120,
            0.009
          ],
          [
            49,
            132,
            0.014
          ],
          [
            69,
            142,
            0.021
          ],
          [
            92,
            143,
            0.022
          ],
          [
            116,
            135,
            0.016
          ],
          [
            125,
            129,
            0.009
          ]
        ],
        "angularWidth": [
          22,
          33,
          38,
          35,
          22,
          2.3
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
          0.004,
          0.003,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -2,
        "tipCut": 1.8,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear right diagonal connecting layer",
        "rootAnchor": {
          "theta": 32,
          "phi": 240
        },
        "controlPoints": [
          [
            32,
            240,
            0.009
          ],
          [
            49,
            229,
            0.014
          ],
          [
            69,
            220,
            0.021
          ],
          [
            91,
            218,
            0.022
          ],
          [
            113,
            224,
            0.015
          ],
          [
            123,
            232,
            0.009
          ]
        ],
        "angularWidth": [
          23,
          32,
          37,
          35,
          22,
          2.2
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
          0.004,
          0.003,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 1.5,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear upper crown sweep",
        "rootAnchor": {
          "theta": 10,
          "phi": 167
        },
        "controlPoints": [
          [
            10,
            167,
            0.006
          ],
          [
            32,
            161,
            0.011
          ],
          [
            54,
            167,
            0.018
          ],
          [
            76,
            176,
            0.023
          ],
          [
            98,
            183,
            0.021
          ],
          [
            114,
            187,
            0.013
          ]
        ],
        "angularWidth": [
          36,
          48,
          52,
          46,
          30,
          2.4
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
          0.0045,
          0.004,
          0.003,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 2,
        "tipCut": 1.5,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear lower central layer",
        "rootAnchor": {
          "theta": 53,
          "phi": 173
        },
        "controlPoints": [
          [
            53,
            173,
            0.013
          ],
          [
            74,
            172,
            0.02
          ],
          [
            94,
            175,
            0.023
          ],
          [
            113,
            181,
            0.018
          ],
          [
            128,
            184,
            0.009
          ]
        ],
        "angularWidth": [
          38,
          48,
          48,
          35,
          2.1
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
          0.0045,
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
        "tipCut": 1.6,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1",
        "detail": {
          "rows": 18,
          "cols": 16,
          "start": 0.66,
          "hem": [
            [
              -1,
              0.93
            ],
            [
              -0.68,
              0.98
            ],
            [
              -0.42,
              0.9
            ],
            [
              -0.15,
              1
            ],
            [
              0.15,
              0.95
            ],
            [
              0.44,
              0.89
            ],
            [
              0.68,
              0.97
            ],
            [
              1,
              0.92
            ]
          ],
          "grooves": [
            {
              "u": -0.4,
              "start": 0.4,
              "width": 0.1,
              "depth": 0.0008,
              "drift": 0.08
            },
            {
              "u": 0.45,
              "start": 0.56,
              "width": 0.1,
              "depth": 0.0007,
              "drift": -0.08
            }
          ],
          "bend": [
            [
              -1,
              -1.5
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
        "role": "rear lower left layer",
        "rootAnchor": {
          "theta": 72,
          "phi": 148
        },
        "controlPoints": [
          [
            72,
            148,
            0.015
          ],
          [
            89,
            151,
            0.021
          ],
          [
            106,
            155,
            0.02
          ],
          [
            119,
            160,
            0.014
          ],
          [
            126,
            163,
            0.008
          ]
        ],
        "angularWidth": [
          25,
          30,
          31,
          23,
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
          0.003,
          0.004,
          0.003,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": 1,
        "tipCut": 1.5,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      },
      {
        "role": "rear lower right layer",
        "rootAnchor": {
          "theta": 70,
          "phi": 212
        },
        "controlPoints": [
          [
            70,
            212,
            0.015
          ],
          [
            89,
            210,
            0.021
          ],
          [
            105,
            207,
            0.02
          ],
          [
            117,
            205,
            0.014
          ],
          [
            124,
            202,
            0.008
          ]
        ],
        "angularWidth": [
          26,
          31,
          31,
          23,
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
          0.003,
          0.004,
          0.003,
          0.0006
        ],
        "twistProfile": [
          0,
          0
        ],
        "crossSection": "lens",
        "grooves": 2,
        "sweep": -1,
        "tipCut": 1.7,
        "surfaceLimit": 112,
        "physicsProfile": "fixed-t1"
      }
    ],
    "foundation": [
      [
        [
          122,
          110
        ],
        [
          134,
          117
        ],
        [
          148,
          122
        ],
        [
          164,
          125
        ],
        [
          178,
          127
        ],
        [
          192,
          126
        ],
        [
          208,
          124
        ],
        [
          224,
          120
        ],
        [
          238,
          115
        ]
      ]
    ],
    "sculpt": {
      "profile": [
        0.003,
        0.009,
        0.017,
        0.018,
        0.006
      ],
      "flow": -12,
      "grooves": [
        {
          "u": 0.18,
          "drift": 0.13,
          "start": 0.18,
          "depth": 0.0011
        },
        {
          "u": 0.38,
          "drift": 0.1,
          "start": 0.32,
          "depth": 0.0013
        },
        {
          "u": 0.62,
          "drift": -0.06,
          "start": 0.45,
          "depth": 0.0011
        },
        {
          "u": 0.83,
          "drift": -0.13,
          "start": 0.3,
          "depth": 0.001
        }
      ],
      "hemDetail": 1.2
    }
  }
];
