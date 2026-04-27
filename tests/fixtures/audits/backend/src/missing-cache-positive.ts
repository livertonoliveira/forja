// positive fixture: NestJS @Get without @CacheKey
import { Controller, Get } from '@nestjs/common';

@Controller('products')
class ProductsController {
  @Get('/')
  async getAll() {
    return [];
  }
}
