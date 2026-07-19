import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment, LabFile, PreAuth, VisitRecord } from '../entities';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VisitRecord, Appointment, PreAuth, LabFile]),
    EmbeddingModule,
  ],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
