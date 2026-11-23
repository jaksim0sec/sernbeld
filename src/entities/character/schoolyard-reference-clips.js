/* Exact, unmodified ability metadata and keyframes extracted from the user-supplied
 * schoolyard_duel_v3_no_user_select.html. Registered only: movement, attacks,
 * damage and inputs remain disconnected from SERNBELD. */
export const SCHOOLYARD_REFERENCE_ABILITIES=Object.freeze({
 "yareung": {
  "name": "돌려차기",
  "prep": 0.45,
  "hit": [
   0.36,
   0.5
  ],
  "end": 1.1,
  "dmg": 34,
  "cd": 0.25,
  "leap": {
   "t": 0.14,
   "vh": 6.7,
   "vy": 2.9
  },
  "fs": [
   0.95,
   1.9,
   0.45,
   1.7
  ],
  "word": "빡!",
  "keys": [
   {
    "t": 0,
    "f": 0,
    "y": 0,
    "p": {
     "spin": 0,
     "thigh_left.0": 34,
     "shin_left.0": 60,
     "thigh_right.0": -18,
     "shin_right.0": 66,
     "upper_arm_left.0": 70,
     "forearm_left.0": 100,
     "upper_arm_right.0": -20,
     "forearm_right.0": 60,
     "ribTw": -30,
     "lean": 12,
     "rootBack": -6,
     "rootSide": 22
    }
   },
   {
    "t": 0.14,
    "f": 0.3,
    "y": 0.1,
    "p": {
     "spin": -22,
     "thigh_left.0": 14,
     "shin_left.0": 22,
     "thigh_right.0": 40,
     "shin_right.0": 100,
     "upper_arm_left.0": 40,
     "upper_arm_left.1": 40,
     "upper_arm_right.0": 40,
     "upper_arm_right.1": 40,
     "forearm_left.0": 60,
     "forearm_right.0": 60,
     "ribTw": -28,
     "lean": 6,
     "rootSide": 30
    }
   },
   {
    "t": 0.3,
    "f": 1.1,
    "y": 0.45,
    "p": {
     "spin": 200,
     "thigh_left.0": 40,
     "shin_left.0": 90,
     "thigh_right.0": 78,
     "thigh_right.1": 22,
     "shin_right.0": 105,
     "upper_arm_left.0": 10,
     "upper_arm_left.1": 70,
     "upper_arm_right.0": 10,
     "upper_arm_right.1": 70,
     "forearm_left.0": 30,
     "forearm_right.0": 30,
     "rootBack": 10,
     "rootSide": 18
    }
   },
   {
    "t": 0.42,
    "f": 1.9,
    "y": 0.4,
    "p": {
     "spin": 335,
     "thigh_left.0": 30,
     "shin_left.0": 95,
     "thigh_right.0": 88,
     "thigh_right.1": 34,
     "shin_right.0": 6,
     "upper_arm_left.0": 10,
     "upper_arm_left.1": 75,
     "upper_arm_right.0": 10,
     "upper_arm_right.1": 75,
     "forearm_left.0": 12,
     "forearm_right.0": 12,
     "ribTw": 24,
     "lean": -6,
     "rootBack": 18,
     "rootSide": 26
    }
   },
   {
    "t": 0.6,
    "f": 2.4,
    "y": 0.25,
    "p": {
     "spin": 366,
     "thigh_left.0": 30,
     "shin_left.0": 60,
     "thigh_right.0": 55,
     "thigh_right.1": 8,
     "shin_right.0": 85,
     "upper_arm_left.0": 45,
     "forearm_left.0": 85,
     "upper_arm_right.0": 45,
     "forearm_right.0": 85,
     "ribTw": 6,
     "lean": 4,
     "rootBack": 8,
     "rootSide": 6
    }
   },
   {
    "t": 0.78,
    "f": 2.6,
    "y": 0,
    "p": {
     "spin": 360,
     "thigh_left.0": 44,
     "shin_left.0": 84,
     "thigh_right.0": 40,
     "shin_right.0": 88,
     "upper_arm_left.0": 34,
     "forearm_left.0": 92,
     "upper_arm_right.0": 30,
     "forearm_right.0": 96,
     "lean": 22,
     "rootBack": -8
    }
   },
   {
    "t": 1.1,
    "f": 2.6,
    "y": 0,
    "p": {
     "spin": 360,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "ribTw": -14,
     "lean": 6
    }
   }
  ],
  "ch": [
   "spin",
   "thigh_left.0",
   "shin_left.0",
   "thigh_right.0",
   "shin_right.0",
   "upper_arm_left.0",
   "forearm_left.0",
   "upper_arm_right.0",
   "forearm_right.0",
   "ribTw",
   "lean",
   "rootBack",
   "rootSide",
   "upper_arm_left.1",
   "upper_arm_right.1",
   "thigh_right.1"
  ]
 },
 "ap": {
  "name": "앞차기",
  "prep": 0.2,
  "hit": [
   0.19,
   0.33
  ],
  "end": 0.56,
  "dmg": 14,
  "cd": 0.12,
  "fs": [
   1,
   0.5,
   0.2,
   2.4
  ],
  "word": "팍",
  "keys": [
   {
    "t": 0,
    "f": 0,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "ribTw": -14,
     "lean": 6
    }
   },
   {
    "t": 0.1,
    "f": 0.15,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 8,
     "shin_left.0": 16,
     "thigh_right.0": 72,
     "shin_right.0": 112,
     "ribTw": -4,
     "lean": -2,
     "rootBack": 4
    }
   },
   {
    "t": 0.2,
    "f": 0.45,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 4,
     "shin_left.0": 10,
     "thigh_right.0": 90,
     "shin_right.0": 6,
     "ribTw": 8,
     "lean": -8,
     "rootBack": 12
    }
   },
   {
    "t": 0.34,
    "f": 0.5,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 8,
     "shin_left.0": 16,
     "thigh_right.0": 62,
     "shin_right.0": 104,
     "lean": -2,
     "rootBack": 5
    }
   },
   {
    "t": 0.56,
    "f": 0.5,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "ribTw": -14,
     "lean": 6
    }
   }
  ],
  "ch": [
   "upper_arm_left.0",
   "forearm_left.0",
   "upper_arm_right.0",
   "forearm_right.0",
   "upper_arm_left.1",
   "upper_arm_right.1",
   "thigh_left.0",
   "shin_left.0",
   "thigh_right.0",
   "shin_right.0",
   "ribTw",
   "lean",
   "rootBack"
  ]
 },
 "chop": {
  "name": "벌점찍기",
  "prep": 0.4,
  "hit": [
   0.24,
   0.42
  ],
  "end": 0.8,
  "dmg": 28,
  "cd": 0.2,
  "bone": "hand_right",
  "fs": [
   0.7,
   0.9,
   0.3,
   1.9
  ],
  "word": "딱!",
  "keys": [
   {
    "t": 0,
    "f": 0,
    "y": 0,
    "p": {
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "upper_arm_right.0": 100,
     "forearm_right.0": 70,
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_left.1": 16,
     "ribTw": -20,
     "lean": -8
    }
   },
   {
    "t": 0.14,
    "f": 0.35,
    "y": 0,
    "p": {
     "thigh_left.0": 30,
     "shin_left.0": 35,
     "thigh_right.0": -20,
     "shin_right.0": 25,
     "upper_arm_right.0": 105,
     "forearm_right.0": 40,
     "upper_arm_right.1": 10,
     "upper_arm_left.0": 40,
     "forearm_left.0": 90,
     "ribTw": -24,
     "lean": -12,
     "rootBack": 6
    }
   },
   {
    "t": 0.28,
    "f": 0.85,
    "y": 0,
    "p": {
     "thigh_left.0": 38,
     "shin_left.0": 50,
     "thigh_right.0": -24,
     "shin_right.0": 20,
     "upper_arm_right.0": 40,
     "forearm_right.0": 6,
     "upper_arm_left.0": 10,
     "forearm_left.0": 60,
     "ribTw": 22,
     "lean": 24
    }
   },
   {
    "t": 0.42,
    "f": 0.95,
    "y": 0,
    "p": {
     "thigh_left.0": 36,
     "shin_left.0": 48,
     "thigh_right.0": -22,
     "shin_right.0": 22,
     "upper_arm_right.0": 15,
     "forearm_right.0": 10,
     "upper_arm_left.0": 10,
     "forearm_left.0": 60,
     "ribTw": 26,
     "lean": 28
    }
   },
   {
    "t": 0.8,
    "f": 0.95,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "ribTw": -14,
     "lean": 6
    }
   }
  ],
  "ch": [
   "thigh_left.0",
   "shin_left.0",
   "thigh_right.0",
   "shin_right.0",
   "upper_arm_right.0",
   "forearm_right.0",
   "upper_arm_left.0",
   "forearm_left.0",
   "upper_arm_left.1",
   "ribTw",
   "lean",
   "upper_arm_right.1",
   "rootBack"
  ]
 },
 "drop": {
  "name": "야르릉드롭킥",
  "special": 1,
  "launch": 1,
  "hit": [
   0.42,
   0.68
  ],
  "end": 1.5,
  "dmg": 44,
  "cd": 0.4,
  "leap": {
   "t": 0.16,
   "vh": 7.4,
   "vy": 3.4
  },
  "fs": [
   1.2,
   2.4,
   0.4,
   1.5
  ],
  "ey": 1,
  "word": "콰앙!!",
  "keys": [
   {
    "t": 0,
    "f": 0,
    "y": 0,
    "p": {
     "thigh_left.0": 55,
     "shin_left.0": 95,
     "thigh_right.0": 50,
     "shin_right.0": 95,
     "upper_arm_left.0": -30,
     "upper_arm_right.0": -30,
     "forearm_left.0": 40,
     "forearm_right.0": 40,
     "lean": 24
    }
   },
   {
    "t": 0.16,
    "f": 0.4,
    "y": 0.1,
    "p": {
     "thigh_left.0": 20,
     "shin_left.0": 30,
     "thigh_right.0": 20,
     "shin_right.0": 30,
     "upper_arm_left.0": 70,
     "upper_arm_right.0": 70,
     "upper_arm_left.1": 30,
     "upper_arm_right.1": 30,
     "forearm_left.0": 20,
     "forearm_right.0": 20,
     "rootBack": 12
    }
   },
   {
    "t": 0.32,
    "f": 1.4,
    "y": 0.5,
    "p": {
     "upper_arm_left.0": 100,
     "upper_arm_right.0": 100,
     "upper_arm_left.1": 45,
     "upper_arm_right.1": 45,
     "forearm_left.0": 12,
     "forearm_right.0": 12,
     "thigh_left.0": 85,
     "shin_left.0": 118,
     "thigh_right.0": 85,
     "shin_right.0": 118,
     "rootBack": 50
    }
   },
   {
    "t": 0.46,
    "f": 2.3,
    "y": 0.62,
    "p": {
     "upper_arm_left.0": 100,
     "upper_arm_right.0": 100,
     "upper_arm_left.1": 45,
     "upper_arm_right.1": 45,
     "forearm_left.0": 12,
     "forearm_right.0": 12,
     "thigh_left.0": 12,
     "shin_left.0": 2,
     "thigh_right.0": 16,
     "shin_right.0": 2,
     "rootBack": 78,
     "lean": -8
    }
   },
   {
    "t": 0.66,
    "f": 2.9,
    "y": 0.5,
    "p": {
     "upper_arm_left.0": 100,
     "upper_arm_right.0": 100,
     "upper_arm_left.1": 45,
     "upper_arm_right.1": 45,
     "forearm_left.0": 12,
     "forearm_right.0": 12,
     "thigh_left.0": 12,
     "shin_left.0": 2,
     "thigh_right.0": 16,
     "shin_right.0": 2,
     "rootBack": 80,
     "lean": -8
    }
   },
   {
    "t": 0.9,
    "f": 3.2,
    "y": 0,
    "p": {
     "upper_arm_left.1": 60,
     "upper_arm_right.1": 60,
     "forearm_left.0": 30,
     "forearm_right.0": 30,
     "thigh_left.0": 40,
     "shin_left.0": 60,
     "thigh_right.0": 25,
     "shin_right.0": 40,
     "rootBack": 84
    }
   },
   {
    "t": 1.2,
    "f": 3.2,
    "y": 0,
    "p": {
     "upper_arm_left.0": 30,
     "upper_arm_right.0": 30,
     "forearm_left.0": 60,
     "forearm_right.0": 60,
     "thigh_left.0": 75,
     "shin_left.0": 115,
     "thigh_right.0": 65,
     "shin_right.0": 105,
     "rootBack": 28,
     "lean": 22
    }
   },
   {
    "t": 1.5,
    "f": 3.2,
    "y": 0,
    "p": {
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "ribTw": -14,
     "lean": 6
    }
   }
  ],
  "ch": [
   "thigh_left.0",
   "shin_left.0",
   "thigh_right.0",
   "shin_right.0",
   "upper_arm_left.0",
   "upper_arm_right.0",
   "forearm_left.0",
   "forearm_right.0",
   "lean",
   "upper_arm_left.1",
   "upper_arm_right.1",
   "rootBack",
   "ribTw"
  ]
 },
 "yeot": {
  "name": "엿날려돌려차기",
  "prep": 0.45,
  "hit": [
   0.36,
   0.5
  ],
  "end": 1.1,
  "dmg": 42,
  "cd": 0.4,
  "leap": {
   "t": 0.14,
   "vh": 6.7,
   "vy": 2.9
  },
  "fs": [
   0.95,
   1.9,
   0.45,
   1.7
  ],
  "word": "엿!!",
  "keys": [
   {
    "t": 0,
    "f": 0,
    "y": 0,
    "p": {
     "spin": 0,
     "thigh_left.0": 34,
     "shin_left.0": 60,
     "thigh_right.0": -18,
     "shin_right.0": 66,
     "upper_arm_left.0": 70,
     "forearm_left.0": 100,
     "upper_arm_right.0": -20,
     "forearm_right.0": 60,
     "ribTw": -30,
     "lean": 12,
     "rootBack": -6,
     "rootSide": 22
    }
   },
   {
    "t": 0.14,
    "f": 0.3,
    "y": 0.1,
    "p": {
     "spin": -22,
     "thigh_left.0": 14,
     "shin_left.0": 22,
     "thigh_right.0": 40,
     "shin_right.0": 100,
     "upper_arm_left.0": 100,
     "upper_arm_left.1": 28,
     "upper_arm_right.0": 100,
     "upper_arm_right.1": 28,
     "forearm_left.0": 38,
     "forearm_right.0": 38,
     "ribTw": -28,
     "lean": 6,
     "rootSide": 30,
     "index_left_0.0": 68,
     "index_left_1.0": 88,
     "index_left_2.0": 58,
     "ring_left_0.0": 68,
     "ring_left_1.0": 88,
     "ring_left_2.0": 58,
     "pinky_left_0.0": 68,
     "pinky_left_1.0": 88,
     "pinky_left_2.0": 58,
     "thumb_left_0.0": 18,
     "thumb_left_1.0": 46,
     "thumb_left_2.0": 50,
     "index_right_0.0": 68,
     "index_right_1.0": 88,
     "index_right_2.0": 58,
     "ring_right_0.0": 68,
     "ring_right_1.0": 88,
     "ring_right_2.0": 58,
     "pinky_right_0.0": 68,
     "pinky_right_1.0": 88,
     "pinky_right_2.0": 58,
     "thumb_right_0.0": 18,
     "thumb_right_1.0": 46,
     "thumb_right_2.0": 50
    }
   },
   {
    "t": 0.3,
    "f": 1.1,
    "y": 0.45,
    "p": {
     "spin": 200,
     "thigh_left.0": 40,
     "shin_left.0": 90,
     "thigh_right.0": 78,
     "thigh_right.1": 22,
     "shin_right.0": 105,
     "upper_arm_left.0": 100,
     "upper_arm_left.1": 28,
     "upper_arm_right.0": 100,
     "upper_arm_right.1": 28,
     "forearm_left.0": 38,
     "forearm_right.0": 38,
     "rootBack": 10,
     "rootSide": 18,
     "index_left_0.0": 68,
     "index_left_1.0": 88,
     "index_left_2.0": 58,
     "ring_left_0.0": 68,
     "ring_left_1.0": 88,
     "ring_left_2.0": 58,
     "pinky_left_0.0": 68,
     "pinky_left_1.0": 88,
     "pinky_left_2.0": 58,
     "thumb_left_0.0": 18,
     "thumb_left_1.0": 46,
     "thumb_left_2.0": 50,
     "index_right_0.0": 68,
     "index_right_1.0": 88,
     "index_right_2.0": 58,
     "ring_right_0.0": 68,
     "ring_right_1.0": 88,
     "ring_right_2.0": 58,
     "pinky_right_0.0": 68,
     "pinky_right_1.0": 88,
     "pinky_right_2.0": 58,
     "thumb_right_0.0": 18,
     "thumb_right_1.0": 46,
     "thumb_right_2.0": 50
    }
   },
   {
    "t": 0.42,
    "f": 1.9,
    "y": 0.4,
    "p": {
     "spin": 335,
     "thigh_left.0": 30,
     "shin_left.0": 95,
     "thigh_right.0": 88,
     "thigh_right.1": 34,
     "shin_right.0": 6,
     "upper_arm_left.0": 100,
     "upper_arm_left.1": 28,
     "upper_arm_right.0": 100,
     "upper_arm_right.1": 28,
     "forearm_left.0": 38,
     "forearm_right.0": 38,
     "ribTw": 24,
     "lean": -6,
     "rootBack": 18,
     "rootSide": 26,
     "index_left_0.0": 68,
     "index_left_1.0": 88,
     "index_left_2.0": 58,
     "ring_left_0.0": 68,
     "ring_left_1.0": 88,
     "ring_left_2.0": 58,
     "pinky_left_0.0": 68,
     "pinky_left_1.0": 88,
     "pinky_left_2.0": 58,
     "thumb_left_0.0": 18,
     "thumb_left_1.0": 46,
     "thumb_left_2.0": 50,
     "index_right_0.0": 68,
     "index_right_1.0": 88,
     "index_right_2.0": 58,
     "ring_right_0.0": 68,
     "ring_right_1.0": 88,
     "ring_right_2.0": 58,
     "pinky_right_0.0": 68,
     "pinky_right_1.0": 88,
     "pinky_right_2.0": 58,
     "thumb_right_0.0": 18,
     "thumb_right_1.0": 46,
     "thumb_right_2.0": 50
    }
   },
   {
    "t": 0.6,
    "f": 2.4,
    "y": 0.25,
    "p": {
     "spin": 366,
     "thigh_left.0": 30,
     "shin_left.0": 60,
     "thigh_right.0": 55,
     "thigh_right.1": 8,
     "shin_right.0": 85,
     "upper_arm_left.0": 100,
     "forearm_left.0": 38,
     "upper_arm_right.0": 100,
     "forearm_right.0": 38,
     "ribTw": 6,
     "lean": 4,
     "rootBack": 8,
     "rootSide": 6,
     "upper_arm_left.1": 28,
     "upper_arm_right.1": 28,
     "index_left_0.0": 68,
     "index_left_1.0": 88,
     "index_left_2.0": 58,
     "ring_left_0.0": 68,
     "ring_left_1.0": 88,
     "ring_left_2.0": 58,
     "pinky_left_0.0": 68,
     "pinky_left_1.0": 88,
     "pinky_left_2.0": 58,
     "thumb_left_0.0": 18,
     "thumb_left_1.0": 46,
     "thumb_left_2.0": 50,
     "index_right_0.0": 68,
     "index_right_1.0": 88,
     "index_right_2.0": 58,
     "ring_right_0.0": 68,
     "ring_right_1.0": 88,
     "ring_right_2.0": 58,
     "pinky_right_0.0": 68,
     "pinky_right_1.0": 88,
     "pinky_right_2.0": 58,
     "thumb_right_0.0": 18,
     "thumb_right_1.0": 46,
     "thumb_right_2.0": 50
    }
   },
   {
    "t": 0.78,
    "f": 2.6,
    "y": 0,
    "p": {
     "spin": 360,
     "thigh_left.0": 44,
     "shin_left.0": 84,
     "thigh_right.0": 40,
     "shin_right.0": 88,
     "upper_arm_left.0": 34,
     "forearm_left.0": 92,
     "upper_arm_right.0": 30,
     "forearm_right.0": 96,
     "lean": 22,
     "rootBack": -8
    }
   },
   {
    "t": 1.1,
    "f": 2.6,
    "y": 0,
    "p": {
     "spin": 360,
     "thigh_left.0": 18,
     "shin_left.0": 22,
     "thigh_right.0": -10,
     "shin_right.0": 32,
     "upper_arm_left.0": 55,
     "forearm_left.0": 105,
     "upper_arm_right.0": 62,
     "forearm_right.0": 112,
     "upper_arm_left.1": 16,
     "upper_arm_right.1": 16,
     "ribTw": -14,
     "lean": 6
    }
   }
  ],
  "special": 1,
  "launch": 1,
  "ch": [
   "spin",
   "thigh_left.0",
   "shin_left.0",
   "thigh_right.0",
   "shin_right.0",
   "upper_arm_left.0",
   "forearm_left.0",
   "upper_arm_right.0",
   "forearm_right.0",
   "ribTw",
   "lean",
   "rootBack",
   "rootSide",
   "upper_arm_left.1",
   "upper_arm_right.1",
   "index_left_0.0",
   "index_left_1.0",
   "index_left_2.0",
   "ring_left_0.0",
   "ring_left_1.0",
   "ring_left_2.0",
   "pinky_left_0.0",
   "pinky_left_1.0",
   "pinky_left_2.0",
   "thumb_left_0.0",
   "thumb_left_1.0",
   "thumb_left_2.0",
   "index_right_0.0",
   "index_right_1.0",
   "index_right_2.0",
   "ring_right_0.0",
   "ring_right_1.0",
   "ring_right_2.0",
   "pinky_right_0.0",
   "pinky_right_1.0",
   "pinky_right_2.0",
   "thumb_right_0.0",
   "thumb_right_1.0",
   "thumb_right_2.0",
   "thigh_right.1"
  ]
 }
});
