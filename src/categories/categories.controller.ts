import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=86400')
  async findAll(): Promise<unknown[]> {
    return this.categoriesService.findAll();
  }
}
