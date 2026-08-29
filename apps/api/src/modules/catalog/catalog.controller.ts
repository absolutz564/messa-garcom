import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  PatchProductSchema,
  ServiceAreaKeySchema,
  SetServiceAreaOpenSchema,
  UpsertCategorySchema,
  UpsertProductSchema,
  type UpsertCategory,
  type UpsertProduct,
} from '@messa/contracts';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { CatalogService } from './catalog.service';

const actor = (p: StaffPrincipal) => ({ kind: 'staff' as const, id: p.userId });

@Controller('admin')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ----- áreas de serviço: admin e operador (auth.md) -----
  @Get('service-areas')
  @Roles('operator', 'waiter')
  listAreas(@CurrentPrincipal() p: StaffPrincipal) {
    return this.catalog.listAreas(p.tenantId!);
  }

  @Patch('service-areas/:key')
  @Roles('operator')
  setAreaOpen(
    @CurrentPrincipal() p: StaffPrincipal,
    @Param('key', new ZodPipe(ServiceAreaKeySchema)) key: 'kitchen' | 'bar',
    @Body(new ZodPipe(SetServiceAreaOpenSchema)) body: { isOpen: boolean },
  ) {
    return this.catalog.setAreaOpen(p.tenantId!, key, body.isOpen, actor(p));
  }

  // ----- categorias: somente admin -----
  @Get('categories')
  @Roles('operator', 'waiter')
  listCategories(@CurrentPrincipal() p: StaffPrincipal) {
    return this.catalog.listCategories(p.tenantId!);
  }

  @Post('categories')
  @Roles('admin')
  createCategory(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(UpsertCategorySchema)) body: UpsertCategory) {
    return this.catalog.createCategory(p.tenantId!, body, actor(p));
  }

  @Patch('categories/:id')
  @Roles('admin')
  updateCategory(
    @CurrentPrincipal() p: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpsertCategorySchema.partial())) body: Partial<UpsertCategory>,
  ) {
    return this.catalog.updateCategory(p.tenantId!, id, body, actor(p));
  }

  @Delete('categories/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteCategory(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteCategory(p.tenantId!, id, actor(p));
  }

  // ----- produtos -----
  @Get('products')
  @Roles('operator', 'waiter')
  listProducts(@CurrentPrincipal() p: StaffPrincipal) {
    return this.catalog.listProducts(p.tenantId!);
  }

  @Post('products')
  @Roles('admin')
  createProduct(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(UpsertProductSchema)) body: UpsertProduct) {
    return this.catalog.createProduct(p.tenantId!, body, actor(p));
  }

  @Patch('products/:id')
  @Roles('admin')
  updateProduct(
    @CurrentPrincipal() p: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PatchProductSchema)) body: Partial<UpsertProduct>,
  ) {
    return this.catalog.updateProduct(p.tenantId!, id, body, actor(p));
  }

  @Delete('products/:id')
  @Roles('admin')
  @HttpCode(204)
  deleteProduct(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteProduct(p.tenantId!, id, actor(p));
  }
}
