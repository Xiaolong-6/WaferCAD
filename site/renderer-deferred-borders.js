// Presentation-only allocation policy. A dense full-wafer scene should not
// allocate hundreds of thousands of dormant GPU border segments while Borders
// is disabled. The exact Surface Plan remains authoritative and is retained.
export function shouldDeferDenseBorderBuffers({ borderLineCount = 0, borders = false } = {}) {
  return !borders && Number(borderLineCount) >= 100000;
}
