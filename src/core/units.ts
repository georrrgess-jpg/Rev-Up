// One place where simulation units become display units. The race sim works in metres and seconds (m/s);
// players see miles per hour. Convert exactly once, here.
export const MPH_PER_MS = 2.23694;
export const mph = (metresPerSecond: number) => Math.round(metresPerSecond * MPH_PER_MS);
