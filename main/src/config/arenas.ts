export const ARENAS = {
  neon: {
    label: "Neon", description: "Nocny klub · turkus i róż",
    surface: [0x142637, 0x081722, 0x132e38], rail: 0x253c50,
    markings: 0xa5dce5, accent: 0x4ce8d3, opponent: 0xff688b,
    puck: 0xeafaff, shadow: 0x00040a,
  },
  ice: {
    label: "Lód", description: "Lodowa tafla · błękit i koral",
    surface: [0xaccddd, 0xe1eef3, 0x91bdce], rail: 0x3b627c,
    markings: 0x325878, accent: 0x177ea8, opponent: 0xc94466,
    puck: 0x172c42, shadow: 0x1e405c,
  },
  retro: {
    label: "Retro arcade", description: "Fioletowy automat · złoto i magenta",
    surface: [0x352346, 0x171326, 0x30223e], rail: 0x584060,
    markings: 0xd6acc7, accent: 0xffcf66, opponent: 0xff65b3,
    puck: 0xffebbd, shadow: 0x10051b,
  },
} as const;
export type ArenaId = keyof typeof ARENAS;
