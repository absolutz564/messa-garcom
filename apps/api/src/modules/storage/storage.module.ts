import { BadRequestException, Controller, Inject, Injectable, Module, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/config';

/** Port de storage (RNF-13). MVP: disco local servido pelo próprio API. Futuro: R2. */
export interface StoragePort {
  putImage(tenantId: string, buffer: Buffer): Promise<{ url: string }>;
}
export const STORAGE = Symbol('STORAGE');

/** Em produção: volume persistente (fly.toml → /data/uploads). Local: apps/api/uploads. */
export const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve(process.cwd(), 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class LocalDiskStorage implements StoragePort {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async putImage(tenantId: string, buffer: Buffer) {
    // Reprocessa a imagem (remove metadados/payloads) e normaliza para webp ≤ 1024px (threat-model).
    const out = await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const name = `${uuidv7()}.webp`;
    const dir = path.join(UPLOADS_DIR, tenantId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), out);
    return { url: `${this.config.API_PUBLIC_URL}/uploads/${tenantId}/${name}` };
  }
}

@Controller('admin/uploads')
export class UploadsController {
  constructor(@Inject(STORAGE) private readonly storage: StoragePort) {}

  /** multipart/form-data, campo `file`. Responde { url }. */
  @Post()
  @Roles('admin')
  async upload(@CurrentPrincipal() p: StaffPrincipal, @Req() req: FastifyRequest) {
    const file = await (req as FastifyRequest & { file: () => Promise<{ toBuffer(): Promise<Buffer>; mimetype: string } | undefined> }).file();
    if (!file) throw new BadRequestException({ code: 'validation', message: 'Arquivo ausente (campo "file")' });
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      throw new BadRequestException({ code: 'validation', message: 'Formato de imagem não suportado' });
    }
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_BYTES) throw new BadRequestException({ code: 'validation', message: 'Imagem acima de 5 MB' });
    try {
      return await this.storage.putImage(p.tenantId!, buffer);
    } catch {
      throw new BadRequestException({ code: 'validation', message: 'Imagem inválida' });
    }
  }
}

@Module({
  controllers: [UploadsController],
  providers: [{ provide: STORAGE, useClass: LocalDiskStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
