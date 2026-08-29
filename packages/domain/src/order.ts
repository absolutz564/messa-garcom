import { RULES } from './constants';

export interface CatalogProduct {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  deletedAt: Date | null;
  serviceAreaKey: string;
  serviceAreaOpen: boolean;
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  notes?: string | null;
}

export interface ValidatedLine {
  productId: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  notes: string | null;
}

export type LineRejection = {
  productId: string;
  reason: 'not_found' | 'unavailable' | 'area_closed' | 'invalid_quantity';
  areaKey?: string;
};

export type OrderValidation =
  | { ok: true; lines: ValidatedLine[]; totalCents: number }
  | { ok: false; rejected: LineRejection[] };

/**
 * BR-11 / BR-12 / BR-15 — valida itens contra o catálogo e produz snapshots.
 * Preço nunca vem do cliente.
 */
export function validateOrderLines(
  lines: OrderLineInput[],
  catalog: ReadonlyMap<string, CatalogProduct>,
): OrderValidation {
  const rejected: LineRejection[] = [];
  const validated: ValidatedLine[] = [];

  if (lines.length === 0 || lines.length > RULES.ORDER_MAX_ITEMS) {
    return { ok: false, rejected: [{ productId: '*', reason: 'invalid_quantity' }] };
  }

  for (const line of lines) {
    const p = catalog.get(line.productId);
    if (!p || p.deletedAt) {
      rejected.push({ productId: line.productId, reason: 'not_found' });
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > RULES.ORDER_ITEM_MAX_QTY) {
      rejected.push({ productId: line.productId, reason: 'invalid_quantity' });
      continue;
    }
    if (!p.serviceAreaOpen) {
      rejected.push({ productId: line.productId, reason: 'area_closed', areaKey: p.serviceAreaKey });
      continue;
    }
    if (!p.isAvailable) {
      rejected.push({ productId: line.productId, reason: 'unavailable' });
      continue;
    }
    validated.push({
      productId: p.id,
      productNameSnapshot: p.name,
      unitPriceCentsSnapshot: p.priceCents,
      quantity: line.quantity,
      notes: line.notes?.trim() || null,
    });
  }

  if (rejected.length > 0) return { ok: false, rejected };
  const totalCents = validated.reduce((sum, l) => sum + l.unitPriceCentsSnapshot * l.quantity, 0);
  return { ok: true, lines: validated, totalCents };
}
