import { PartialType } from '@nestjs/mapped-types';
import { CreateIncomeDto } from './create-income.dto.js';

export class UpdateIncomeDto extends PartialType(CreateIncomeDto) {}
