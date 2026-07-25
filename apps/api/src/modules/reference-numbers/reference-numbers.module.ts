import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReferenceNumbersService } from './reference-numbers.service';

@Module({
  imports: [PrismaModule],
  providers: [ReferenceNumbersService],
  exports: [ReferenceNumbersService],
})
export class ReferenceNumbersModule {}
