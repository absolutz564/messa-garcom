import { describe, expect, it } from 'vitest';
import { validateOrderLines, type CatalogProduct } from './order';

const burger: CatalogProduct = {
  id: 'p1', name: 'X-Bacon', priceCents: 2990, isAvailable: true, deletedAt: null,
  serviceAreaKey: 'kitchen', serviceAreaOpen: true,
};
const beer: CatalogProduct = { ...burger, id: 'p2', name: 'Cerveja', priceCents: 990, serviceAreaKey: 'bar' };
const catalog = new Map([[burger.id, burger], [beer.id, beer]]);

describe('validateOrderLines (BR-11/12/15)', () => {
  it('snapshots name and price, computes total server-side', () => {
    const r = validateOrderLines([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3, notes: ' gelada ' }], catalog);
    expect(r).toEqual({
      ok: true,
      totalCents: 2 * 2990 + 3 * 990,
      lines: [
        { productId: 'p1', productNameSnapshot: 'X-Bacon', unitPriceCentsSnapshot: 2990, quantity: 2, notes: null },
        { productId: 'p2', productNameSnapshot: 'Cerveja', unitPriceCentsSnapshot: 990, quantity: 3, notes: 'gelada' },
      ],
    });
  });
  it('kitchen closed rejects kitchen items but keeps drinks (F09)', () => {
    const closed = new Map(catalog);
    closed.set('p1', { ...burger, serviceAreaOpen: false });
    const r = validateOrderLines([{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }], closed);
    expect(r).toEqual({ ok: false, rejected: [{ productId: 'p1', reason: 'area_closed', areaKey: 'kitchen' }] });
  });
  it('unknown / deleted / unavailable / bad quantity', () => {
    const c = new Map(catalog);
    c.set('p3', { ...beer, id: 'p3', deletedAt: new Date() });
    c.set('p4', { ...beer, id: 'p4', isAvailable: false });
    const r = validateOrderLines(
      [{ productId: 'x', quantity: 1 }, { productId: 'p3', quantity: 1 }, { productId: 'p4', quantity: 1 }, { productId: 'p2', quantity: 0 }],
      c,
    );
    expect(r).toEqual({
      ok: false,
      rejected: [
        { productId: 'x', reason: 'not_found' },
        { productId: 'p3', reason: 'not_found' },
        { productId: 'p4', reason: 'unavailable' },
        { productId: 'p2', reason: 'invalid_quantity' },
      ],
    });
  });
  it('empty order rejected', () => {
    expect(validateOrderLines([], catalog).ok).toBe(false);
  });
});
