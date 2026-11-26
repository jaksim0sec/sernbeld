// HAIR-11260710/T1: Flow v1 with local carved edge detail. Side/back not authored.
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
            -32,
            0.017
          ],
          [
            74,
            -21,
            0.019
          ],
          [
            92,
            -13,
            0.017
          ],
          [
            113,
            -7,
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
              0.96
            ],
            [
              -0.57,
              0.79
            ],
            [
              -0.37,
              0.94
            ],
            [
              -0.1,
              1
            ],
            [
              0.14,
              0.98
            ],
            [
              0.37,
              0.87
            ],
            [
              0.55,
              0.96
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
              -2.8
            ],
            [
              -0.57,
              -0.8
            ],
            [
              0,
              0
            ],
            [
              0.55,
              2.2
            ],
            [
              1,
              3.1
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
            12,
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
            113,
            27,
            0.013
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
      }
    ]
  }
];
