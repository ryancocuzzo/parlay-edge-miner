export const formatAmerican = (american: number): string => {
  const rounded = Math.round(american);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

export const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

export const unitPl = (value: number): string => {
  const rounded = value.toFixed(2);
  return value > 0 ? `+${rounded}u` : `${rounded}u`;
};
