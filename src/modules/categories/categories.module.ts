import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './services/categories.service';
import { VerifyCategoryOwnershipService } from './services/verify-category-ownership.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, VerifyCategoryOwnershipService],
  exports: [VerifyCategoryOwnershipService],
})
export class CategoriesModule {}
