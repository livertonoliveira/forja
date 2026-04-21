// negative fixture: NestJS @Get WITH @CacheKey
import { Controller, Get } from '@nestjs/common';

@Controller('products')
class ProductsController {
  @CacheKey('all-products')
  @Get('/')
  async getAll() {
    return [];
  }
}
