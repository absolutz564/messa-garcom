'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { Category, Product, ServiceArea, UpsertProduct } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { money, parseMoney } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, ListRow, PageTitle, Select, Textarea } from '@/components/ui';
import { ImageUpload } from '@/components/image-upload';
import { useDialog } from '@/components/dialog';

type ProductForm = {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  serviceAreaId: string;
  imageUrl: string | null;
  isAvailable: boolean;
};

const emptyProduct = (categoryId = '', serviceAreaId = ''): ProductForm => ({
  name: '',
  description: '',
  price: '',
  categoryId,
  serviceAreaId,
  imageUrl: null,
  isAvailable: true,
});

export default function MenuPage() {
  const dialog = useDialog();
  const categories = useApi<Category[]>('/admin/categories');
  const products = useApi<Product[]>('/admin/products');
  const areas = useApi<ServiceArea[]>('/admin/service-areas');
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kitchenId = areas.data?.find((a) => a.key === 'kitchen')?.id ?? '';
  const byCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products.data ?? []) map.set(p.categoryId, [...(map.get(p.categoryId) ?? []), p]);
    return map;
  }, [products.data]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/admin/categories', { method: 'POST', body: { name: newCategory, sortOrder: categories.data?.length ?? 0 } });
      setNewCategory('');
      await categories.reload();
    });
  }

  async function saveProduct(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const priceCents = parseMoney(editing.price);
    if (priceCents === null) return setError('Preço inválido');
    const body: UpsertProduct = {
      name: editing.name,
      description: editing.description.trim() || null,
      priceCents,
      categoryId: editing.categoryId,
      serviceAreaId: editing.serviceAreaId,
      imageUrl: editing.imageUrl,
      isAvailable: editing.isAvailable,
    };
    await run(async () => {
      if (editing.id) await api(`/admin/products/${editing.id}`, { method: 'PATCH', body });
      else await api('/admin/products', { method: 'POST', body });
      setEditing(null);
      await products.reload();
    });
  }

  function edit(p: Product) {
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      price: (p.priceCents / 100).toFixed(2).replace('.', ','),
      categoryId: p.categoryId,
      serviceAreaId: p.serviceAreaId,
      imageUrl: p.imageUrl,
      isAvailable: p.isAvailable,
    });
  }

  return (
    <>
      <PageTitle actions={<Button onClick={() => setEditing(emptyProduct(categories.data?.[0]?.id ?? '', kitchenId))} disabled={!categories.data?.length}>+ Produto</Button>}>
        Cardápio
      </PageTitle>
      <ErrorText>{error ?? categories.error ?? products.error}</ErrorText>

      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {categories.data?.map((c) => (
            <Card key={c.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {c.name} {!c.isActive && <Badge>oculta</Badge>}
                </h2>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" onClick={() => run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }).then(categories.reload))}>
                    {c.isActive ? 'Ocultar' : 'Mostrar'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const name = await dialog.prompt({ title: 'Renomear categoria', label: 'Nome', initial: c.name, maxLength: 60, confirmLabel: 'Salvar' });
                      if (name && name !== c.name) void run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { name } }).then(categories.reload));
                    }}
                  >
                    Renomear
                  </Button>
                  <Button variant="ghost" onClick={async () => (await dialog.confirm({ title: `Excluir a categoria "${c.name}"?`, body: 'Só é possível excluir categorias sem produtos.', confirmLabel: 'Excluir', danger: true })) && run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }).then(categories.reload))}>
                    Excluir
                  </Button>
                </div>
              </div>
              <ul className="divide-y divide-neutral-100">
                {(byCategory.get(c.id) ?? []).map((p) => (
                  <ListRow
                    key={p.id}
                    actions={
                      <>
                        {/* No celular o preço desce junto com os botões; no desktop fica antes deles. */}
                        <span className="mr-auto text-sm font-medium sm:mr-0">{money(p.priceCents)}</span>
                        <Button variant="ghost" onClick={() => run(() => api(`/admin/products/${p.id}`, { method: 'PATCH', body: { isAvailable: !p.isAvailable } }).then(products.reload))}>
                          {p.isAvailable ? 'Esgotar' : 'Disponível'}
                        </Button>
                        <Button variant="secondary" onClick={() => edit(p)}>
                          Editar
                        </Button>
                      </>
                    }
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{p.name}</span>
                        <Badge tone={p.serviceAreaKey === 'kitchen' ? 'amber' : 'neutral'}>{p.serviceAreaKey === 'kitchen' ? 'Cozinha' : 'Bar'}</Badge>
                        {!p.isAvailable && <Badge tone="red">Indisponível</Badge>}
                      </div>
                      {p.description && <p className="truncate text-xs text-neutral-500">{p.description}</p>}
                    </div>
                  </ListRow>
                ))}
                {(byCategory.get(c.id) ?? []).length === 0 && <li className="py-3 text-sm text-neutral-400">Sem produtos.</li>}
              </ul>
            </Card>
          ))}
          <Card>
            <form onSubmit={addCategory} className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Nova categoria (ex.: Hambúrgueres)" required value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <Button type="submit" variant="secondary">
                Adicionar
              </Button>
            </form>
          </Card>
        </div>

        {editing && (
          <Card className="h-fit md:sticky md:top-6">
            <h2 className="mb-3 font-semibold">{editing.id ? 'Editar produto' : 'Novo produto'}</h2>
            <form onSubmit={saveProduct} className="space-y-3">
              <Field label="Nome">
                <Input required maxLength={80} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Descrição (opcional)" hint="Ingredientes, peso, acompanhamentos…">
                <Textarea maxLength={500} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <Field label="Preço (R$)">
                <Input required inputMode="decimal" placeholder="29,90" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </Field>
              <Field label="Categoria">
                <Select required value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Preparado por" hint="Produtos da cozinha ficam bloqueados quando a cozinha encerra">
                <Select required value={editing.serviceAreaId} onChange={(e) => setEditing({ ...editing, serviceAreaId: e.target.value })}>
                  {areas.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Foto">
                <ImageUpload value={editing.imageUrl} onChange={(url) => setEditing({ ...editing, imageUrl: url })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.isAvailable} onChange={(e) => setEditing({ ...editing, isAvailable: e.target.checked })} />
                Disponível
              </label>
              <div className="flex justify-between gap-2 pt-2">
                {editing.id ? (
                  <Button type="button" variant="danger" onClick={async () => (await dialog.confirm({ title: `Remover "${editing.name}" do cardápio?`, body: 'Pedidos já feitos continuam registrados. Esta ação não pode ser desfeita.', confirmLabel: 'Remover', danger: true })) && run(() => api(`/admin/products/${editing.id}`, { method: 'DELETE' }).then(() => { setEditing(null); return products.reload(); }))}>
                    Remover
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar</Button>
                </div>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
