// กราฟแท่ง SVG เขียนเอง (ไม่ใช้ chart library) แสดงจำนวนการยืมรายเดือนเทียบกับที่คืนช้า
const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

/** ค่าสูงสุดของแกน y ปัดขึ้นให้ลงตัว เพื่อให้เส้นกริดอ่านง่าย */
export function niceMax(value) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / pow) * pow;
}

/**
 * @param {{ loanMonth: string, totalLoans: number, lateLoans: number }[]} rows
 * @returns {SVGElement}
 */
export function barChart(rows) {
  const W = 720;
  const H = 300;
  const m = { top: 24, right: 16, bottom: 56, left: 44 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const max = niceMax(Math.max(0, ...rows.map((r) => r.totalLoans)));
  const group = plotW / Math.max(rows.length, 1);
  const barW = Math.min(28, (group - 8) / 2);
  const y = (v) => m.top + plotH - (v / max) * plotH;

  const root = svg('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'กราฟแท่งจำนวนการยืมรายเดือน เทียบกับจำนวนที่คืนช้า',
  });

  for (let i = 0; i <= 4; i += 1) {
    const v = (max / 4) * i;
    root.append(
      svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), stroke: '#d0d7de' }),
      svg('text', { x: m.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v))));
  }

  rows.forEach((r, i) => {
    const x0 = m.left + group * i + (group - barW * 2 - 4) / 2;
    const bars = [
      { v: r.totalLoans, fill: '#14213d', label: 'ยืมทั้งหมด', dx: 0 },
      { v: r.lateLoans, fill: '#b42318', label: 'คืนช้า', dx: barW + 4 },
    ];
    for (const b of bars) {
      const h = (b.v / max) * plotH;
      root.append(
        svg('rect', { x: x0 + b.dx, y: y(b.v), width: barW, height: h, fill: b.fill }, svg('title', {}, `${r.loanMonth} ${b.label} ${b.v} รายการ`)),
        svg('text', { x: x0 + b.dx + barW / 2, y: y(b.v) - 4, 'text-anchor': 'middle' }, String(b.v)));
    }
    root.append(svg('text', { x: m.left + group * i + group / 2, y: H - m.bottom + 18, 'text-anchor': 'middle' }, r.loanMonth));
  });

  // คำอธิบายสี มีข้อความกำกับเสมอ
  root.append(
    svg('rect', { x: m.left, y: H - 20, width: 12, height: 12, fill: '#14213d' }),
    svg('text', { x: m.left + 18, y: H - 9 }, 'ยืมทั้งหมด'),
    svg('rect', { x: m.left + 110, y: H - 20, width: 12, height: 12, fill: '#b42318' }),
    svg('text', { x: m.left + 128, y: H - 9 }, 'คืนช้า'));
  return root;
}
