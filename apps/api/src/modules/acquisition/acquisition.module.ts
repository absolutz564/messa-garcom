import { Global, Module } from '@nestjs/common';
import { AcquisitionController, ShortLinkController } from './acquisition.controller';
import { AcquisitionService } from './acquisition.service';

/**
 * Global porque os marcos são disparados de onde eles acontecem — identity
 * (cadastrou), ordering (ativou) e billing (pagou) —, e obrigar cada um a
 * importar o módulo só espalharia acoplamento sem ganho nenhum.
 */
@Global()
@Module({ controllers: [AcquisitionController, ShortLinkController], providers: [AcquisitionService], exports: [AcquisitionService] })
export class AcquisitionModule {}
