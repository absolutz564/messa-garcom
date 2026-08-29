import { SlidingWindowStore } from './ip-rate-limit.guard';

describe('SlidingWindowStore', () => {
  it('counts hits inside the window only', () => {
    const s = new SlidingWindowStore();
    const t0 = 1_000_000;
    expect(s.hit('a', 1000, t0)).toBe(1);
    expect(s.hit('a', 1000, t0 + 500)).toBe(2);
    expect(s.hit('a', 1000, t0 + 1600)).toBe(1); // os dois primeiros saíram da janela
    expect(s.hit('b', 1000, t0 + 1600)).toBe(1); // chaves independentes
  });
});
