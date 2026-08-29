import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Uso: @Body(new ZodPipe(Schema)) body: z.infer<typeof Schema> */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
