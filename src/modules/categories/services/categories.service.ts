import { Injectable } from '@nestjs/common';
import { CategoriesRepository } from '../../../shared/database/repositories/categories.repositories';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { VerifyCategoryOwnershipService } from './verify-category-ownership.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepo: CategoriesRepository,
    private readonly verifyCategoryOwnership: VerifyCategoryOwnershipService,
  ) {}

  async create(userId: string, createCategoryDto: CreateCategoryDto) {
    const { name, icon, type, estimatedValue } = createCategoryDto;

    return this.categoriesRepo.create({
      data: {
        userId,
        name,
        icon,
        type,
        estimatedValue,
      },
    });
  }

  findAllByUserId(userId: string) {
    return this.categoriesRepo.findMany({
      where: {
        userId,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(
    userId: string,
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
  ) {
    await this.verifyCategoryOwnership.validate(userId, categoryId);

    const { name, icon, type, estimatedValue } = updateCategoryDto;
    return this.categoriesRepo.update({
      where: {
        id: categoryId,
        userId,
      },
      data: {
        icon,
        name,
        type,
        estimatedValue,
      },
    });
  }

  async remove(userId: string, categoryId: string) {
    await this.verifyCategoryOwnership.validate(userId, categoryId);

    await this.categoriesRepo.delete({
      where: {
        id: categoryId,
        userId,
      },
    });

    return null;
  }
}
