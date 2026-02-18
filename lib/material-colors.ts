const MATERIAL_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700' },
];

const DEFAULT_COLOR = { bg: 'bg-gray-100', text: 'text-gray-700' };

export function getMaterialColor(materialId: string, materials: { id: string }[]) {
  const index = materials.findIndex(m => m.id === materialId);
  if (index === -1) return DEFAULT_COLOR;
  return MATERIAL_COLORS[index % MATERIAL_COLORS.length];
}

export function getMaterialColorByName(materialName: string, materials: { name: string }[]) {
  const index = materials.findIndex(m => m.name === materialName);
  if (index === -1) return DEFAULT_COLOR;
  return MATERIAL_COLORS[index % MATERIAL_COLORS.length];
}
