export const PALETTE = [
  { id: 'cloud-dancer', name: 'Cloud Dancer', year: 2026, hex: '#F0EEE9' },
  { id: 'mocha-mousse', name: 'Mocha Mousse', year: 2025, hex: '#A47864' },
  { id: 'peach-fuzz', name: 'Peach Fuzz', year: 2024, hex: '#FFBE98' },
  { id: 'viva-magenta', name: 'Viva Magenta', year: 2023, hex: '#BB2649' },
  { id: 'very-peri', name: 'Very Peri', year: 2022, hex: '#6667AB' },
  { id: 'illuminating', name: 'Illuminating', year: 2021, hex: '#F5DF4D' },
  { id: 'ultimate-gray', name: 'Ultimate Gray', year: 2021, hex: '#939597' },
  { id: 'classic-blue', name: 'Classic Blue', year: 2020, hex: '#0F4C81' },
  { id: 'living-coral', name: 'Living Coral', year: 2019, hex: '#FF6F61' },
  { id: 'ultra-violet', name: 'Ultra Violet', year: 2018, hex: '#5F4B8B' }
];

const byId = new Map(PALETTE.map(color => [color.id, color]));
const LIGHT_TEXT = '#fafafa';
const DARK_TEXT = '#0a0a0a';
const LUMINANCE_THRESHOLD = 0.45;

export function colorHex(id) {
  return byId.get(id)?.hex ?? null;
}

export function readableTextOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > LUMINANCE_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;
}
